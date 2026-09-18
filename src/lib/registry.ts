import managedVaults from "@/data/managed-vaults.json";

export type ManagedVaultRegistryEntry = {
  id: string;
  name: string;
  chainId: number;
  version: number;
  vault: string;
  pool: string;
  token0: string;
  token1: string;
  asset: string;
  fee: number;
  oracle: string;
  position: string;
  router: string;
  keeper: string;
  admin: string;
  guardian: string;
  treasury: string;
  buyback: string;
  factory: string;
  manager: string;
  guard: string;
  recoveryFactory: string;
  runtimeHashes: Record<string, string>;
  minLiquidity: string;
  liquidityFloor: string;
  maxSwapLossBps: number;
  maxDeviationBps: number;
  [key: string]: unknown;
};

/** Every reviewed managed-vault deployment (all versions), as published by the protocol. */
export const MANAGED_VAULTS = managedVaults as ManagedVaultRegistryEntry[];

/**
 * The 18 user-facing V7 vaults, one per Stock Token. Older deployments stay in
 * the registry for history but are hidden from the directory.
 */
export const VAULT_PINS: { id: string; vault: string; symbol: string }[] = [
  { id: "cafb2c06-3fea-4126-962f-ed08b20890a2", vault: "0xF8DE3bC8F4e577Bc59f166b1DAA391c8C69c73D5", symbol: "AMZN" },
  { id: "055c02d0-7d61-4909-9331-47a1785c4f15", vault: "0x5eaD63f22B2cF752d0F4aE4bcA2BD51cf83A641e", symbol: "AAPL" },
  { id: "bb5b0a09-2aaa-4ded-95e4-c5affb3593b8", vault: "0x6bAb969D9927c8B17BC9dd42851c7b96E014532d", symbol: "AMD" },
  { id: "72d86731-5197-4b10-a173-a49cff22a770", vault: "0xB20bb3f29cd2f85cF06C240cE3302698e27f221d", symbol: "CRCL" },
  { id: "d7f45f87-e667-498f-9e78-dc7ada88cce8", vault: "0x9A8D2bB5684D03aa661B86859b960eF9BBe5087b", symbol: "GME" },
  { id: "f0c31faa-7297-48e9-810c-85164d8ac4eb", vault: "0x605829eEb18BDdA45FC165A9d0cc19bFDEbF3A02", symbol: "GOOGL" },
  { id: "021a6d67-f26d-4ac7-8033-ff87e7a532cc", vault: "0x70752181e01197bD2e52575d03b9c323ea8f26Bd", symbol: "INTC" },
  { id: "19b7052a-8afe-4b88-bab4-a36b16239fd4", vault: "0xE0d7196D0e7Bdd3b53a11970a4edfa327DB76456", symbol: "META" },
  { id: "3903a1b1-a132-4c3a-9de4-73612860188a", vault: "0x387f9820DB494eC1fAeb9105a3c9E6226caCb057", symbol: "MSFT" },
  { id: "42bfd7df-7574-4ea0-aea7-f2fcd918f7ed", vault: "0x2f936437A681b89cccd98a74f02Ee5779F6B559D", symbol: "MSTR" },
  { id: "5be58f17-5c63-4651-92fa-2a952be823d7", vault: "0x3BB0a114C2e491520806d9a546e1D7f354241026", symbol: "MU" },
  { id: "c211f562-99e7-4da9-8456-0d3e680464a1", vault: "0xc5aF3186b7b207beDd865eCcf344F5f0C69CA876", symbol: "NVDA" },
  { id: "6d73bf45-bf98-4e14-8111-f7fb615ad717", vault: "0xD72F1596Bf2b787af95cfe2BBF792B75ADE9400c", symbol: "PLTR" },
  { id: "bc0240e2-d6b7-44cd-8360-1381835794ad", vault: "0x3f70f06D6fB574731e789Ee03DFa4E8f60783dDf", symbol: "QQQ" },
  { id: "958a484d-011b-4ab2-898c-47bc9cf0ccfe", vault: "0x8197D34E8ed1d261aC462d898083eCBf8d5254b9", symbol: "SNDK" },
  { id: "93c857cf-50a1-4104-997a-07c883536f61", vault: "0x03504EcAEB6302db390Aa676A2636cf764f279a2", symbol: "SPCX" },
  { id: "51baf242-d8ba-4971-bc32-8d6f72c5b75f", vault: "0x21ff4df049143dC698761a07949bd3e769aA3787", symbol: "SPY" },
  { id: "fdb86e76-8b3c-46f5-935f-98da33745e3b", vault: "0x78814fdC1AfD07ae859409F44B5D57DeA6798eF6", symbol: "TSLA" },
];

export type VaultPin = {
  id: string;
  name: string;
  symbol: string;
  vault: string;
  href: string;
  preview: ManagedVaultRegistryEntry;
};

export function vaultSymbol(entry: { name: string }) {
  return entry.name.replace(/\s+managed\s+vault$/i, "").replace(/\s+vault$/i, "");
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Registry entries for the public V7 vaults, in directory order. */
export function directoryVaults(): VaultPin[] {
  return VAULT_PINS.flatMap((pin) => {
    const entry = MANAGED_VAULTS.find((m) => m.id === pin.id && same(m.vault, pin.vault));
    if (!entry) return [];
    return [{ id: entry.id, name: entry.name, symbol: pin.symbol, vault: entry.vault, href: `/vaults/${encodeURIComponent(entry.id)}`, preview: entry }];
  });
}

export function findVaultById(id: string): VaultPin | undefined {
  const entry = MANAGED_VAULTS.find((m) => m.id === id);
  if (!entry) return undefined;
  const pin = VAULT_PINS.find((p) => p.id === id);
  return { id: entry.id, name: entry.name, symbol: pin?.symbol ?? vaultSymbol(entry), vault: entry.vault, href: `/vaults/${encodeURIComponent(entry.id)}`, preview: entry };
}

export function findVaultByAddress(address: string): VaultPin | undefined {
  const entry = MANAGED_VAULTS.find((m) => same(m.vault, address));
  return entry ? findVaultById(entry.id) : undefined;
}

/** The lending markets reviewed for this deployment. */
export const LENDING_MARKETS = [
  {
    id: "meta-v7-lending-production-r55-draft",
    slug: "meta",
    name: "META V7 Lending",
    symbol: "META",
    chainId: 4663,
    market: "0x011Dd3272f8FA75F05F1Ab30A4DD77364816a59e",
    vault: "0xE0d7196D0e7Bdd3b53a11970a4edfa327DB76456",
    vaultId: "19b7052a-8afe-4b88-bab4-a36b16239fd4",
    adapter: "0xe0A8051aa06CB46dA3cA3A2E7fC3C89c6bCA1ED8",
    limits: "0x56ce9ab678fF46E32370fdBcECf95FFE27434F57",
    valuation: "0x66557AD72039b6d2Ce5D72072465F1F36B7F207E",
    guard: "0xC2AA08D1b9f6d130c4f88481C73Ff5Dc3a4179eb",
    stock: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35",
    usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    deploymentBlock: "62494078",
    deploymentTransaction: "0x4c27d8f0a9ce24ffe712f7fa7bf5eadac544658c24b344ec556fd2761056e554",
    sourceCommit: "a0a0dc98b6bf2608d0e3b54ad538a8f6077c8589",
    compiler: "0.8.24+optimizer.1+viaIR+cancun",
    guardian: "0x7794ad08bf55187527617859d44fBED2462eEaB7",
    treasury: "0x9b46347B947b0Be2ee450425D0278Fe02BEB2080",
  },
] as const;

export type LendingMarketPin = (typeof LENDING_MARKETS)[number];

export function findLendingMarket(slugOrId: string): LendingMarketPin | undefined {
  const key = slugOrId.toLowerCase();
  return LENDING_MARKETS.find((m) => m.slug === key || m.id === key || m.symbol.toLowerCase() === key);
}
