// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/**
 * Vertex Allocator v1
 *
 * One vault that accepts USDG and allocates it across the managed stock
 * vaults on Robinhood Chain through their existing routers, inside hard
 * limits the contract enforces itself:
 *
 *   - only whitelisted target vaults, each with a maximum weight;
 *   - a minimum size for a target vault before capital can go in;
 *   - a fresh Chainlink reference before any move (the valuation contract of
 *     the target reverts when the reference is stale, and so does this one);
 *   - a bounded loss on every move, into a vault and back out to USDG, and a
 *     budget for the realised loss of all moves per day (a day starts at the
 *     first lossy move after the previous day ended);
 *   - one move per vault per hour, in or out, so nobody can churn the fees;
 *   - a deposit cap that starts small and can only be raised after a delay.
 *
 * Nothing here depends on trust in the keeper. The keeper chooses when and
 * where to move capital; the limits above decide whether it is allowed.
 *
 * Withdrawals are in kind: a holder always receives the pro rata slice of
 * everything the allocator holds (idle USDG, shares of every target vault and
 * any stock dust a router returned), so exits never depend on a price, a swap
 * or the keeper. A holder may forfeit the slice of a vault whose shares can no
 * longer be transferred instead of being blocked by it, and a stock token that
 * refuses a transfer is skipped rather than blocking the exit. Anyone can then
 * exit the vault shares through the normal vault flow. Stock dust is valued in
 * totalAssets through the valuation of the vault that introduced it.
 *
 * Every parameter change goes through a 24 hour review window and expires a
 * week after it becomes executable, except the changes that only reduce risk
 * (pause, disable a target, lower the cap or the fee), which apply at once.
 * Resuming after a pause, and writing a dead target off, reprice or reopen the
 * pool, so they wait the window like any other change.
 *
 * Shares: 12 decimals against USDG's 6, with a virtual offset so the first
 * depositor cannot manipulate the share price.
 */

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

interface IManagedVault {
    function router() external view returns (address);
    function valuation() external view returns (address);
    function entryOpen() external view returns (bool);
    function stopped() external view returns (bool);
    function recovery() external view returns (bool);
    function restartRequired() external view returns (bool);
    function inventory() external view returns (uint256, uint256);
    function totalSupply() external view returns (uint256);
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
    /// Amounts of token0 and token1 behind `shares` (or `liquidity` when bootstrapping).
    function quote(uint256 shares, uint128 liquidity) external view returns (uint128, uint256, uint256, uint256, uint256);
}

interface IValuation {
    /// Reverts while the Chainlink reference is stale.
    function quote() external view returns (uint256 answer, uint8 decimals, uint256 updatedAt, uint80 roundId);
    /// Reverts while the Chainlink reference is stale.
    function value(uint256 amount0, uint256 amount1) external view returns (uint256);
    function stock() external view returns (address);
    function pool() external view returns (address);
}

interface IPool {
    function token0() external view returns (address);
}

interface IRouter {
    struct Swap {
        uint256 amount;
        uint256 minOut;
        uint160 sqrtLimit;
        bytes route;
    }
    struct Join {
        uint256 shares;
        uint128 bootstrapLiquidity;
        uint256 maximum0;
        uint256 maximum1;
        uint256 minShares;
        uint256 deadline;
        uint256 configuration;
        address receiver;
        bool acquire;
    }
    struct Entry {
        uint256 budget;
        Swap swap;
        Join join;
    }
    struct ExitSwap {
        uint256 minOut;
        uint160 sqrtLimit;
        bytes route;
    }
    function asset() external view returns (address);
    function deposit(Entry calldata entry) external returns (uint256);
    function withdrawUSDG(uint256 shares, address receiver, uint256 minimum, uint256 deadline, uint256 configuration, ExitSwap calldata swap) external returns (uint256);
}

contract VertexAllocatorV1 {
    // ------------------------------------------------------------------ shares
    string public constant name = "Vertex Allocator USDG";
    string public constant symbol = "vaUSDG";
    uint8 public constant decimals = 12;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    // ------------------------------------------------------------------ roles
    address public owner;
    address public keeper;
    address public guardian;
    address public treasury;
    bool public paused;

    // ------------------------------------------------------------------ limits
    uint256 public constant DELAY = 24 hours;
    uint256 public constant GRACE = 7 days; // a queued change expires if not executed within this window after its eta
    uint256 public constant MAX_TARGETS = 24;
    uint16 public constant MAX_FEE_BPS = 100; // 1%
    uint16 public constant MAX_LOSS_BPS = 500; // 5%
    uint16 public constant MAX_DAILY_LOSS_BPS = 300; // 3% of the cap per day
    uint256 public constant MOVE_COOLDOWN = 1 hours;
    uint256 private constant VIRTUAL_SHARES = 1e6;
    uint256 private constant VIRTUAL_ASSETS = 1;

    IERC20 public immutable USDG;
    uint256 public depositCap; // in USDG, on totalAssets after a deposit
    uint16 public depositFeeBps; // taken on the way in, sent to treasury
    uint256 public minTargetAssets; // a target vault must hold at least this much USDG of value
    uint16 public maxLossBps; // any move must keep at least (1 - this) of the value it moves, in or out
    uint16 public maxDailyLossBps; // realised loss from all moves in a rolling day, as a share of the deposit cap
    uint256 public lossWindowStart;
    uint256 public lossInWindow;
    mapping(address => uint256) public lastMove; // vault → last allocate or deallocate timestamp, against churn
    mapping(bytes4 => bool) public delayed; // functions that only the review window may call
    mapping(address => bool) public protectedToken; // USDG, every target's shares and stock, never sweepable
    address[] public stockList; // unique stock tokens of every target ever whitelisted, for dust distribution
    struct StockPricing {
        address valuation;
        bool isToken0;
    }
    mapping(address => StockPricing) public stockPricing; // stock token → how to value dust of it in USDG
    uint256 public pauseEpoch; // bumps on every pause; an unpause names the pause it lifts

    struct Target {
        bool enabled;
        bool writtenOff; // valued at zero in totalAssets, still distributed in kind
        uint16 maxWeightBps;
        address router;
        address valuation;
        address stock;
    }
    mapping(address => Target) public targets;
    address[] public targetList;

    mapping(bytes32 => uint256) public eta; // hash of a delayed call → when it can execute

    // ------------------------------------------------------------------ events
    event Deposit(address indexed sender, address indexed receiver, uint256 assets, uint256 fee, uint256 shares);
    event Withdraw(address indexed sender, address indexed receiver, uint256 shares, uint256 idleAssets);
    event WithdrawnShares(address indexed receiver, address indexed vault, uint256 vaultShares);
    event Allocated(address indexed vault, uint256 budget, uint256 vaultShares);
    event Deallocated(address indexed vault, uint256 vaultShares, uint256 assetsOut);
    event TargetSet(address indexed vault, uint16 maxWeightBps, address router, address valuation);
    event TargetDisabled(address indexed vault);
    event DepositCapSet(uint256 cap);
    event DepositFeeSet(uint16 bps);
    event MinTargetAssetsSet(uint256 assets);
    event MaxLossSet(uint16 bps);
    event MaxDailyLossSet(uint16 bps);
    event LossRecorded(uint256 loss, uint256 windowTotal);
    event TargetDropped(address indexed vault);
    event TargetWrittenOff(address indexed vault, bool writtenOff);
    event WithdrawnStock(address indexed receiver, address indexed token, uint256 amount);
    event TreasurySet(address treasury);
    event KeeperSet(address keeper);
    event GuardianSet(address guardian);
    event OwnershipTransferred(address indexed from, address indexed to);
    event Paused(address by);
    event Unpaused(address by);
    event Proposed(bytes32 indexed hash, bytes data, uint256 eta);
    event Cancelled(bytes32 indexed hash);
    event Executed(bytes32 indexed hash);
    event Swept(address indexed token, uint256 amount);

    error NotOwner();
    error NotKeeper();
    error NotGuardian();
    error NotSelf();
    error IsPaused();
    error ZeroAmount();
    error ZeroAddress();
    error CapExceeded();
    error UnknownTarget();
    error TargetNotOpen();
    error TargetTooSmall();
    error WeightExceeded();
    error BadReceiver();
    error BadBudget();
    error ExitFloorTooLow();
    error EntryLossTooHigh();
    error Cooldown();
    error NotDelayed();
    error StillHeld();
    error LengthMismatch();
    error TargetChanged();
    error Expired();
    error DailyLossExceeded();
    error TooManyTargets();
    error FeeTooHigh();
    error LossTooHigh();
    error CoreToken();
    error NotQueued();
    error TooEarly();
    error CallFailed();
    error Reentrancy();
    error InsufficientShares();
    error TransferFailed();

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
    modifier onlyKeeper() {
        if (msg.sender != keeper && msg.sender != owner) revert NotKeeper();
        _;
    }
    modifier onlySelf() {
        if (msg.sender != address(this)) revert NotSelf();
        _;
    }
    modifier whenNotPaused() {
        if (paused) revert IsPaused();
        _;
    }

    /// `initialTargets` and `initialWeights` whitelist vaults at deployment; every later change waits the review window.
    constructor(address usdg, address owner_, address keeper_, address guardian_, address treasury_, uint256 depositCap_, uint16 depositFeeBps_, address[] memory initialTargets, uint16[] memory initialWeights) {
        if (usdg == address(0) || owner_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (depositFeeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        if (initialTargets.length != initialWeights.length) revert LengthMismatch();
        USDG = IERC20(usdg);
        owner = owner_;
        keeper = keeper_ == address(0) ? owner_ : keeper_;
        guardian = guardian_ == address(0) ? owner_ : guardian_;
        treasury = treasury_;
        depositCap = depositCap_;
        depositFeeBps = depositFeeBps_;
        minTargetAssets = 1_000e6;
        maxLossBps = 300;
        maxDailyLossBps = 100;
        protectedToken[usdg] = true;
        delayed[VertexAllocatorV1.setTarget.selector] = true;
        delayed[VertexAllocatorV1.setMaxDailyLoss.selector] = true;
        delayed[VertexAllocatorV1.unpause.selector] = true;
        delayed[VertexAllocatorV1.setStockPricing.selector] = true;
        delayed[VertexAllocatorV1.writeOff.selector] = true;
        delayed[VertexAllocatorV1.setDepositCap.selector] = true;
        delayed[VertexAllocatorV1.setDepositFee.selector] = true;
        delayed[VertexAllocatorV1.setMinTargetAssets.selector] = true;
        delayed[VertexAllocatorV1.setMaxLoss.selector] = true;
        delayed[VertexAllocatorV1.setTreasury.selector] = true;
        delayed[VertexAllocatorV1.setKeeper.selector] = true;
        delayed[VertexAllocatorV1.setGuardian.selector] = true;
        delayed[VertexAllocatorV1.transferOwnership.selector] = true;
        emit OwnershipTransferred(address(0), owner_);
        emit KeeperSet(keeper);
        emit GuardianSet(guardian);
        emit TreasurySet(treasury_);
        emit DepositCapSet(depositCap_);
        emit DepositFeeSet(depositFeeBps_);
        for (uint256 i = 0; i < initialTargets.length; i++) _setTarget(initialTargets[i], initialWeights[i]);
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
            if (allowed < amount) revert InsufficientShares();
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        if (to == address(0)) revert ZeroAddress();
        uint256 bal = balanceOf[from];
        if (bal < amount) revert InsufficientShares();
        balanceOf[from] = bal - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        uint256 bal = balanceOf[from];
        if (bal < amount) revert InsufficientShares();
        balanceOf[from] = bal - amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    // ------------------------------------------------------------------ views
    function idleAssets() public view returns (uint256) {
        return USDG.balanceOf(address(this));
    }

    /// USDG value of the allocator's shares in one target vault. Reverts while that vault's reference is stale.
    function valueOf(address vault) public view returns (uint256) {
        if (targets[vault].writtenOff) return 0;
        uint256 shares = IManagedVault(vault).balanceOf(address(this));
        if (shares == 0) return 0;
        (, uint256 amount0, uint256 amount1,,) = IManagedVault(vault).quote(shares, 0);
        return IValuation(targets[vault].valuation).value(amount0, amount1);
    }

    /// USDG value of the stock dust of one token, priced through the valuation of the vault that introduced it.
    function dustValueOf(address stock) public view returns (uint256) {
        uint256 amount = _balance(stock);
        if (amount == 0) return 0;
        StockPricing memory sp = stockPricing[stock];
        return IValuation(sp.valuation).value(sp.isToken0 ? amount : 0, sp.isToken0 ? 0 : amount);
    }

    /// Idle USDG plus the value of every target position and of every stock dust balance. Reverts while any of them cannot be priced.
    function totalAssets() public view returns (uint256 total) {
        total = idleAssets();
        uint256 n = targetList.length;
        for (uint256 i = 0; i < n; i++) total += valueOf(targetList[i]);
        n = stockList.length;
        for (uint256 i = 0; i < n; i++) total += dustValueOf(stockList[i]);
    }

    /// Balance read that never reverts: a frozen token reads as zero instead of blocking every holder.
    function _balance(address token) internal view returns (uint256) {
        (bool ok, bytes memory data) = token.staticcall(abi.encodeWithSelector(IERC20.balanceOf.selector, address(this)));
        return ok && data.length >= 32 ? abi.decode(data, (uint256)) : 0;
    }

    /// Transfer that reports failure instead of reverting, for tokens that may freeze or return nothing.
    function _tryTransfer(address token, address to, uint256 amount) internal returns (bool) {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        return ok && (data.length == 0 || (data.length >= 32 && abi.decode(data, (bool))));
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        return (assets * (totalSupply + VIRTUAL_SHARES)) / (totalAssets() + VIRTUAL_ASSETS);
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return (shares * (totalAssets() + VIRTUAL_ASSETS)) / (totalSupply + VIRTUAL_SHARES);
    }

    function targetCount() external view returns (uint256) {
        return targetList.length;
    }

    function stockCount() external view returns (uint256) {
        return stockList.length;
    }

    /// Realised loss recorded in the current rolling day.
    function dailyLoss() public view returns (uint256) {
        return block.timestamp >= lossWindowStart + 1 days ? 0 : lossInWindow;
    }

    /// Vault shares the allocator holds in one target.
    function positionOf(address vault) external view returns (uint256) {
        return IManagedVault(vault).balanceOf(address(this));
    }

    /// Whether a delayed change can be executed now.
    function ready(bytes32 hash) external view returns (bool) {
        return eta[hash] != 0 && block.timestamp >= eta[hash];
    }

    // ------------------------------------------------------------------ deposits and withdrawals
    /// Deposit USDG. The fee goes to the treasury; the rest mints shares at the current price.
    function deposit(uint256 assets, address receiver) external nonReentrant whenNotPaused returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();
        uint256 fee = (assets * depositFeeBps) / 10_000;
        uint256 net = assets - fee;
        uint256 total = totalAssets();
        if (total + net > depositCap) revert CapExceeded();
        shares = (net * (totalSupply + VIRTUAL_SHARES)) / (total + VIRTUAL_ASSETS);
        if (shares == 0) revert ZeroAmount();
        if (!USDG.transferFrom(msg.sender, address(this), assets)) revert TransferFailed();
        if (fee > 0 && !USDG.transfer(treasury, fee)) revert TransferFailed();
        _mint(receiver, shares);
        emit Deposit(msg.sender, receiver, assets, fee, shares);
    }

    /// Redeem shares in kind: the pro rata slice of idle USDG, of every target position and of any stock dust a router
    /// returned. Never needs a price. `skip` lists targets whose share transfer the caller chooses to forfeit (for example a
    /// vault that no longer allows transfers); that slice stays with the remaining holders instead of blocking the exit.
    function withdraw(uint256 shares, address receiver, address[] calldata skip) external nonReentrant returns (uint256 idleOut) {
        if (shares == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();
        uint256 supply = totalSupply;
        idleOut = (idleAssets() * shares) / supply;
        _burn(msg.sender, shares);
        uint256 n = targetList.length;
        for (uint256 i = 0; i < n; i++) {
            address vault = targetList[i];
            if (_listed(skip, vault)) continue;
            uint256 part = (IManagedVault(vault).balanceOf(address(this)) * shares) / supply;
            if (part > 0) {
                if (!IManagedVault(vault).transfer(receiver, part)) revert TransferFailed();
                emit WithdrawnShares(receiver, vault, part);
            }
        }
        // Stock dust a router returned: each token once, best effort, so a token that refuses the receiver never blocks the exit.
        n = stockList.length;
        for (uint256 i = 0; i < n; i++) {
            address stock = stockList[i];
            uint256 dust = (_balance(stock) * shares) / supply;
            if (dust > 0 && _tryTransfer(stock, receiver, dust)) emit WithdrawnStock(receiver, stock, dust);
        }
        if (idleOut > 0 && !USDG.transfer(receiver, idleOut)) revert TransferFailed();
        emit Withdraw(msg.sender, receiver, shares, idleOut);
    }

    function _listed(address[] calldata list, address item) internal pure returns (bool) {
        for (uint256 i = 0; i < list.length; i++) if (list[i] == item) return true;
        return false;
    }

    // ------------------------------------------------------------------ keeper moves, inside the limits
    /// Move idle USDG into a target vault through its router. The entry is built off chain the way the vault page builds it.
    function allocate(address vault, IRouter.Entry calldata entry) external nonReentrant whenNotPaused onlyKeeper returns (uint256 vaultShares) {
        Target memory t = targets[vault];
        _checkEntry(vault, t, entry);
        uint256 heldBefore = valueOf(vault) + dustValueOf(t.stock);
        uint256 sharesBefore = IManagedVault(vault).balanceOf(address(this));
        uint256 idleBefore = idleAssets();
        if (!USDG.approve(t.router, entry.budget)) revert TransferFailed();
        IRouter(t.router).deposit(entry);
        if (!USDG.approve(t.router, 0)) revert TransferFailed();
        vaultShares = IManagedVault(vault).balanceOf(address(this)) - sharesBefore;
        // The value that arrived in the vault must cover what left, minus the loss limit: a bad swap leg cannot drain the allocator.
        uint256 spent = idleBefore - idleAssets();
        uint256 gained = valueOf(vault) + dustValueOf(t.stock) - heldBefore;
        if (gained * 10_000 < spent * (10_000 - maxLossBps)) revert EntryLossTooHigh();
        _recordLoss(gained < spent ? spent - gained : 0);
        lastMove[vault] = block.timestamp;
        emit Allocated(vault, spent, vaultShares);
    }

    /// Every condition an entry must meet before any USDG leaves: target enabled and unchanged, vault open, reference
    /// fresh, vault large enough, cooldown elapsed, weight limit respected after the move.
    function _checkEntry(address vault, Target memory t, IRouter.Entry calldata entry) internal view {
        if (!t.enabled) revert UnknownTarget();
        if (entry.join.receiver != address(this)) revert BadReceiver();
        if (entry.budget == 0 || entry.budget > idleAssets()) revert BadBudget();
        IManagedVault v = IManagedVault(vault);
        if (v.router() != t.router || v.valuation() != t.valuation) revert TargetChanged();
        if (!v.entryOpen() || v.stopped() || v.recovery() || v.restartRequired()) revert TargetNotOpen();
        // A fresh reference is required: this call reverts while the Chainlink feed is stale.
        IValuation(t.valuation).quote();
        (uint256 inv0, uint256 inv1) = v.inventory();
        if (IValuation(t.valuation).value(inv0, inv1) < minTargetAssets) revert TargetTooSmall();
        if (block.timestamp < lastMove[vault] + MOVE_COOLDOWN) revert Cooldown();
        if ((valueOf(vault) + entry.budget) * 10_000 > totalAssets() * t.maxWeightBps) revert WeightExceeded();
    }

    /// Bring a position back to USDG through the router's protected swap. The floor must respect the exit loss limit.
    function deallocate(address vault, uint256 vaultShares, uint256 minimum, uint256 deadline, uint256 configuration, IRouter.ExitSwap calldata swap) external nonReentrant onlyKeeper returns (uint256 assetsOut) {
        Target memory t = targets[vault];
        if (t.router == address(0) || t.writtenOff) revert UnknownTarget();
        if (vaultShares == 0) revert ZeroAmount();
        // While paused only the owner or the guardian unwinds, without waiting for the cooldown: an emergency exit is the
        // one move that should never wait. Otherwise a compromised keeper cannot keep moving value.
        if (paused) {
            if (msg.sender != owner && msg.sender != guardian) revert IsPaused();
        } else if (block.timestamp < lastMove[vault] + MOVE_COOLDOWN) {
            revert Cooldown();
        }
        IManagedVault v = IManagedVault(vault);
        if (v.router() != t.router || v.valuation() != t.valuation) revert TargetChanged();
        IValuation(t.valuation).quote();
        (, uint256 amount0, uint256 amount1,,) = v.quote(vaultShares, 0);
        uint256 expected = IValuation(t.valuation).value(amount0, amount1);
        if (minimum * 10_000 < expected * (10_000 - maxLossBps)) revert ExitFloorTooLow();
        uint256 before = idleAssets();
        if (!v.approve(t.router, vaultShares)) revert TransferFailed();
        IRouter(t.router).withdrawUSDG(vaultShares, address(this), minimum, deadline, configuration, swap);
        if (!v.approve(t.router, 0)) revert TransferFailed();
        assetsOut = idleAssets() - before;
        if (assetsOut < minimum) revert LossTooHigh();
        if (!paused) _recordLoss(assetsOut < expected ? expected - assetsOut : 0);
        lastMove[vault] = block.timestamp;
        emit Deallocated(vault, vaultShares, assetsOut);
    }

    /// Adds a realised loss to the rolling day and reverts when the day's budget, a share of the deposit cap, is spent.
    function _recordLoss(uint256 loss) internal {
        if (block.timestamp >= lossWindowStart + 1 days) {
            lossWindowStart = block.timestamp;
            lossInWindow = 0;
        }
        lossInWindow += loss;
        if (lossInWindow * 10_000 > depositCap * maxDailyLossBps) revert DailyLossExceeded();
        emit LossRecorded(loss, lossInWindow);
    }

    // ------------------------------------------------------------------ immediate, risk-reducing controls
    function pause() external {
        if (msg.sender != guardian && msg.sender != owner) revert NotGuardian();
        paused = true;
        pauseEpoch++;
        emit Paused(msg.sender);
    }

    /// Resuming waits the review window and names the pause it lifts, so it cannot be queued before that pause exists:
    /// a pause or a write-off is always followed by at least a full window before anyone can deposit again.
    function unpause(uint256 epoch) external onlySelf {
        if (epoch != pauseEpoch) revert NotQueued();
        paused = false;
        emit Unpaused(msg.sender);
    }

    function disableTarget(address vault) external {
        if (msg.sender != guardian && msg.sender != owner) revert NotGuardian();
        if (targets[vault].router == address(0)) revert UnknownTarget();
        targets[vault].enabled = false;
        emit TargetDisabled(vault);
    }

    /// Remove a target the allocator holds nothing of, so a dead vault does not sit in the list forever. A residue, even
    /// a written-off one, keeps its slot: holders still receive it in kind. Its stock token stays protected and distributable.
    function dropTarget(address vault) external onlyOwner {
        if (targets[vault].router == address(0)) revert UnknownTarget();
        if (IManagedVault(vault).balanceOf(address(this)) != 0) revert StillHeld();
        delete targets[vault];
        uint256 n = targetList.length;
        for (uint256 i = 0; i < n; i++) {
            if (targetList[i] == vault) {
                targetList[i] = targetList[n - 1];
                targetList.pop();
                break;
            }
        }
        emit TargetDropped(vault);
    }

    /// Stop pricing a target that can no longer be priced, so it does not block deposits forever. Holders still receive
    /// its shares in kind. It reprices the shares, so it waits the review window and pauses deposits until a separate,
    /// also delayed, unpause: nobody can deposit into the repriced pool before everyone has seen it.
    function writeOff(address vault, bool writtenOff) external onlySelf {
        if (targets[vault].router == address(0)) revert UnknownTarget();
        targets[vault].writtenOff = writtenOff;
        if (writtenOff) targets[vault].enabled = false;
        paused = true;
        pauseEpoch++;
        emit TargetWrittenOff(vault, writtenOff);
        emit Paused(address(this));
    }

    function lowerDepositFee(uint16 bps) external onlyOwner {
        if (bps > depositFeeBps) revert FeeTooHigh();
        depositFeeBps = bps;
        emit DepositFeeSet(bps);
    }

    function lowerDepositCap(uint256 cap) external onlyOwner {
        if (cap > depositCap) revert CapExceeded();
        depositCap = cap;
        emit DepositCapSet(cap);
    }

    /// Tokens that are neither USDG nor a target's shares (for example stock dust a router returned) go to the treasury.
    function sweep(address token) external onlyOwner {
        if (protectedToken[token]) revert CoreToken();
        uint256 amount = IERC20(token).balanceOf(address(this));
        if (amount == 0) revert ZeroAmount();
        if (!IERC20(token).transfer(treasury, amount)) revert TransferFailed();
        emit Swept(token, amount);
    }

    // ------------------------------------------------------------------ delayed changes (24 hour review window)
    function propose(bytes calldata data) external onlyOwner returns (bytes32 hash) {
        if (data.length < 4 || !delayed[bytes4(data[:4])]) revert NotDelayed();
        // A resume can only be queued for the pause in force, never ahead of one, so every pause costs a full window.
        if (bytes4(data[:4]) == VertexAllocatorV1.unpause.selector && (!paused || data.length != 36 || abi.decode(data[4:], (uint256)) != pauseEpoch)) revert NotQueued();
        hash = keccak256(data);
        eta[hash] = block.timestamp + DELAY;
        emit Proposed(hash, data, eta[hash]);
    }

    function cancel(bytes calldata data) external onlyOwner {
        bytes32 hash = keccak256(data);
        if (eta[hash] == 0) revert NotQueued();
        delete eta[hash];
        emit Cancelled(hash);
    }

    function execute(bytes calldata data) external onlyOwner {
        if (data.length < 4 || !delayed[bytes4(data[:4])]) revert NotDelayed();
        bytes32 hash = keccak256(data);
        uint256 when = eta[hash];
        if (when == 0) revert NotQueued();
        if (block.timestamp < when) revert TooEarly();
        if (block.timestamp > when + GRACE) revert Expired();
        delete eta[hash];
        (bool ok,) = address(this).call(data);
        if (!ok) revert CallFailed();
        emit Executed(hash);
    }

    /// Whitelist a target vault, or update its maximum weight. The router, valuation and stock token named in the
    /// proposal must still be what the vault reports when the change executes, so the review window reviews the real wiring.
    function setTarget(address vault, uint16 maxWeightBps, address router, address valuation, address stock) external onlySelf {
        (address r, address v, address st) = _setTarget(vault, maxWeightBps);
        if (r != router || v != valuation || st != stock) revert TargetChanged();
    }

    function _setTarget(address vault, uint16 maxWeightBps) internal returns (address router, address valuation, address stock) {
        if (maxWeightBps == 0 || maxWeightBps > 10_000) revert WeightExceeded();
        if (targets[vault].writtenOff) revert StillHeld(); // recover through writeOff(vault, false) first, which pauses
        router = IManagedVault(vault).router();
        valuation = IManagedVault(vault).valuation();
        if (router == address(0) || valuation == address(0)) revert ZeroAddress();
        if (IRouter(router).asset() != address(USDG)) revert CoreToken();
        stock = IValuation(valuation).stock();
        if (stock == address(0) || stock == address(USDG)) revert ZeroAddress();
        if (targets[vault].router == address(0)) {
            if (targetList.length >= MAX_TARGETS) revert TooManyTargets();
            targetList.push(vault);
            protectedToken[vault] = true;
        }
        if (!protectedToken[stock]) {
            protectedToken[stock] = true;
            stockList.push(stock);
            stockPricing[stock] = StockPricing({valuation: valuation, isToken0: IPool(IValuation(valuation).pool()).token0() == stock});
        }
        targets[vault] = Target({enabled: true, writtenOff: false, maxWeightBps: maxWeightBps, router: router, valuation: valuation, stock: stock});
        emit TargetSet(vault, maxWeightBps, router, valuation);
    }

    function setDepositCap(uint256 cap) external onlySelf {
        depositCap = cap;
        emit DepositCapSet(cap);
    }

    function setDepositFee(uint16 bps) external onlySelf {
        if (bps > MAX_FEE_BPS) revert FeeTooHigh();
        depositFeeBps = bps;
        emit DepositFeeSet(bps);
    }

    function setMinTargetAssets(uint256 assets) external onlySelf {
        minTargetAssets = assets;
        emit MinTargetAssetsSet(assets);
    }

    function setMaxLoss(uint16 bps) external onlySelf {
        if (bps > MAX_LOSS_BPS) revert LossTooHigh();
        maxLossBps = bps;
        emit MaxLossSet(bps);
    }

    /// Repoint how a stock token's dust is valued, for example when the vault that introduced it is gone.
    function setStockPricing(address stock, address valuation) external onlySelf {
        if (!protectedToken[stock] || stock == address(USDG)) revert UnknownTarget();
        if (IValuation(valuation).stock() != stock) revert TargetChanged();
        stockPricing[stock] = StockPricing({valuation: valuation, isToken0: IPool(IValuation(valuation).pool()).token0() == stock});
    }

    function setMaxDailyLoss(uint16 bps) external onlySelf {
        if (bps > MAX_DAILY_LOSS_BPS) revert LossTooHigh();
        maxDailyLossBps = bps;
        emit MaxDailyLossSet(bps);
    }

    function setTreasury(address treasury_) external onlySelf {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    function setKeeper(address keeper_) external onlySelf {
        if (keeper_ == address(0)) revert ZeroAddress();
        keeper = keeper_;
        emit KeeperSet(keeper_);
    }

    function setGuardian(address guardian_) external onlySelf {
        if (guardian_ == address(0)) revert ZeroAddress();
        guardian = guardian_;
        emit GuardianSet(guardian_);
    }

    function transferOwnership(address owner_) external onlySelf {
        if (owner_ == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, owner_);
        owner = owner_;
    }
}
