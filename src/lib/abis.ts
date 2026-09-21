import { parseAbi } from "viem";

export const erc20Abi = parseAbi([
  "function decimals() view returns(uint8)",
  "function symbol() view returns(string)",
  "function name() view returns(string)",
  "function totalSupply() view returns(uint256)",
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
  "function transfer(address,uint256) returns(bool)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);

/** Managed (V7) vault: one USDG / Stock Token concentrated-liquidity position. */
export const managedVaultAbi = parseAbi([
  "function VERSION() view returns(uint256)",
  "function token0() view returns(address)",
  "function token1() view returns(address)",
  "function position() view returns(address)",
  "function router() view returns(address)",
  "function valuation() view returns(address)",
  "function keeper() view returns(address)",
  "function admin() view returns(address)",
  "function guardian() view returns(address)",
  "function treasury() view returns(address)",
  "function buyback() view returns(address)",
  "function recoveryFactory() view returns(address)",
  "function maxSwapLossBps() view returns(uint16)",
  "function minimumLiquidity() view returns(uint128)",
  "function entryOpen() view returns(bool)",
  "function stopped() view returns(bool)",
  "function recovery() view returns(bool)",
  "function restartRequired() view returns(bool)",
  "function epoch() view returns(uint256)",
  "function executionNonce() view returns(uint256)",
  "function lastRebalance() view returns(uint256)",
  "function lower() view returns(int24)",
  "function upper() view returns(int24)",
  "function totalSupply() view returns(uint256)",
  "function balanceOf(address) view returns(uint256)",
  "function inventory() view returns(uint256,uint256)",
  "function idle() view returns(uint256,uint256)",
  "function grossFees(uint256) view returns(uint256)",
  "function protocolFees(uint256) view returns(uint256)",
  "function buybackFees(uint256) view returns(uint256)",
  "function caseOpened(uint256) view returns(bool)",
  "function recoveryEscrow(uint256) view returns(address)",
  "function quote(uint256,uint128) view returns(uint128,uint256,uint256,uint256,uint256)",
  "function redeem(uint256,address,address,uint256,uint256,uint256) returns(uint256,uint256)",
  "function redeemHealthy(uint256,address,uint256) returns(uint256)",
  "event Rebalanced(uint256 nonce,int24 lower,int24 upper)",
]);

export const managedPositionAbi = parseAbi([
  "function vault() view returns(address)",
  "function pool() view returns(address)",
  "function manager() view returns(address)",
  "function liquidity() view returns(uint128)",
  "function required(uint128,int24,int24) view returns(uint256,uint256)",
  "function liquidityFloor() view returns(uint128)",
  "function pendingFees() view returns(uint256,uint256)",
]);

export const managedValuationAbi = parseAbi([
  "function pool() view returns(address)",
  "function guard() view returns(address)",
  "function asset() view returns(address)",
  "function stock() view returns(address)",
  "function assetDecimals() view returns(uint8)",
  "function stockDecimals() view returns(uint8)",
  "function maxDeviationBps() view returns(uint16)",
  "function quote() view returns((uint256 answer,uint8 decimals,uint256 updatedAt,uint80 roundId))",
  "function value(uint256,uint256) view returns(uint256)",
]);

export const managedRouterAbi = parseAbi([
  "function vault() view returns(address)",
  "function pool() view returns(address)",
  "function asset() view returns(address)",
  "function deposit((uint256 budget,(uint256 amount,uint256 minOut,uint160 sqrtLimit,bytes route) swap,(uint256 shares,uint128 bootstrapLiquidity,uint256 maximum0,uint256 maximum1,uint256 minShares,uint256 deadline,uint256 configuration,address receiver,bool acquire) join)) returns(uint256)",
  "function withdrawUSDG(uint256 shares,address receiver,uint256 minimum,uint256 deadline,uint256 configuration,(uint256 minOut,uint160 sqrtLimit,bytes route) swap) returns(uint256)",
]);

export const uniswapV3PoolAbi = parseAbi([
  "function token0() view returns(address)",
  "function token1() view returns(address)",
  "function factory() view returns(address)",
  "function fee() view returns(uint24)",
  "function tickSpacing() view returns(int24)",
  "function liquidity() view returns(uint128)",
  "function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function observe(uint32[]) view returns(int56[],uint160[])",
  "event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)",
]);

export const uniswapV3FactoryAbi = parseAbi([
  "function getPool(address,address,uint24) view returns(address)",
]);

export const uniswapQuoterV2Abi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);

export const uniswapSwapRouterAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns(uint256 amountOut)",
]);

export const chainlinkFeedAbi = parseAbi([
  "function decimals() view returns(uint8)",
  "function latestRoundData() view returns(uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)",
]);

export const guardAbi = parseAbi([
  "function feedConfig(address) view returns(address priceFeed,uint32 heartbeat,uint8 decimals,bool enabled)",
  "function keeperPaused() view returns(bool)",
]);

/** USDG lending market collateralised by managed vault shares. */
export const lendingMarketAbi = parseAbi([
  "error Closed()",
  "error Invalid()",
  "error Dust()",
  "error CashLimited()",
  "error Unhealthy()",
  "error ExecutionTooSmall()",
  "error Receipt()",
  "error Unauthorized()",
  "error OracleUnavailable()",
  "error ERC20InsufficientAllowance(address,uint256,uint256)",
  "function stockRecovery() view returns(address)",
  "function asset() view returns(address)",
  "function vault() view returns(address)",
  "function adapter() view returns(address)",
  "function config() view returns(uint256 maxLtvBps,uint256 liquidationThresholdBps,uint256 bonusBps,uint256 closeFactorBps,uint256 reserveFactorBps,uint256 concentrationBps,uint256 supplyCap,uint256 borrowCap,uint256 minDebt,uint256 kink,uint256 baseApr,uint256 slope1Apr,uint256 slope2Apr,uint256 fullLiquidationHf,uint256 minExecutionOut,uint256 graceSeconds,uint256 graceHaircutBps,uint256 recoveryDiscountBps,uint256 maxSaleBps,uint256 fallbackDelay,uint256 minStockUnit)",
  "function state() view returns(uint8)",
  "function totals() view returns(uint256 debt,uint256 reserve,uint256 interest)",
  "function totalSupplyAssets() view returns(uint256)",
  "function cash() view returns(uint256)",
  "function borrowApr() view returns(uint256)",
  "function totalSupplyShares() view returns(uint256)",
  "function totalCollateral() view returns(uint256)",
  "function supplyShares(address) view returns(uint256)",
  "function borrowShares(address) view returns(uint256)",
  "function totalBorrowShares() view returns(uint256)",
  "function collateralShares(address) view returns(uint256)",
  "function debtOf(address) view returns(uint256)",
  "function claimOf(address) view returns(uint256)",
  "function unsettledAccounts() view returns(uint256)",
  "function recoveryStarted() view returns(bool)",
  "function collateralAccounts() view returns(uint256)",
  "function borrowerAccounts() view returns(uint256)",
  "function badDebt() view returns(uint256)",
  "function reserveAbsorbed() view returns(uint256)",
  "function oracleStatus() view returns(bool,uint8,bytes4)",
  "function lastAccrual() view returns(uint256)",
  "function reserveUsdg() view returns(uint256)",
  "function payoutHeld() view returns(uint256)",
  "function accrue()",
  "function supply(uint256 amount, uint256 minUnits) returns(uint256)",
  "function withdraw(uint256 units, uint256 minAmount) returns(uint256)",
  "function pledge(uint256 amount)",
  "function withdrawCollateral(uint256 shares)",
  "function borrow(uint256 amount) returns(uint256)",
  "function repay(address owner,uint256 maximum) returns(uint256)",
]);

export const lendingLimitsAbi = parseAbi([
  "function currentLimits() view returns(uint256 maxLtvBps,uint256 concentrationBps,uint256 supplyCap,uint256 borrowCap)",
]);

export const lendingValuationAbi = parseAbi([
  "function price() view returns(uint256 valuePerShare,uint256 configuration)",
  "function settlementStatus() view returns(bool,uint8,bytes4)",
]);
