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
 *   - a bounded loss on every move, into a vault and back out to USDG;
 *   - one allocation per vault per hour, so nobody can churn the fees;
 *   - a deposit cap that starts small and can only be raised after a delay.
 *
 * Nothing here depends on trust in the keeper. The keeper chooses when and
 * where to move capital; the limits above decide whether it is allowed.
 *
 * Withdrawals are in kind: a holder always receives the pro rata slice of
 * everything the allocator holds (idle USDG, shares of every target vault and
 * any stock dust a router returned), so exits never depend on a price, a swap
 * or the keeper. A holder may forfeit the slice of a vault whose shares can no
 * longer be transferred instead of being blocked by it. Anyone can then exit
 * the vault shares through the normal vault flow. Stock dust is not counted in
 * totalAssets, which errs on the side of existing holders being under, not
 * over, valued by at most the loss limit of one move.
 *
 * Every parameter change goes through a 24 hour review window and expires a
 * week after it becomes executable, except the changes that only reduce risk
 * (pause, disable or write off a target, lower the cap or the fee), which
 * apply at once.
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
    uint256 public constant MOVE_COOLDOWN = 1 hours;
    uint256 private constant VIRTUAL_SHARES = 1e6;
    uint256 private constant VIRTUAL_ASSETS = 1;

    IERC20 public immutable USDG;
    uint256 public depositCap; // in USDG, on totalAssets after a deposit
    uint16 public depositFeeBps; // taken on the way in, sent to treasury
    uint256 public minTargetAssets; // a target vault must hold at least this much USDG of value
    uint16 public maxLossBps; // any move must keep at least (1 - this) of the value it moves, in or out
    mapping(address => uint256) public lastAllocation; // vault → last allocate timestamp, against churn
    mapping(bytes4 => bool) public delayed; // functions that only the review window may call

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
        delayed[this.setTarget.selector] = true;
        delayed[this.setDepositCap.selector] = true;
        delayed[this.setDepositFee.selector] = true;
        delayed[this.setMinTargetAssets.selector] = true;
        delayed[this.setMaxLoss.selector] = true;
        delayed[this.setTreasury.selector] = true;
        delayed[this.setKeeper.selector] = true;
        delayed[this.setGuardian.selector] = true;
        delayed[this.transferOwnership.selector] = true;
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

    /// Idle USDG plus the value of every target position. Reverts while any held target cannot be priced.
    function totalAssets() public view returns (uint256 total) {
        total = idleAssets();
        uint256 n = targetList.length;
        for (uint256 i = 0; i < n; i++) total += valueOf(targetList[i]);
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
            address stock = targets[vault].stock;
            uint256 dust = (IERC20(stock).balanceOf(address(this)) * shares) / supply;
            if (dust > 0) {
                if (!IERC20(stock).transfer(receiver, dust)) revert TransferFailed();
                emit WithdrawnStock(receiver, stock, dust);
            }
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
        if (block.timestamp < lastAllocation[vault] + MOVE_COOLDOWN) revert Cooldown();
        uint256 total = totalAssets();
        uint256 valueBefore = valueOf(vault);
        if ((valueBefore + entry.budget) * 10_000 > total * t.maxWeightBps) revert WeightExceeded();

        uint256 sharesBefore = v.balanceOf(address(this));
        uint256 idleBefore = idleAssets();
        USDG.approve(t.router, entry.budget);
        IRouter(t.router).deposit(entry);
        USDG.approve(t.router, 0);
        vaultShares = v.balanceOf(address(this)) - sharesBefore;
        // The value that arrived in the vault must cover what left, minus the loss limit: a bad swap leg cannot drain the allocator.
        uint256 spent = idleBefore - idleAssets();
        uint256 gained = valueOf(vault) - valueBefore;
        if (gained * 10_000 < spent * (10_000 - maxLossBps)) revert EntryLossTooHigh();
        lastAllocation[vault] = block.timestamp;
        emit Allocated(vault, spent, vaultShares);
    }

    /// Bring a position back to USDG through the router's protected swap. The floor must respect the exit loss limit.
    function deallocate(address vault, uint256 vaultShares, uint256 minimum, uint256 deadline, uint256 configuration, IRouter.ExitSwap calldata swap) external nonReentrant onlyKeeper returns (uint256 assetsOut) {
        Target memory t = targets[vault];
        if (t.router == address(0)) revert UnknownTarget();
        if (vaultShares == 0) revert ZeroAmount();
        IManagedVault v = IManagedVault(vault);
        if (v.router() != t.router || v.valuation() != t.valuation) revert TargetChanged();
        IValuation(t.valuation).quote();
        (, uint256 amount0, uint256 amount1,,) = v.quote(vaultShares, 0);
        uint256 expected = IValuation(t.valuation).value(amount0, amount1);
        if (minimum * 10_000 < expected * (10_000 - maxLossBps)) revert ExitFloorTooLow();
        uint256 before = idleAssets();
        v.approve(t.router, vaultShares);
        IRouter(t.router).withdrawUSDG(vaultShares, address(this), minimum, deadline, configuration, swap);
        v.approve(t.router, 0);
        assetsOut = idleAssets() - before;
        if (assetsOut < minimum) revert LossTooHigh();
        emit Deallocated(vault, vaultShares, assetsOut);
    }

    // ------------------------------------------------------------------ immediate, risk-reducing controls
    function pause() external {
        if (msg.sender != guardian && msg.sender != owner) revert NotGuardian();
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function disableTarget(address vault) external {
        if (msg.sender != guardian && msg.sender != owner) revert NotGuardian();
        if (targets[vault].router == address(0)) revert UnknownTarget();
        targets[vault].enabled = false;
        emit TargetDisabled(vault);
    }

    /// Remove a target the allocator no longer holds, so a dead vault cannot keep deposits blocked through the valuation loop.
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

    /// Stop pricing a target that can no longer be priced, so it does not block deposits. Holders still receive its shares in kind.
    function writeOff(address vault, bool writtenOff) external {
        if (msg.sender != guardian && msg.sender != owner) revert NotGuardian();
        if (targets[vault].router == address(0)) revert UnknownTarget();
        targets[vault].writtenOff = writtenOff;
        if (writtenOff) targets[vault].enabled = false;
        emit TargetWrittenOff(vault, writtenOff);
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
        if (token == address(USDG) || targets[token].router != address(0)) revert CoreToken();
        uint256 n = targetList.length;
        for (uint256 i = 0; i < n; i++) if (targets[targetList[i]].stock == token) revert CoreToken();
        uint256 amount = IERC20(token).balanceOf(address(this));
        if (amount == 0) revert ZeroAmount();
        if (!IERC20(token).transfer(treasury, amount)) revert TransferFailed();
        emit Swept(token, amount);
    }

    // ------------------------------------------------------------------ delayed changes (24 hour review window)
    function propose(bytes calldata data) external onlyOwner returns (bytes32 hash) {
        if (data.length < 4 || !delayed[bytes4(data[:4])]) revert NotDelayed();
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

    /// Whitelist a target vault, or update its maximum weight. Router and valuation are read from the vault itself.
    function setTarget(address vault, uint16 maxWeightBps) external onlySelf {
        _setTarget(vault, maxWeightBps);
    }

    function _setTarget(address vault, uint16 maxWeightBps) internal {
        if (maxWeightBps == 0 || maxWeightBps > 10_000) revert WeightExceeded();
        address router = IManagedVault(vault).router();
        address valuation = IManagedVault(vault).valuation();
        if (router == address(0) || valuation == address(0)) revert ZeroAddress();
        if (IRouter(router).asset() != address(USDG)) revert CoreToken();
        address stock = IValuation(valuation).stock();
        if (stock == address(0) || stock == address(USDG)) revert ZeroAddress();
        if (targets[vault].router == address(0)) {
            if (targetList.length >= MAX_TARGETS) revert TooManyTargets();
            targetList.push(vault);
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
