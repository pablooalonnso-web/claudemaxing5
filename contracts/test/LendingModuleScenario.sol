// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {VertexAllocatorV1, IERC20, IRouter} from "../VertexAllocatorV1.sol";
import {VertexLendingModule, ILendingMarket} from "../VertexLendingModule.sol";

/**
 * The lending module as an allocator target, against the real META lending
 * market at a block where its oracle was live: deploy the module, deploy an
 * allocator with the module whitelisted, deposit, allocate into the market,
 * withdraw in kind, redeem module shares directly, and one cooldown later
 * bring the rest back through the allocator's exit path.
 */
contract LendingModuleScenario {
    struct Params {
        bytes moduleCreation;
        bytes allocatorCreation;
        address market;
        address usdg;
        address stock;
        address stockValuation;
        address treasury;
        uint256 depositAmount;
        uint256 marketTopUp; // supplied straight to the market so it clears the allocator's minimum target size
        uint256 budget;
    }

    struct Result {
        address module;
        address allocator;
        uint256 a;
        uint256 b;
        uint256 c;
        uint256 d;
        string note;
    }

    VertexLendingModule mod;
    VertexAllocatorV1 alloc;
    IERC20 usdg;
    uint256 sharesMinted;

    function _deploy(bytes memory code) internal returns (address a) {
        assembly {
            a := create(0, add(code, 0x20), mload(code))
        }
    }

    function _entry(uint256 budget) internal view returns (IRouter.Entry memory e) {
        e.budget = budget;
        e.join.receiver = address(alloc);
        e.join.deadline = block.timestamp + 180;
        e.join.minShares = (_unitsFor(budget) * 9_990) / 10_000;
    }

    function _unitsFor(uint256 amount) internal view returns (uint256) {
        uint256 tss = ILendingMarket(address(mod.MARKET())).totalSupplyShares();
        uint256 supplied = mod.suppliedAssets();
        return supplied == 0 ? 0 : (amount * tss) / supplied;
    }

    function stage1(Params calldata p) external returns (Result memory r) {
        usdg = IERC20(p.usdg);
        mod = VertexLendingModule(_deploy(abi.encodePacked(p.moduleCreation, abi.encode(p.market, p.usdg, p.stock, p.stockValuation, "Vertex Lending Module META", "vlmMETA"))));
        r.module = address(mod);
        if (address(mod) == address(0)) { r.note = "module deploy failed"; return r; }
        address[] memory targets = new address[](1);
        targets[0] = address(mod);
        uint16[] memory weights = new uint16[](1);
        weights[0] = 3500;
        alloc = VertexAllocatorV1(_deploy(abi.encodePacked(p.allocatorCreation, abi.encode(p.usdg, address(this), address(this), address(this), p.treasury, uint256(5_000e6), uint16(30), targets, weights))));
        r.allocator = address(alloc);
        if (address(alloc) == address(0)) { r.note = "allocator deploy failed (module rejected as target?)"; return r; }
        (bool enabled,,, address router, address valuation, address stock) = alloc.targets(address(mod));
        if (!(enabled && router == address(mod) && valuation == address(mod) && stock == p.stock)) { r.note = "target wiring"; return r; }
        // make the market large enough for the allocator's floor
        usdg.approve(p.market, p.marketTopUp);
        ILendingMarket(p.market).supply(p.marketTopUp, (_unitsFor(p.marketTopUp) * 9_990) / 10_000);
        if (!(mod.suppliedAssets() >= alloc.minTargetAssets())) { r.note = "market still below the floor"; return r; }
        if (!(mod.entryOpen() && !mod.stopped() && !mod.recovery())) { r.note = "module reports closed"; return r; }
        // deposit and allocate
        usdg.approve(address(alloc), p.depositAmount);
        sharesMinted = alloc.deposit(p.depositAmount, address(this));
        uint256 idleBefore = alloc.idleAssets();
        r.a = alloc.allocate(address(mod), _entry(p.budget));
        if (!(r.a > 0 && mod.balanceOf(address(alloc)) == r.a)) { r.note = "no module shares"; return r; }
        r.b = alloc.valueOf(address(mod));
        uint256 spent = idleBefore - alloc.idleAssets();
        if (!(spent == p.budget)) { r.note = "spent mismatch"; return r; }
        if (!(r.b + 1_000 >= p.budget)) { r.note = "position valued below the budget"; return r; }
        r.c = alloc.totalAssets();
        if (!(r.c + 1_000 >= idleBefore)) { r.note = "total assets fell on a lossless entry"; return r; }
        // withdraw half in kind: module shares arrive, and they redeem directly
        address[] memory none;
        uint256 modBefore = mod.balanceOf(address(this));
        alloc.withdraw(sharesMinted / 2, address(this), none);
        uint256 got = mod.balanceOf(address(this)) - modBefore;
        if (!(got > 0)) { r.note = "no module shares in kind"; return r; }
        uint256 usdgBefore = usdg.balanceOf(address(this));
        uint256 redeemed = mod.redeem(got, address(this), (mod.assetsOf(got) * 9_990) / 10_000);
        if (!(redeemed > 0 && usdg.balanceOf(address(this)) == usdgBefore + redeemed && redeemed + 1_000 >= mod.assetsOf(got))) { r.note = "direct redemption off"; return r; }
        r.d = redeemed;
    }

    /// One cooldown later, the rest comes back through the allocator's exit path.
    function stage2() external returns (Result memory r) {
        r.module = address(mod);
        r.allocator = address(alloc);
        uint256 remaining = mod.balanceOf(address(alloc));
        (, uint256 a0, uint256 a1,,) = mod.quote(remaining, 0);
        if (!(a1 == 0 && a0 == mod.assetsOf(remaining))) { r.note = "quote shape"; return r; }
        uint256 expected = mod.value(a0, a1);
        uint256 minimum = (expected * 9_990) / 10_000;
        uint256 idleBefore = alloc.idleAssets();
        r.a = alloc.deallocate(address(mod), remaining, minimum, block.timestamp + 180, 0, IRouter.ExitSwap({minOut: 0, sqrtLimit: 0, route: ""}));
        if (!(r.a >= minimum && alloc.idleAssets() == idleBefore + r.a && mod.balanceOf(address(alloc)) == 0)) { r.note = "exit off"; return r; }
        r.b = expected;
        r.c = alloc.totalAssets();
        r.d = alloc.convertToAssets(1e12);
        if (!(alloc.valueOf(address(mod)) == 0)) { r.note = "position not cleared"; return r; }
    }
}
