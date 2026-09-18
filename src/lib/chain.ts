import { createPublicClient, defineChain, fallback, http, type PublicClient } from "viem";

export const USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as const;
export const USDG_DECIMALS = 6;

/** Protocol token (buyback + burn target). */
export const TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS ??
  "0x730ee7a12397C8De8CF86Ad70B918626654882c8") as `0x${string}`;
export const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;

export const EXPLORER_URL = "https://robinhoodchain.blockscout.com";

/**
 * Public JSON-RPC endpoints for Robinhood Chain, in order of preference. The
 * official endpoint sits behind a bot challenge that sometimes answers server
 * traffic with a 403 page, so reads fall through to the next endpoint.
 * Override with a comma-separated RPC_URLS.
 */
export const RPC_URLS: string[] = (
  process.env.RPC_URLS ??
  [
    process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com",
    "https://robinhood-rpc.publicnode.com",
    "https://robinhood.rpc.blxrbdn.com",
    "https://rpc.ordofi.network",
    "https://rpc.nodeflare.app/robinhood/public",
  ].join(",")
)
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

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

/**
 * Shared read-only client. The server talks to the RPC directly; the browser
 * does too, but falls back to the same-origin relay at /api/rpc when the
 * public endpoint answers without CORS headers (rate limits, edge errors).
 */
export function publicClient(): PublicClient {
  if (!client) {
    const direct = http(undefined, { batch: true, timeout: 12_000, retryCount: 1 });
    const transport =
      typeof window === "undefined"
        ? fallback(
            RPC_URLS.map((url) => http(url, { batch: true, timeout: 12_000, retryCount: 0 })),
            { rank: false },
          )
        : fallback([direct, http("/api/rpc", { batch: true, timeout: 15_000 })], { rank: false });
    client = createPublicClient({
      chain: robinhoodChain,
      transport,
      batch: { multicall: { wait: 16 } },
    }) as PublicClient;
  }
  return client;
}

export const explorerAddress = (address: string) => `${EXPLORER_URL}/address/${address}`;
export const explorerTx = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
