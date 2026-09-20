// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VertexAllocatorV1, IRouter, IManagedVault, IValuation, IERC20} from "../VertexAllocatorV1.sol";

/**
 * End-to-end scenario for VertexAllocatorV1, meant to run inside one
 * eth_call with this contract's code injected through a state override and a
 * USDG balance granted the same way. Nothing is deployed or signed.
 *
 * It deploys the allocator, deposits, checks that the limits reject a move
 * that breaks them, allocates through the real router, withdraws in kind and
 * brings the rest back to USDG through the router's protected swap.
 */
contract AllocatorScenario {
    struct Params {
        bytes creation; // allocator creation code with constructor arguments
        address usdg;
        address treasury;
        address vault;
        uint256 depositAmount;
        IRouter.Entry entry; // allocation built off chain for this contract's allocator
        uint256 bigBudget; // a budget that must fail the weight limit
        bool stockIsToken0;
        uint16 swapLossBps;
        uint160 exitSqrtLimit;
        uint256 deadline;
        uint256 configuration;
        uint8 stopAfter; // 0 deploy, 1 deposit, 2 limits, 3 allocate, 4 withdraw, 5 everything; 21 to 26 stop inside stage 2
    }

    struct Result {
        address allocator;
        uint256 sharesMinted;
        uint256 feePaid;
        uint256 idleAfterDeposit;
        bytes4 weightError;
        bytes4 receiverError;
        bytes4 strangerError;
        uint256 vaultSharesAfterAllocate;
        uint256 valueOfTarget;
        uint256 idleAfterAllocate;
        uint256 totalAssetsAfterAllocate;
        uint256 withdrawIdleOut;
        uint256 withdrawVaultSharesOut;
        uint256 deallocateExpected;
        uint256 deallocateMinimum;
        uint256 deallocatedOut;
        uint256 totalAssetsEnd;
        uint256 supplyEnd;
        uint256 pricePerShareEnd; // USDG (6dp) per 1e12 shares
        string note; // first failed check, empty when everything held (the RPC returns no revert data, so we report instead)
    }

    function ping() external pure returns (uint256) {
        return 1;
    }

    function run(Params calldata p) external returns (Result memory r) {
        address a;
        bytes memory creation = p.creation;
        assembly {
            a := create(0, add(creation, 0x20), mload(creation))
        }
        if (!(a != address(0))) { r.note = "deploy failed"; return r; }
        VertexAllocatorV1 alloc = VertexAllocatorV1(a);
        r.allocator = a;
        if (p.stopAfter == 0) return r;

        // 1. deposit
        uint256 treasuryBefore = IERC20(p.usdg).balanceOf(p.treasury);
        IERC20(p.usdg).approve(a, p.depositAmount);
        r.sharesMinted = alloc.deposit(p.depositAmount, address(this));
        r.feePaid = IERC20(p.usdg).balanceOf(p.treasury) - treasuryBefore;
        r.idleAfterDeposit = alloc.idleAssets();
        if (p.stopAfter == 1) return r;

        // 2. limits: a budget above the maximum weight, a foreign receiver, a stranger calling
        IRouter.Entry memory big = p.entry;
        big.budget = p.bigBudget;
        try alloc.allocate(p.vault, big) {
            r.weightError = 0x00000000;
        } catch (bytes memory err) {
            r.weightError = bytes4(err);
        }
        IRouter.Entry memory foreign = p.entry;
        foreign.join.receiver = address(this);
        try alloc.allocate(p.vault, foreign) {
            r.receiverError = 0x00000000;
        } catch (bytes memory err) {
            r.receiverError = bytes4(err);
        }
        try new Stranger().poke(alloc, p.vault, p.entry) {
            r.strangerError = 0x00000000;
        } catch (bytes memory err) {
            r.strangerError = bytes4(err);
        }

        if (!(r.weightError == VertexAllocatorV1.WeightExceeded.selector)) { r.note = "weight limit not enforced"; return r; }
        if (!(r.receiverError == VertexAllocatorV1.BadReceiver.selector)) { r.note = "receiver check not enforced"; return r; }
        if (!(r.strangerError == VertexAllocatorV1.NotKeeper.selector)) { r.note = "keeper check not enforced"; return r; }
        if (p.stopAfter == 21) return r;
        // timelock: a raise of the cap is queued, cannot run early, and a non-delayed selector cannot be queued at all
        bytes memory raise = abi.encodeCall(alloc.setDepositCap, (10_000e6));
        alloc.propose(raise);
        if (p.stopAfter == 22) return r;
        try alloc.execute(raise) { { r.note = "timelock bypassed"; return r; } } catch (bytes memory err) { if (!(bytes4(err) == VertexAllocatorV1.TooEarly.selector)) { r.note = "wrong timelock error"; return r; } }
        if (p.stopAfter == 23) return r;
        try alloc.propose(abi.encodeCall(alloc.pause, ())) { { r.note = "non-delayed selector queued"; return r; } } catch (bytes memory err) { if (!(bytes4(err) == VertexAllocatorV1.NotDelayed.selector)) { r.note = "wrong propose error"; return r; } }
        if (p.stopAfter == 24) return r;
        if (!(alloc.depositCap() == 5_000e6)) { r.note = "cap changed early"; return r; }
        if (p.stopAfter == 25) return r;
        try alloc.sweep(alloc.stockList(0)) { { r.note = "stock sweepable"; return r; } } catch (bytes memory err) { if (!(bytes4(err) == VertexAllocatorV1.CoreToken.selector)) { r.note = "wrong sweep error"; return r; } }
        if (p.stopAfter == 26) return r;
        try alloc.unpause(alloc.pauseEpoch()) { { r.note = "unpause immediate"; return r; } } catch (bytes memory err) { if (!(bytes4(err) == VertexAllocatorV1.NotSelf.selector)) { r.note = "wrong unpause error"; return r; } }
        // a resume cannot be queued while nothing is paused, nor for a pause that does not exist yet
        bytes memory early = abi.encodeCall(alloc.unpause, (alloc.pauseEpoch() + 1));
        try alloc.propose(early) { { r.note = "unpause queued ahead of a pause"; return r; } } catch (bytes memory err) { if (!(bytes4(err) == VertexAllocatorV1.NotQueued.selector)) { r.note = "wrong early unpause error"; return r; } }
        if (p.stopAfter == 2) return r;

        // 3. allocate through the real router
        r.vaultSharesAfterAllocate = alloc.allocate(p.vault, p.entry);
        r.valueOfTarget = alloc.valueOf(p.vault);
        r.idleAfterAllocate = alloc.idleAssets();
        r.totalAssetsAfterAllocate = alloc.totalAssets();
        if (!(r.totalAssetsAfterAllocate * 10_000 >= r.idleAfterDeposit * (10_000 - alloc.maxLossBps()))) { r.note = "entry lost more than the limit"; return r; }
        try alloc.dropTarget(p.vault) { { r.note = "drop with residue"; return r; } } catch (bytes memory err) { if (!(bytes4(err) == VertexAllocatorV1.StillHeld.selector || bytes4(err) == VertexAllocatorV1.UnknownTarget.selector)) { r.note = "wrong drop error"; return r; } }
        try alloc.allocate(p.vault, p.entry) { { r.note = "cooldown not enforced"; return r; } } catch (bytes memory err) { if (!(bytes4(err) == VertexAllocatorV1.Cooldown.selector)) { r.note = "wrong cooldown error"; return r; } }
        if (p.stopAfter == 3) return r;

        // 4. withdraw half in kind
        uint256 vsBefore = IManagedVault(p.vault).balanceOf(address(this));
        address[] memory none;
        r.withdrawIdleOut = alloc.withdraw(r.sharesMinted / 2, address(this), none);
        r.withdrawVaultSharesOut = IManagedVault(p.vault).balanceOf(address(this)) - vsBefore;
        if (p.stopAfter == 4) return r;

        // 5. bring the remaining position back to USDG
        uint256 remaining = IManagedVault(p.vault).balanceOf(a);
        (, uint256 a0, uint256 a1,,) = IManagedVault(p.vault).quote(remaining, 0);
        (, , , , address valuation,) = alloc.targets(p.vault);
        r.deallocateExpected = IValuation(valuation).value(a0, a1);
        uint256 stockValue = IValuation(valuation).value(p.stockIsToken0 ? a0 : 0, p.stockIsToken0 ? 0 : a1);
        uint256 minOut = (stockValue * (10_000 - p.swapLossBps) + 9_999) / 10_000;
        uint256 usdgOut = p.stockIsToken0 ? a1 : a0;
        r.deallocateMinimum = usdgOut + minOut;
        if (r.deallocateMinimum * 10_000 < r.deallocateExpected * (10_000 - alloc.maxLossBps())) r.deallocateMinimum = (r.deallocateExpected * (10_000 - alloc.maxLossBps()) + 9_999) / 10_000;
        // Straight after the allocation the exit must wait the cooldown; the emergency path (paused, owner) does not.
        try alloc.deallocate(p.vault, remaining, r.deallocateMinimum, p.deadline, p.configuration, IRouter.ExitSwap({minOut: minOut, sqrtLimit: p.exitSqrtLimit, route: ""})) { { r.note = "exit cooldown not enforced"; return r; } } catch (bytes memory err) { if (!(bytes4(err) == VertexAllocatorV1.Cooldown.selector)) { r.note = "wrong exit cooldown error"; return r; } }
        alloc.pause();
        if (!(alloc.paused() && alloc.pauseEpoch() == 1)) { r.note = "pause not recorded"; return r; }
        // now a resume for this pause can be queued, and still waits the window
        bytes memory resume = abi.encodeCall(alloc.unpause, (alloc.pauseEpoch()));
        try alloc.propose(resume) {} catch { { r.note = "resume not queueable"; return r; } }
        try alloc.execute(resume) { { r.note = "resume ran early"; return r; } } catch (bytes memory err) { if (!(bytes4(err) == VertexAllocatorV1.TooEarly.selector)) { r.note = "wrong resume error"; return r; } }
        try new Stranger().exit(alloc, p.vault, remaining, r.deallocateMinimum, p.deadline, p.configuration, IRouter.ExitSwap({minOut: minOut, sqrtLimit: p.exitSqrtLimit, route: ""})) { { r.note = "stranger exited while paused"; return r; } } catch (bytes memory err) { if (!(bytes4(err) == VertexAllocatorV1.NotKeeper.selector)) { r.note = "wrong paused exit error"; return r; } }
        r.deallocatedOut = alloc.deallocate(p.vault, remaining, r.deallocateMinimum, p.deadline, p.configuration, IRouter.ExitSwap({minOut: minOut, sqrtLimit: p.exitSqrtLimit, route: ""}));
        if (!(alloc.paused())) { r.note = "still paused"; return r; }

        if (!(r.deallocatedOut >= r.deallocateMinimum)) { r.note = "exit below floor"; return r; }
        // The entry loss counts against the daily budget; the exit ran while paused (emergency path), which does not.
        if (!(alloc.dailyLoss() == r.idleAfterDeposit - r.totalAssetsAfterAllocate)) { r.note = "loss budget not recorded"; return r; }
        if (!(alloc.totalAssets() == alloc.idleAssets() + alloc.valueOf(p.vault) + alloc.dustValueOf(alloc.stockList(0)))) { r.note = "total assets identity"; return r; }
        r.totalAssetsEnd = alloc.totalAssets();
        r.supplyEnd = alloc.totalSupply();
        r.pricePerShareEnd = alloc.convertToAssets(1e12);
    }
}

contract Stranger {
    function poke(VertexAllocatorV1 alloc, address vault, IRouter.Entry calldata entry) external {
        alloc.allocate(vault, entry);
    }

    function exit(VertexAllocatorV1 alloc, address vault, uint256 shares, uint256 minimum, uint256 deadline, uint256 configuration, IRouter.ExitSwap calldata swap) external {
        alloc.deallocate(vault, shares, minimum, deadline, configuration, swap);
    }
}
