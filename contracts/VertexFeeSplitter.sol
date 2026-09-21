// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "./VertexAllocatorV1.sol";

interface IStakingRewards {
    function totalStaked() external view returns (uint256);
    function notifyReward(uint256 amount) external;
}

/**
 * VertexFeeSplitter: the allocator's treasury. Every USDG it receives is
 * split, by shares that governance sets, between the buyback wallet, the
 * stakers (through VertexStaking) and the protocol treasury. Anyone can call
 * distribute; nothing is held back. When nobody is staked the stakers' share
 * goes to the treasury rather than sitting here unowned.
 */
contract VertexFeeSplitter {
    IERC20 public immutable USDG;

    address public owner; // the governor once governance is live
    address public buyback;
    address public treasury;
    IStakingRewards public staking;
    uint16 public buybackBps;
    uint16 public stakersBps;
    uint16 public treasuryBps;

    uint256 public distributedToBuyback;
    uint256 public distributedToStakers;
    uint256 public distributedToTreasury;

    event Distributed(uint256 toBuyback, uint256 toStakers, uint256 toTreasury);
    event SplitSet(uint16 buybackBps, uint16 stakersBps, uint16 treasuryBps);
    event RecipientsSet(address buyback, address treasury, address staking);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error ZeroAddress();
    error NothingToDistribute();
    error BadSplit();
    error TransferFailed();
    error Reentrancy();

    uint256 private _lock = 1;
    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address usdg, address owner_, address buyback_, address treasury_, address staking_, uint16 buybackBps_, uint16 stakersBps_, uint16 treasuryBps_) {
        if (usdg == address(0) || owner_ == address(0) || buyback_ == address(0) || treasury_ == address(0) || staking_ == address(0)) revert ZeroAddress();
        if (uint256(buybackBps_) + stakersBps_ + treasuryBps_ != 10_000) revert BadSplit();
        USDG = IERC20(usdg);
        owner = owner_;
        buyback = buyback_;
        treasury = treasury_;
        staking = IStakingRewards(staking_);
        buybackBps = buybackBps_;
        stakersBps = stakersBps_;
        treasuryBps = treasuryBps_;
        emit OwnershipTransferred(address(0), owner_);
        emit RecipientsSet(buyback_, treasury_, staking_);
        emit SplitSet(buybackBps_, stakersBps_, treasuryBps_);
    }

    function pendingDistribution() external view returns (uint256) {
        return USDG.balanceOf(address(this));
    }

    function distribute() external nonReentrant returns (uint256 toBuyback, uint256 toStakers, uint256 toTreasury) {
        uint256 amount = USDG.balanceOf(address(this));
        if (amount == 0) revert NothingToDistribute();
        toBuyback = (amount * buybackBps) / 10_000;
        toStakers = (amount * stakersBps) / 10_000;
        if (staking.totalStaked() == 0) toStakers = 0;
        toTreasury = amount - toBuyback - toStakers;
        if (toBuyback > 0 && !USDG.transfer(buyback, toBuyback)) revert TransferFailed();
        if (toStakers > 0) {
            if (!USDG.approve(address(staking), toStakers)) revert TransferFailed();
            staking.notifyReward(toStakers);
        }
        if (toTreasury > 0 && !USDG.transfer(treasury, toTreasury)) revert TransferFailed();
        distributedToBuyback += toBuyback;
        distributedToStakers += toStakers;
        distributedToTreasury += toTreasury;
        emit Distributed(toBuyback, toStakers, toTreasury);
    }

    // ------------------------------------------------------------------ governance
    function setSplit(uint16 buybackBps_, uint16 stakersBps_, uint16 treasuryBps_) external onlyOwner {
        if (uint256(buybackBps_) + stakersBps_ + treasuryBps_ != 10_000) revert BadSplit();
        buybackBps = buybackBps_;
        stakersBps = stakersBps_;
        treasuryBps = treasuryBps_;
        emit SplitSet(buybackBps_, stakersBps_, treasuryBps_);
    }

    function setRecipients(address buyback_, address treasury_, address staking_) external onlyOwner {
        if (buyback_ == address(0) || treasury_ == address(0) || staking_ == address(0)) revert ZeroAddress();
        buyback = buyback_;
        treasury = treasury_;
        staking = IStakingRewards(staking_);
        emit RecipientsSet(buyback_, treasury_, staking_);
    }

    function transferOwnership(address owner_) external onlyOwner {
        if (owner_ == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, owner_);
        owner = owner_;
    }
}
