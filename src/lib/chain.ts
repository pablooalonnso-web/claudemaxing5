import { createPublicClient, defineChain, http, type PublicClient } from "viem";

export const USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as const;
export const USDG_DECIMALS = 6;

/** Protocol token (buyback + burn target). */
export const TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ??
  "0x440e339a46eaa3bE8d723c2cBED2A30af74536D5") as `0x${string}`;
export const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;

export const EXPLORER_URL = "https://robinhoodchain.blockscout.com";

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  network: "robinhood-chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: { name: "Robinhood Chain Explorer", url: EXPLORER_URL },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
});

let client: PublicClient | undefined;

/** Shared read-only client (safe on server and browser). */
export function publicClient(): PublicClient {
  if (!client) {
    client = createPublicClient({
      chain: robinhoodChain,
      transport: http(undefined, { batch: true, timeout: 12_000 }),
      batch: { multicall: { wait: 16 } },
    }) as PublicClient;
  }
  return client;
}

export const explorerAddress = (address: string) => `${EXPLORER_URL}/address/${address}`;
export const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
