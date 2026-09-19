import type { ManagedVaultRegistryEntry } from "./registry";

export type HoldingsPosition = {
  id: string;
  pool: string;
  stockToken: string;
  adapter: string;
  symbol: string;
  status: "active" | "waiting" | "recovery" | "unavailable";
  assets: string | null;
  unclaimedFees: string | null;
  targetWeightBps: number;
  tokenId: string | null;
  positionManager: string;
  lower: number | null;
  upper: number | null;
  current: number | null;
  inRange: boolean | null;
  nextActionAt: string | null;
};

export type VaultHoldings = {
  vault: string;
  block: string;
  observedAt: string;
  idleAssets: string | null;
  totalAssets: string | null;
  positions: HoldingsPosition[];
};

export type FeeAprInfo = {
  source: "vault-fees-v1";
  windowHours: number;
  observedSeconds: number;
  asOf: string;
  stale: boolean;
};

export type ManagedState = {
  block: string;
  updated: number;
  supply: string;
  balance: string;
  lower: number;
  upper: number;
  open: boolean;
  stopped: boolean;
  recovery: boolean;
  restart: boolean;
  epoch: string;
  price: string;
  tick: number;
  poolLiquidity: string;
  decimals: [number, number];
  symbols: [string, string];
  cases: [boolean, boolean];
  fees: [string, string];
  pending: [string, string];
  inventory: [string, string];
  quote: { answer: string; decimals: number; updatedAt: string; roundId: string } | null;
  /** Null while the Chainlink reference is stale: the valuation reverts and the vault fails closed. */
  value: string | null;
  escrows: [string | null, string | null];
};

export type SnapshotExtras = {
  displayPriceAsOf: string | null;
  totalSupply: string;
  shareDecimals: number;
  ownerShares: string | null;
  feeApr: FeeAprInfo | null;
  managedState: ManagedState;
  buybackReserveCurrentUsd: string | null;
  /** "oracle" when the valuation contract priced the vault; "pool" when the Chainlink reference was stale and the inventory was valued at the Uniswap pool price instead. */
  valuedBy: "oracle" | "pool";
};

export type VaultSnapshot = {
  observedAt: string;
  block: string;
  assets: string | null;
  fees: string | null;
  buyback: string | null;
  holdings: VaultHoldings | null;
  rates: unknown[];
  apr: number | null;
  aprAsOf: string | null;
  feeBps: number;
  vaultData: null;
  extras: SnapshotExtras | null;
  tokenFees: { token: string; gross: string; buyback: string }[];
  history: { date: string; apr?: number }[];
  priceHistory: { date: string; dexPriceUsd: number }[];
};

export type VaultDescriptor = {
  id: string;
  kind: "managed" | "single" | "basket";
  vault: string;
  managed?: ManagedVaultRegistryEntry;
  policy?: string;
  public: boolean;
};

export type VaultSnapshotRow = {
  descriptor: VaultDescriptor;
  snapshot: VaultSnapshot | null;
  stale: boolean;
};

export type VaultSnapshotsResponse = {
  version: 1;
  data: VaultSnapshotRow[];
  refreshIntervalSeconds: number;
  source: "onchain" | "upstream";
};
