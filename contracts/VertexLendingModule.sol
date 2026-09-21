// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20, IRouter, IValuation, IPool} from "./VertexAllocatorV1.sol";

interface ILendingMarket {
    function state() external view returns (uint8); // 0 Active, 1 Paused, 2 Closed, 3 Recovery
    function oracleStatus() external view returns (bool available, uint8 failureOrdinal, bytes4 selector);
    function totalSupplyAssets() external view returns (uint256);
    function totalSupplyShares() external view returns (uint256);
    function totals() external view returns (uint256 debt, uint256 reserve, uint256 interest);
    function cash() external view returns (uint256);
    function supplyShares(address) external view returns (uint256);
    function recoveryStarted() external view returns (bool);
    function asset() external view returns (address);
    function supply(uint256 amount, uint256 minUnits) external returns (uint256 units);
    function withdraw(uint256 units, uint256 minAmount) external returns (uint256 amount);
}

/**
 * VertexLendingModule: a lending market presented to the allocator as if it
 * were a stock vault, so governance can whitelist it as a target without any
 * change to the allocator.
 *
 * The module supplies USDG to one lending market and issues one share per
 * market supply unit it receives, so a share is worth exactly its slice of
 * the market's supplied assets, interest included. It answers every call the
 * allocator makes to a target:
 *   - vault: router, valuation, open and stopped flags, inventory, shares;
 *   - router: deposit(Entry) supplies the budget; withdrawUSDG withdraws;
 *   - valuation: quote() and every share valuation revert while the market's
 *     oracle is unavailable (the same fail-closed rule the stock vaults
 *     follow, so the allocator refuses deposits rather than pricing a
 *     position the market itself cannot price); value() prices USDG one to
 *     one and the market's stock through the vault valuation governance names.
 * Holders who exit the allocator in kind receive module shares and can
 * redeem them here directly, without the allocator. Should the market ever
 * settle suppliers through a recovery path other than withdraw, governance
 * writes the module off in the allocator and holders keep their shares in
 * kind; the module does not guess at that path.
 */
contract VertexLendingModule {
    // ------------------------------------------------------------------ shares
    string public name;
    string public symbol;
    uint8 public constant decimals = 12; // one share per market supply unit, and the market issues 1e12 units per USDG
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    ILendingMarket public immutable MARKET;
    IERC20 public immutable USDG;
    address public immutable STOCK;
    IValuation public immutable STOCK_VALUATION; // the stock vault's valuation, for the stock side of value()
    bool public immutable STOCK_IS_TOKEN0; // in the stock valuation's pool

    event Supplied(address indexed receiver, uint256 assets, uint256 units);
    event Redeemed(address indexed owner, address indexed receiver, uint256 units, uint256 assets);

    error ZeroAddress();
    error ZeroAmount();
    error BadReceiver();
    error Expired();
    error BelowMinimum();
    error TransferFailed();
    error InsufficientShares();
    error InsufficientAllowance();
    error OracleUnavailable();
    error WrongAsset();
    error Reentrancy();

    uint256 private _lock = 1;
    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address market, address usdg, address stock_, address stockValuation, string memory name_, string memory symbol_) {
        if (market == address(0) || usdg == address(0) || stock_ == address(0) || stockValuation == address(0)) revert ZeroAddress();
        if (ILendingMarket(market).asset() != usdg) revert WrongAsset();
        if (IValuation(stockValuation).stock() != stock_) revert WrongAsset();
        MARKET = ILendingMarket(market);
        USDG = IERC20(usdg);
        STOCK = stock_;
        STOCK_VALUATION = IValuation(stockValuation);
        STOCK_IS_TOKEN0 = IPool(IValuation(stockValuation).pool()).token0() == stock_;
        name = name_;
        symbol = symbol_;
    }

    // ------------------------------------------------------------------ ERC20
    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[from] < amount) revert InsufficientShares();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        if (balanceOf[from] < amount) revert InsufficientShares();
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    // ------------------------------------------------------------------ market reads
    /// Assets behind the market's supply shares, as the market reports them. Reverts while the market's oracle is
    /// unavailable: the allocator then fails closed for this target exactly as it does for a stale stock vault.
    function suppliedAssets() public view returns (uint256) {
        (bool ok,,) = MARKET.oracleStatus();
        if (!ok) revert OracleUnavailable();
        return MARKET.totalSupplyAssets();
    }

    /// USDG value of `units` module shares (one share per market supply unit).
    function assetsOf(uint256 units) public view returns (uint256) {
        uint256 tss = MARKET.totalSupplyShares();
        return tss == 0 ? 0 : (units * suppliedAssets()) / tss;
    }

    function marketOpen() public view returns (bool) {
        (bool ok,,) = MARKET.oracleStatus();
        return ok && MARKET.state() == 0;
    }

    // ------------------------------------------------------------------ the vault face the allocator reads
    function router() external view returns (address) {
        return address(this);
    }

    function valuation() external view returns (address) {
        return address(this);
    }

    function token0() external view returns (address) {
        return address(USDG);
    }

    function token1() external view returns (address) {
        return STOCK;
    }

    function entryOpen() external view returns (bool) {
        return marketOpen();
    }

    function stopped() external view returns (bool) {
        uint8 s = MARKET.state();
        return s == 2 || s == 3;
    }

    function recovery() external view returns (bool) {
        return MARKET.recoveryStarted();
    }

    function restartRequired() external pure returns (bool) {
        return false;
    }

    /// The whole market, as the allocator's minimum target size looks at it.
    function inventory() external view returns (uint256, uint256) {
        return (suppliedAssets(), 0);
    }

    /// (liquidity, amount0, amount1, fees0, fees1) the way a vault quotes an exit: all USDG, no stock.
    function quote(uint256 units, uint128) external view returns (uint128, uint256, uint256, uint256, uint256) {
        return (0, assetsOf(units), 0, 0, 0);
    }

    // ------------------------------------------------------------------ the valuation face
    function quote() external view returns (uint256 answer, uint8 decimals_, uint256 updatedAt, uint80 roundId) {
        (bool ok,,) = MARKET.oracleStatus();
        if (!ok) revert OracleUnavailable();
        return (1e8, 8, block.timestamp, 0);
    }

    function value(uint256 amount0, uint256 amount1) external view returns (uint256) {
        if (amount1 == 0) return amount0;
        return amount0 + STOCK_VALUATION.value(STOCK_IS_TOKEN0 ? amount1 : 0, STOCK_IS_TOKEN0 ? 0 : amount1);
    }

    function stock() external view returns (address) {
        return STOCK;
    }

    function pool() external view returns (address) {
        return address(this);
    }

    // ------------------------------------------------------------------ the router face
    function asset() external view returns (address) {
        return address(USDG);
    }

    /// Supplies `entry.budget` USDG from the caller and issues the market units to `entry.join.receiver`. Of the entry
    /// only the budget, the receiver, the deadline and `join.minShares` (the least units to accept) mean anything here.
    function deposit(IRouter.Entry calldata entry) external nonReentrant returns (uint256 units) {
        if (entry.budget == 0) revert ZeroAmount();
        if (entry.join.receiver == address(0)) revert BadReceiver();
        if (block.timestamp > entry.join.deadline) revert Expired();
        if (!USDG.transferFrom(msg.sender, address(this), entry.budget)) revert TransferFailed();
        if (!USDG.approve(address(MARKET), entry.budget)) revert TransferFailed();
        units = MARKET.supply(entry.budget, entry.join.minShares);
        if (!USDG.approve(address(MARKET), 0)) revert TransferFailed();
        if (units == 0) revert ZeroAmount();
        _mint(entry.join.receiver, units);
        emit Supplied(entry.join.receiver, entry.budget, units);
    }

    /// Redeems `units` of the caller's shares from the market and sends the USDG to `receiver`.
    function withdrawUSDG(uint256 units, address receiver, uint256 minimum, uint256 deadline, uint256, IRouter.ExitSwap calldata) external nonReentrant returns (uint256 assets) {
        if (units == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();
        if (block.timestamp > deadline) revert Expired();
        _burn(msg.sender, units);
        assets = MARKET.withdraw(units, minimum);
        if (assets < minimum) revert BelowMinimum();
        if (!USDG.transfer(receiver, assets)) revert TransferFailed();
        emit Redeemed(msg.sender, receiver, units, assets);
    }

    /// Plain redemption for holders who received shares in kind.
    function redeem(uint256 units, address receiver, uint256 minimum) external nonReentrant returns (uint256 assets) {
        if (units == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();
        _burn(msg.sender, units);
        assets = MARKET.withdraw(units, minimum);
        if (assets < minimum) revert BelowMinimum();
        if (!USDG.transfer(receiver, assets)) revert TransferFailed();
        emit Redeemed(msg.sender, receiver, units, assets);
    }
}
