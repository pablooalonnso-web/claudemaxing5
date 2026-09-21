// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VertexAllocatorV1, IERC20} from "../VertexAllocatorV1.sol";
import {VertexStaking} from "../VertexStaking.sol";
import {VertexGovernor} from "../VertexGovernor.sol";
import {VertexFeeSplitter} from "../VertexFeeSplitter.sol";

/**
 * Governance end to end, run as a sequence of eth_simulateV1 blocks with the
 * clock moved forward between stages. This contract's code and its VERTEX
 * and USDG balances are injected through state overrides; nothing is
 * deployed or signed for real. Each stage reports the first failed check in
 * `note` instead of reverting, so the run reads as a checklist.
 */
contract GovernanceScenario {
    struct Params {
        bytes allocatorCreation; // raw creation code, arguments appended here
        bytes stakingCreation;
        bytes governorCreation;
        bytes splitterCreation;
        address vertex;
        address usdg;
        address buyback;
    }

    struct Result {
        address allocator;
        address staking;
        address governor;
        address splitter;
        uint256 a;
        uint256 b;
        uint256 c;
        uint256 d;
        string note;
    }

    VertexAllocatorV1 alloc;
    VertexStaking st;
    VertexGovernor gov;
    VertexFeeSplitter sp;
    IERC20 vertex;
    IERC20 usdg;
    uint256 pA;
    uint256 pB;
    bytes dataA;
    bytes dataB;
    bytes treasuryChange;
    bytes ownerChange;

    uint256 constant STAKE = 1_000_000e18;

    function _deploy(bytes memory code) internal returns (address a) {
        assembly {
            a := create(0, add(code, 0x20), mload(code))
        }
    }

    function _fill(Result memory r) internal view {
        r.allocator = address(alloc);
        r.staking = address(st);
        r.governor = address(gov);
        r.splitter = address(sp);
    }

    /// Deploy everything, hand the allocator's treasury and ownership to governance through its own timelock, stake.
    function stage1(Params calldata p) external returns (Result memory r) {
        vertex = IERC20(p.vertex);
        usdg = IERC20(p.usdg);
        address[] memory none;
        uint16[] memory noWeights;
        alloc = VertexAllocatorV1(_deploy(abi.encodePacked(p.allocatorCreation, abi.encode(p.usdg, address(this), address(this), address(this), address(this), uint256(5_000e6), uint16(30), none, noWeights))));
        st = VertexStaking(_deploy(abi.encodePacked(p.stakingCreation, abi.encode(p.vertex, p.usdg, address(this)))));
        sp = VertexFeeSplitter(_deploy(abi.encodePacked(p.splitterCreation, abi.encode(p.usdg, address(this), p.buyback, address(this), address(st), uint16(3000), uint16(4000), uint16(3000)))));
        address[] memory extra = new address[](1);
        extra[0] = address(sp);
        gov = VertexGovernor(_deploy(abi.encodePacked(p.governorCreation, abi.encode(address(st), address(alloc), address(this), extra))));
        _fill(r);
        if (address(alloc) == address(0) || address(st) == address(0) || address(sp) == address(0) || address(gov) == address(0)) { r.note = "deploy failed"; return r; }
        st.setRewarder(address(sp));
        st.setGovernor(address(gov));
        sp.transferOwnership(address(gov));
        if (!(st.governor() == address(gov) && sp.owner() == address(gov) && st.rewarder() == address(sp))) { r.note = "wiring"; return r; }
        // the allocator's owner (this wallet) queues the hand over: treasury to the splitter, ownership to the governor
        treasuryChange = abi.encodeCall(alloc.setTreasury, (address(sp)));
        ownerChange = abi.encodeCall(alloc.transferOwnership, (address(gov)));
        alloc.propose(treasuryChange);
        alloc.propose(ownerChange);
        // stake
        vertex.approve(address(st), STAKE);
        st.stake(STAKE);
        r.a = st.getVotes(address(this));
        if (!(r.a == STAKE && st.totalStaked() == STAKE)) { r.note = "stake not recorded"; return r; }
        // votes only count from the next block: a proposal right now must fail the threshold
        try gov.propose(address(sp), abi.encodeCall(sp.setSplit, (5000, 3000, 2000)), false, "too early") { r.note = "proposal accepted on same-block stake"; return r; } catch (bytes memory err) { if (bytes4(err) != VertexGovernor.BelowThreshold.selector) { r.note = "wrong threshold error"; return r; } }
        r.b = block.timestamp;
    }

    /// One review window later: the hand over executes, and governance receives its first proposals.
    function stage2() external returns (Result memory r) {
        _fill(r);
        alloc.execute(treasuryChange);
        alloc.execute(ownerChange);
        if (!(alloc.owner() == address(gov) && alloc.treasury() == address(sp))) { r.note = "hand over failed"; return r; }
        try alloc.propose(treasuryChange) { r.note = "old owner still proposes"; return r; } catch (bytes memory err) { if (bytes4(err) != VertexAllocatorV1.NotOwner.selector) { r.note = "wrong owner error"; return r; } }
        dataA = abi.encodeCall(alloc.setDepositCap, (4_000e6));
        dataB = abi.encodeCall(sp.setSplit, (5000, 3000, 2000));
        pA = gov.propose(address(alloc), dataA, true, "Lower the deposit cap to 4,000 USDG");
        pB = gov.propose(address(sp), dataB, false, "Split the fee 50 buyback / 30 stakers / 20 treasury");
        try gov.propose(address(vertex), abi.encodeCall(IERC20.approve, (address(this), 1)), false, "bad target") { r.note = "foreign target accepted"; return r; } catch (bytes memory err) { if (bytes4(err) != VertexGovernor.TargetNotAllowed.selector) { r.note = "wrong target error"; return r; } }
        try gov.propose(address(sp), dataB, true, "timelock on splitter") { r.note = "timelock accepted for non-allocator"; return r; } catch (bytes memory err) { if (bytes4(err) != VertexGovernor.TimelockOnlyForAllocator.selector) { r.note = "wrong timelock target error"; return r; } }
        if (!(gov.state(pA) == VertexGovernor.State.Pending && gov.state(pB) == VertexGovernor.State.Pending)) { r.note = "not pending"; return r; }
        try gov.castVote(pA, VertexGovernor.Support.For) { r.note = "vote accepted before snapshot"; return r; } catch (bytes memory err) { if (bytes4(err) != VertexGovernor.NotActive.selector) { r.note = "wrong early vote error"; return r; } }
        r.a = pA;
        r.b = pB;
        r.c = gov.proposalCount();
    }

    /// Past the snapshot: vote.
    function stage3() external returns (Result memory r) {
        _fill(r);
        if (!(gov.state(pA) == VertexGovernor.State.Active)) { r.note = "not active"; return r; }
        r.a = gov.castVote(pA, VertexGovernor.Support.For);
        r.b = gov.castVote(pB, VertexGovernor.Support.For);
        if (!(r.a == STAKE && r.b == STAKE)) { r.note = "vote weight off"; return r; }
        try gov.castVote(pA, VertexGovernor.Support.Against) { r.note = "double vote"; return r; } catch (bytes memory err) { if (bytes4(err) != VertexGovernor.AlreadyVoted.selector) { r.note = "wrong double vote error"; return r; } }
        try gov.execute(pA) { r.note = "executed while active"; return r; } catch (bytes memory err) { if (bytes4(err) != VertexGovernor.NotSucceeded.selector) { r.note = "wrong early execute error"; return r; } }
        r.c = gov.quorum(pA);
    }

    /// Voting over: execute both, watch the fee flow, start unstaking.
    function stage4() external returns (Result memory r) {
        _fill(r);
        if (!(gov.state(pA) == VertexGovernor.State.Succeeded && gov.state(pB) == VertexGovernor.State.Succeeded)) { r.note = "not succeeded"; return r; }
        gov.execute(pA);
        if (!(gov.state(pA) == VertexGovernor.State.Queued && alloc.eta(keccak256(dataA)) > block.timestamp)) { r.note = "not queued in the allocator"; return r; }
        gov.execute(pB);
        if (!(gov.state(pB) == VertexGovernor.State.Executed && sp.buybackBps() == 5000 && sp.stakersBps() == 3000 && sp.treasuryBps() == 2000)) { r.note = "split not applied"; return r; }
        try gov.finalize(pA) { r.note = "finalized before the review window"; return r; } catch (bytes memory err) { if (bytes4(err) != VertexGovernor.NotReady.selector) { r.note = "wrong finalize error"; return r; } }
        if (!(alloc.depositCap() == 5_000e6)) { r.note = "cap changed early"; return r; }
        // a deposit pays its fee to the splitter, which spreads it
        usdg.approve(address(alloc), 1_000e6);
        alloc.deposit(1_000e6, address(this));
        r.a = sp.pendingDistribution();
        if (!(r.a == 3e6)) { r.note = "fee did not reach the splitter"; return r; }
        uint256 buybackBefore = usdg.balanceOf(sp.buyback());
        uint256 mineBefore = usdg.balanceOf(address(this));
        (uint256 toBuyback, uint256 toStakers, uint256 toTreasury) = sp.distribute();
        if (!(toBuyback == 1_500_000 && toStakers == 900_000 && toTreasury == 600_000)) { r.note = "split amounts off"; return r; }
        if (!(usdg.balanceOf(sp.buyback()) == buybackBefore + 1_500_000 && usdg.balanceOf(address(this)) == mineBefore + 600_000)) { r.note = "split transfers off"; return r; }
        r.b = st.earned(address(this));
        if (!(r.b == 900_000)) { r.note = "stakers reward off"; return r; }
        r.c = st.claim();
        if (!(r.c == 900_000 && usdg.balanceOf(address(this)) == mineBefore + 1_500_000)) { r.note = "claim off"; return r; }
        // start leaving with part of the stake: votes go now, tokens later
        st.unstake(400_000e18);
        if (!(st.getVotes(address(this)) == 600_000e18)) { r.note = "unstake votes"; return r; }
        try st.withdraw() { r.note = "withdrew before cooldown"; return r; } catch (bytes memory err) { if (bytes4(err) != VertexStaking.StillCooling.selector) { r.note = "wrong cooldown error"; return r; } }
        r.d = alloc.totalAssets();
    }

    /// The allocator's review window passed: finalize.
    function stage5() external returns (Result memory r) {
        _fill(r);
        gov.finalize(pA);
        if (!(gov.state(pA) == VertexGovernor.State.Executed && alloc.depositCap() == 4_000e6)) { r.note = "finalize did not apply"; return r; }
        try gov.cancel(pA) { r.note = "cancel after done"; return r; } catch (bytes memory err) { if (bytes4(err) != VertexGovernor.AlreadyDone.selector) { r.note = "wrong cancel error"; return r; } }
        // a guardian veto on a fresh proposal
        uint256 pC = gov.propose(address(sp), abi.encodeCall(sp.setSplit, (10_000, 0, 0)), false, "all to buyback");
        gov.cancel(pC);
        if (!(gov.state(pC) == VertexGovernor.State.Canceled)) { r.note = "veto failed"; return r; }
        r.a = alloc.depositCap();
        r.b = pC;
    }

    /// Cooldown over: the tokens come back.
    function stage6() external returns (Result memory r) {
        _fill(r);
        uint256 before = vertex.balanceOf(address(this));
        st.withdraw();
        r.a = vertex.balanceOf(address(this)) - before;
        if (!(r.a == 400_000e18)) { r.note = "withdraw amount off"; return r; }
        (uint256 amount,) = st.pending(address(this));
        if (!(amount == 0 && st.staked(address(this)) == 600_000e18 && st.totalStaked() == 600_000e18)) { r.note = "stake bookkeeping off"; return r; }
        r.b = st.getPastVotes(address(this), block.timestamp - 1);
        r.c = st.getPastTotalSupply(block.timestamp - 1);
    }
}
