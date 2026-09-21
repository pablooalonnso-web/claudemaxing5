// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./VertexAllocatorV1.sol";

/**
 * VertexStaking: stake VERTEX to vote and to earn the stakers' share of the
 * allocator fee.
 *
 *   - Voting power is the staked balance, checkpointed by timestamp, so a
 *     governance proposal counts what each account had staked at its
 *     snapshot and a token cannot vote twice by changing hands.
 *   - Unstaking removes the votes at once and returns the tokens after a
 *     7 day cooldown, so nobody can stake, vote and leave in one block.
 *   - Rewards arrive in USDG from the fee splitter and accrue per staked
 *     token; claim them whenever you like. Unstaked tokens in cooldown earn
 *     nothing.
 *
 * The governor address can only replace the rewarder and itself; it holds no
 * power over anyone's stake.
 */
contract VertexStaking {
    IERC20 public immutable VERTEX;
    IERC20 public immutable USDG;
    uint256 public constant COOLDOWN = 7 days;
    uint256 private constant PRECISION = 1e36; // USDG has 6 decimals against VERTEX's 18: a wide scale keeps small rewards from rounding to nothing

    address public governor;
    address public rewarder; // the fee splitter

    uint256 public totalStaked;
    mapping(address => uint256) public staked;

    struct Checkpoint {
        uint64 at;
        uint192 votes;
    }
    mapping(address => Checkpoint[]) private _checkpoints;
    Checkpoint[] private _totalCheckpoints;

    struct Pending {
        uint256 amount;
        uint64 readyAt;
    }
    mapping(address => Pending) public pending;

    uint256 public rewardPerToken; // USDG (6dp) per staked VERTEX (18dp), scaled by PRECISION
    mapping(address => uint256) public rewardPerTokenPaid;
    mapping(address => uint256) public rewards;
    uint256 public totalRewards;

    event Staked(address indexed account, uint256 amount);
    event Unstaked(address indexed account, uint256 amount, uint256 readyAt);
    event Withdrawn(address indexed account, uint256 amount);
    event RewardAdded(uint256 amount, uint256 rewardPerToken);
    event RewardPaid(address indexed account, uint256 amount);
    event GovernorSet(address governor);
    event RewarderSet(address rewarder);

    error ZeroAmount();
    error ZeroAddress();
    error NotGovernor();
    error NotRewarder();
    error InsufficientStake();
    error NothingPending();
    error StillCooling();
    error NoStake();
    error TransferFailed();
    error FutureLookup();
    error Reentrancy();

    uint256 private _lock = 1;
    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }
    modifier onlyGovernor() {
        if (msg.sender != governor) revert NotGovernor();
        _;
    }

    constructor(address vertex, address usdg, address governor_) {
        if (vertex == address(0) || usdg == address(0) || governor_ == address(0)) revert ZeroAddress();
        VERTEX = IERC20(vertex);
        USDG = IERC20(usdg);
        governor = governor_;
        emit GovernorSet(governor_);
    }

    // ------------------------------------------------------------------ staking
    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _updateReward(msg.sender);
        if (!VERTEX.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        staked[msg.sender] += amount;
        totalStaked += amount;
        _checkpoint(msg.sender, staked[msg.sender]);
        _checkpointTotal(totalStaked);
        emit Staked(msg.sender, amount);
    }

    /// Votes leave now; the tokens can be withdrawn after the cooldown. A new unstake restarts the clock for the whole pending amount.
    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (staked[msg.sender] < amount) revert InsufficientStake();
        _updateReward(msg.sender);
        staked[msg.sender] -= amount;
        totalStaked -= amount;
        _checkpoint(msg.sender, staked[msg.sender]);
        _checkpointTotal(totalStaked);
        Pending storage p = pending[msg.sender];
        p.amount += amount;
        p.readyAt = uint64(block.timestamp + COOLDOWN);
        emit Unstaked(msg.sender, amount, p.readyAt);
    }

    function withdraw() external nonReentrant {
        Pending memory p = pending[msg.sender];
        if (p.amount == 0) revert NothingPending();
        if (block.timestamp < p.readyAt) revert StillCooling();
        delete pending[msg.sender];
        if (!VERTEX.transfer(msg.sender, p.amount)) revert TransferFailed();
        emit Withdrawn(msg.sender, p.amount);
    }

    // ------------------------------------------------------------------ rewards
    function earned(address account) public view returns (uint256) {
        return rewards[account] + (staked[account] * (rewardPerToken - rewardPerTokenPaid[account])) / PRECISION;
    }

    function claim() external nonReentrant returns (uint256 amount) {
        _updateReward(msg.sender);
        amount = rewards[msg.sender];
        if (amount == 0) return 0;
        rewards[msg.sender] = 0;
        if (!USDG.transfer(msg.sender, amount)) revert TransferFailed();
        emit RewardPaid(msg.sender, amount);
    }

    /// The fee splitter hands over USDG; it is spread over everyone staked right now.
    function notifyReward(uint256 amount) external nonReentrant {
        if (msg.sender != rewarder) revert NotRewarder();
        if (amount == 0) revert ZeroAmount();
        if (totalStaked == 0) revert NoStake();
        if (!USDG.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        rewardPerToken += (amount * PRECISION) / totalStaked;
        totalRewards += amount;
        emit RewardAdded(amount, rewardPerToken);
    }

    function _updateReward(address account) internal {
        rewards[account] = earned(account);
        rewardPerTokenPaid[account] = rewardPerToken;
    }

    // ------------------------------------------------------------------ votes
    function getVotes(address account) external view returns (uint256) {
        return staked[account];
    }

    /// Staked balance of `account` at `timestamp`, which must be in the past.
    function getPastVotes(address account, uint256 timestamp) external view returns (uint256) {
        if (timestamp >= block.timestamp) revert FutureLookup();
        return _lookup(_checkpoints[account], timestamp);
    }

    function getPastTotalSupply(uint256 timestamp) external view returns (uint256) {
        if (timestamp >= block.timestamp) revert FutureLookup();
        return _lookup(_totalCheckpoints, timestamp);
    }

    function checkpointCount(address account) external view returns (uint256) {
        return _checkpoints[account].length;
    }

    function _checkpoint(address account, uint256 votes) internal {
        _push(_checkpoints[account], votes);
    }

    function _checkpointTotal(uint256 votes) internal {
        _push(_totalCheckpoints, votes);
    }

    function _push(Checkpoint[] storage list, uint256 votes) internal {
        uint256 n = list.length;
        if (n > 0 && list[n - 1].at == uint64(block.timestamp)) {
            list[n - 1].votes = uint192(votes);
        } else {
            list.push(Checkpoint({at: uint64(block.timestamp), votes: uint192(votes)}));
        }
    }

    /// Latest checkpoint at or before `timestamp`, zero when none.
    function _lookup(Checkpoint[] storage list, uint256 timestamp) internal view returns (uint256) {
        uint256 lo = 0;
        uint256 hi = list.length;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (list[mid].at > timestamp) hi = mid;
            else lo = mid + 1;
        }
        return lo == 0 ? 0 : list[lo - 1].votes;
    }

    // ------------------------------------------------------------------ governance wiring
    function setRewarder(address rewarder_) external onlyGovernor {
        if (rewarder_ == address(0)) revert ZeroAddress();
        rewarder = rewarder_;
        emit RewarderSet(rewarder_);
    }

    function setGovernor(address governor_) external onlyGovernor {
        if (governor_ == address(0)) revert ZeroAddress();
        governor = governor_;
        emit GovernorSet(governor_);
    }
}
