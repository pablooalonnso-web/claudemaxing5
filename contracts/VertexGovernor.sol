// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IVotes {
    function getPastVotes(address account, uint256 timestamp) external view returns (uint256);
    function getPastTotalSupply(uint256 timestamp) external view returns (uint256);
}

interface ITimelocked {
    function propose(bytes calldata data) external returns (bytes32);
    function execute(bytes calldata data) external;
    function cancel(bytes calldata data) external;
    function ready(bytes32 hash) external view returns (bool);
    function eta(bytes32 hash) external view returns (uint256);
    function GRACE() external view returns (uint256);
}

/**
 * VertexGovernor: VERTEX stakers decide what the allocator may do and how
 * its fee is split.
 *
 * A proposal names one target and one call. Targets are whitelisted (the
 * allocator, the fee splitter, the staking contract and this governor).
 * Votes are counted at a snapshot one voting delay after the proposal, over
 * a fixed voting period, from the staked balances the staking contract
 * checkpointed. A proposal passes with more for than against and a quorum
 * of the total stake at the snapshot.
 *
 * Two kinds of execution:
 *   - direct: the call runs when the vote passes (fee split, governance
 *     parameters, the allocator's immediate risk reducing controls);
 *   - through the allocator's timelock: the passing vote queues the change
 *     in the allocator, which applies it only after its own 24 hour review
 *     window, when anyone can call finalize. Every parameter of the
 *     allocator therefore waits for a vote and then a review window.
 *
 * A guardian can veto a proposal that has not yet taken effect, including
 * one already queued in the allocator. The guardian is set by governance and
 * is meant to be handed to a multisig or removed as the protocol matures.
 */
contract VertexGovernor {
    IVotes public immutable STAKING;
    ITimelocked public immutable ALLOCATOR;

    uint256 public constant MIN_VOTING_PERIOD = 1 days;
    uint256 public constant MAX_VOTING_PERIOD = 14 days;
    uint256 public constant MAX_VOTING_DELAY = 7 days;
    uint256 public constant MAX_QUORUM_BPS = 2_000; // 20%
    uint256 public constant MAX_THRESHOLD_BPS = 500; // 5%
    uint256 public constant EXECUTION_WINDOW = 14 days; // a passed proposal not executed in time expires

    uint256 public votingDelay = 1 days;
    uint256 public votingPeriod = 3 days;
    uint256 public quorumBps = 400; // 4% of the stake at the snapshot
    uint256 public thresholdBps = 10; // 0.1% of the stake to propose
    address public guardian;
    mapping(address => bool) public allowedTarget;

    enum Support {
        Against,
        For,
        Abstain
    }
    enum State {
        Pending,
        Active,
        Defeated,
        Succeeded,
        Queued, // queued in the allocator's timelock, waiting for its review window
        Executed,
        Canceled,
        Expired
    }

    struct Proposal {
        address proposer;
        address target;
        bool viaTimelock;
        bool executed;
        bool finalized;
        bool canceled;
        uint64 snapshot;
        uint64 end;
        uint256 quorumBps; // fixed when the proposal is made, so a later parameter change cannot flip a finished vote
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        bytes data;
        string description;
    }
    Proposal[] private _proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(uint256 indexed id, address indexed proposer, address indexed target, bool viaTimelock, bytes data, uint256 snapshot, uint256 end, string description);
    event VoteCast(uint256 indexed id, address indexed voter, Support support, uint256 weight);
    event ProposalExecuted(uint256 indexed id);
    event ProposalQueued(uint256 indexed id, bytes32 hash);
    event ProposalFinalized(uint256 indexed id);
    event ProposalCanceled(uint256 indexed id, address by);
    event ParametersSet(uint256 votingDelay, uint256 votingPeriod, uint256 quorumBps, uint256 thresholdBps);
    event GuardianSet(address guardian);
    event TargetAllowed(address target, bool allowed);

    error ZeroAddress();
    error NotSelf();
    error NotGuardian();
    error NotProposer();
    error TargetNotAllowed();
    error TimelockOnlyForAllocator();
    error BelowThreshold();
    error EmptyCall();
    error UnknownProposal();
    error NotActive();
    error AlreadyVoted();
    error NoVotes();
    error NotSucceeded();
    error NotQueued();
    error NotReady();
    error AlreadyDone();
    error CallFailed();
    error BadParameters();
    error AlreadyQueued();

    modifier onlySelf() {
        if (msg.sender != address(this)) revert NotSelf();
        _;
    }

    constructor(address staking, address allocator, address guardian_, address[] memory extraTargets) {
        if (staking == address(0) || allocator == address(0)) revert ZeroAddress();
        STAKING = IVotes(staking);
        ALLOCATOR = ITimelocked(allocator);
        guardian = guardian_;
        allowedTarget[allocator] = true;
        allowedTarget[staking] = true;
        allowedTarget[address(this)] = true;
        emit TargetAllowed(allocator, true);
        emit TargetAllowed(staking, true);
        emit TargetAllowed(address(this), true);
        for (uint256 i = 0; i < extraTargets.length; i++) {
            if (extraTargets[i] == address(0)) revert ZeroAddress();
            allowedTarget[extraTargets[i]] = true;
            emit TargetAllowed(extraTargets[i], true);
        }
        emit GuardianSet(guardian_);
        emit ParametersSet(votingDelay, votingPeriod, quorumBps, thresholdBps);
    }

    // ------------------------------------------------------------------ views
    function proposalCount() external view returns (uint256) {
        return _proposals.length;
    }

    function proposal(uint256 id) external view returns (Proposal memory) {
        if (id >= _proposals.length) revert UnknownProposal();
        return _proposals[id];
    }

    function quorum(uint256 id) public view returns (uint256) {
        if (id >= _proposals.length) revert UnknownProposal();
        Proposal storage p = _proposals[id];
        if (block.timestamp <= p.snapshot) return 0;
        return (STAKING.getPastTotalSupply(p.snapshot) * p.quorumBps) / 10_000;
    }

    function state(uint256 id) public view returns (State) {
        if (id >= _proposals.length) revert UnknownProposal();
        Proposal storage p = _proposals[id];
        if (p.canceled) return State.Canceled;
        if (p.finalized) return State.Executed;
        if (p.executed) {
            if (!p.viaTimelock) return State.Executed;
            // Queued in the allocator: expired once its window there lapsed, or if the queue entry is gone.
            uint256 at = ALLOCATOR.eta(keccak256(p.data));
            if (at == 0 || block.timestamp > at + ALLOCATOR.GRACE()) return State.Expired;
            return State.Queued;
        }
        if (block.timestamp <= p.snapshot) return State.Pending;
        if (block.timestamp < p.end) return State.Active;
        bool passed = p.forVotes > p.againstVotes && p.forVotes + p.abstainVotes >= quorum(id) && p.forVotes > 0;
        if (!passed) return State.Defeated;
        if (block.timestamp > uint256(p.end) + EXECUTION_WINDOW) return State.Expired;
        return State.Succeeded;
    }

    // ------------------------------------------------------------------ lifecycle
    function propose(address target, bytes calldata data, bool viaTimelock, string calldata description) external returns (uint256 id) {
        if (!allowedTarget[target]) revert TargetNotAllowed();
        if (viaTimelock && target != address(ALLOCATOR)) revert TimelockOnlyForAllocator();
        if (data.length < 4) revert EmptyCall();
        uint256 total = STAKING.getPastTotalSupply(block.timestamp - 1);
        uint256 votes = STAKING.getPastVotes(msg.sender, block.timestamp - 1);
        if (votes == 0 || votes * 10_000 < total * thresholdBps) revert BelowThreshold();
        id = _proposals.length;
        uint64 snapshot = uint64(block.timestamp + votingDelay);
        uint64 end = uint64(snapshot + votingPeriod);
        _proposals.push(Proposal({proposer: msg.sender, target: target, viaTimelock: viaTimelock, executed: false, finalized: false, canceled: false, snapshot: snapshot, end: end, quorumBps: quorumBps, forVotes: 0, againstVotes: 0, abstainVotes: 0, data: data, description: description}));
        emit ProposalCreated(id, msg.sender, target, viaTimelock, data, snapshot, end, description);
    }

    function castVote(uint256 id, Support support) external returns (uint256 weight) {
        if (state(id) != State.Active) revert NotActive();
        if (hasVoted[id][msg.sender]) revert AlreadyVoted();
        Proposal storage p = _proposals[id];
        weight = STAKING.getPastVotes(msg.sender, p.snapshot);
        if (weight == 0) revert NoVotes();
        hasVoted[id][msg.sender] = true;
        if (support == Support.For) p.forVotes += weight;
        else if (support == Support.Against) p.againstVotes += weight;
        else p.abstainVotes += weight;
        emit VoteCast(id, msg.sender, support, weight);
    }

    /// Runs a passed proposal: directly, or by queueing it in the allocator's timelock.
    function execute(uint256 id) external {
        if (state(id) != State.Succeeded) revert NotSucceeded();
        Proposal storage p = _proposals[id];
        p.executed = true;
        if (p.viaTimelock) {
            // One queue entry per calldata: a second identical proposal waits until the first is finalized or canceled.
            if (ALLOCATOR.eta(keccak256(p.data)) != 0) revert AlreadyQueued();
            bytes32 hash = ALLOCATOR.propose(p.data);
            emit ProposalQueued(id, hash);
        } else {
            (bool ok,) = p.target.call(p.data);
            if (!ok) revert CallFailed();
            emit ProposalExecuted(id);
        }
    }

    /// After the allocator's review window, anyone applies a queued proposal.
    function finalize(uint256 id) external {
        if (state(id) != State.Queued) revert NotQueued();
        Proposal storage p = _proposals[id];
        if (!ALLOCATOR.ready(keccak256(p.data))) revert NotReady();
        p.finalized = true;
        ALLOCATOR.execute(p.data);
        emit ProposalFinalized(id);
    }

    /// The proposer withdraws a proposal that has not run; the guardian can also veto one queued in the allocator.
    /// A queued proposal whose allocator window lapsed can be closed by either, and its stale queue entry is cleared.
    function cancel(uint256 id) external {
        State s = state(id);
        if (s == State.Executed || s == State.Canceled) revert AlreadyDone();
        Proposal storage p = _proposals[id];
        if (msg.sender != guardian && !(msg.sender == p.proposer && s != State.Queued)) revert NotGuardian();
        p.canceled = true;
        if (p.executed && p.viaTimelock && ALLOCATOR.eta(keccak256(p.data)) != 0) ALLOCATOR.cancel(p.data);
        emit ProposalCanceled(id, msg.sender);
    }

    // ------------------------------------------------------------------ parameters, by proposal only
    function setParameters(uint256 votingDelay_, uint256 votingPeriod_, uint256 quorumBps_, uint256 thresholdBps_) external onlySelf {
        if (votingDelay_ > MAX_VOTING_DELAY || votingPeriod_ < MIN_VOTING_PERIOD || votingPeriod_ > MAX_VOTING_PERIOD || quorumBps_ > MAX_QUORUM_BPS || thresholdBps_ > MAX_THRESHOLD_BPS) revert BadParameters();
        votingDelay = votingDelay_;
        votingPeriod = votingPeriod_;
        quorumBps = quorumBps_;
        thresholdBps = thresholdBps_;
        emit ParametersSet(votingDelay_, votingPeriod_, quorumBps_, thresholdBps_);
    }

    function setGuardian(address guardian_) external onlySelf {
        guardian = guardian_;
        emit GuardianSet(guardian_);
    }

    function setAllowedTarget(address target, bool allowed) external onlySelf {
        if (target == address(0) || target == address(ALLOCATOR) || target == address(this)) revert BadParameters();
        allowedTarget[target] = allowed;
        emit TargetAllowed(target, allowed);
    }
}
