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
        uint8 stopAfter; // 0 deploy, 1 deposit, 2 limits, 3 allocate, 4 withdraw, 5 everything
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
        require(a != address(0), "deploy failed");
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

        require(r.weightError == VertexAllocatorV1.WeightExceeded.selector, "weight limit not enforced");
        require(r.receiverError == VertexAllocatorV1.BadReceiver.selector, "receiver check not enforced");
        require(r.strangerError == VertexAllocatorV1.NotKeeper.selector, "keeper check not enforced");
        // timelock: a raise of the cap is queued, cannot run early, and a non-delayed selector cannot be queued at all
        bytes memory raise = abi.encodeCall(alloc.setDepositCap, (10_000e6));
        alloc.propose(raise);
        try alloc.execute(raise) { revert("timelock bypassed"); } catch (bytes memory err) { require(bytes4(err) == VertexAllocatorV1.TooEarly.selector, "wrong timelock error"); }
        try alloc.propose(abi.encodeCall(alloc.pause, ())) { revert("non-delayed selector queued"); } catch (bytes memory err) { require(bytes4(err) == VertexAllocatorV1.NotDelayed.selector, "wrong propose error"); }
        require(alloc.depositCap() == 5_000e6, "cap changed early");
        if (p.stopAfter == 2) return r;

        // 3. allocate through the real router
        r.vaultSharesAfterAllocate = alloc.allocate(p.vault, p.entry);
        r.valueOfTarget = alloc.valueOf(p.vault);
        r.idleAfterAllocate = alloc.idleAssets();
        r.totalAssetsAfterAllocate = alloc.totalAssets();
        require(r.totalAssetsAfterAllocate * 10_000 >= r.idleAfterDeposit * (10_000 - alloc.maxLossBps()), "entry lost more than the limit");
        try alloc.allocate(p.vault, p.entry) { revert("cooldown not enforced"); } catch (bytes memory err) { require(bytes4(err) == VertexAllocatorV1.Cooldown.selector, "wrong cooldown error"); }
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
        r.deallocatedOut = alloc.deallocate(p.vault, remaining, r.deallocateMinimum, p.deadline, p.configuration, IRouter.ExitSwap({minOut: minOut, sqrtLimit: p.exitSqrtLimit, route: ""}));

        require(r.deallocatedOut >= r.deallocateMinimum, "exit below floor");
        r.totalAssetsEnd = alloc.totalAssets();
        r.supplyEnd = alloc.totalSupply();
        r.pricePerShareEnd = alloc.convertToAssets(1e12);
    }
}

contract Stranger {
    function poke(VertexAllocatorV1 alloc, address vault, IRouter.Entry calldata entry) external {
        alloc.allocate(vault, entry);
    }
}
