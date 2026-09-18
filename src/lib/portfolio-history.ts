import { createPublicClient, decodeEventLog, http, parseAbiItem, type Address, type Hex, type PublicClient } from "viem";
import { robinhoodChain, USDG_ADDRESS } from "./chain";
import type { VaultPin } from "./registry";

const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const ZERO = "0x0000000000000000000000000000000000000000";
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export type ActivityEvent = {
  hash: Hex;
  block: bigint;
  time: number | null;
  pin: VaultPin;
  kind: "deposit" | "withdraw";
  shares: bigint;
  /** USDG that left the wallet (deposits) or reached it (withdrawals), in 6 decimals. */
  usdgOut: bigint;
  usdgIn: bigint;
  /** Stock Token that reached the wallet on a token withdrawal, in 18 decimals. */
  stockIn: bigint;
};

export type VaultActivity = {
  pin: VaultPin;
  deposits: number;
  withdrawals: number;
  usdgIn: bigint;
  usdgOut: bigint;
  stockOut: bigint;
  events: ActivityEvent[];
};

/**
 * Reads a wallet's vault history straight from Transfer logs: share mints and
 * burns on each vault, then the USDG and Stock Token legs inside those same
 * transactions. Nothing is stored; every number comes from the receipts.
 */
export async function loadActivity(owner: Address, pins: VaultPin[], client: PublicClient, maxTxs = 300): Promise<VaultActivity[]> {
  const vaults = pins.map((p) => p.vault as Address);
  const [mints, burns] = await Promise.all([
    client.getLogs({ address: vaults, event: TRANSFER, args: { to: owner }, fromBlock: 0n, toBlock: "latest" }),
    client.getLogs({ address: vaults, event: TRANSFER, args: { from: owner }, fromBlock: 0n, toBlock: "latest" }),
  ]);
  const hashes = [...new Set([...mints, ...burns].map((l) => l.transactionHash))].slice(-maxTxs);
  const receipts = await Promise.all(hashes.map((h) => client.getTransactionReceipt({ hash: h })));
  const blocks = [...new Set(receipts.map((r) => r.blockNumber))];
  const times = new Map<bigint, number>();
  await Promise.all(blocks.map(async (b) => times.set(b, Number((await client.getBlock({ blockNumber: b })).timestamp) * 1000)));
  const byVault = new Map<string, VaultActivity>();
  for (const pin of pins) byVault.set(pin.vault.toLowerCase(), { pin, deposits: 0, withdrawals: 0, usdgIn: 0n, usdgOut: 0n, stockOut: 0n, events: [] });
  for (const r of receipts) {
    const transfers: { token: string; from: string; to: string; value: bigint }[] = [];
    for (const log of r.logs) {
      try {
        const ev = decodeEventLog({ abi: [TRANSFER], data: log.data, topics: log.topics });
        transfers.push({ token: log.address, from: ev.args.from, to: ev.args.to, value: ev.args.value });
      } catch {}
    }
    for (const pin of pins) {
      const stock = same(pin.preview.token0, USDG_ADDRESS) ? pin.preview.token1 : pin.preview.token0;
      const minted = transfers.filter((t) => same(t.token, pin.vault) && same(t.to, owner)).reduce((a, t) => a + t.value, 0n);
      const burned = transfers.filter((t) => same(t.token, pin.vault) && same(t.from, owner)).reduce((a, t) => a + t.value, 0n);
      if (minted === 0n && burned === 0n) continue;
      const usdgOut = transfers.filter((t) => same(t.token, USDG_ADDRESS) && same(t.from, owner)).reduce((a, t) => a + t.value, 0n);
      const usdgIn = transfers.filter((t) => same(t.token, USDG_ADDRESS) && same(t.to, owner)).reduce((a, t) => a + t.value, 0n);
      const stockIn = transfers.filter((t) => same(t.token, stock) && same(t.to, owner)).reduce((a, t) => a + t.value, 0n);
      const kind: ActivityEvent["kind"] = minted > burned ? "deposit" : "withdraw";
      const acc = byVault.get(pin.vault.toLowerCase())!;
      const ev: ActivityEvent = { hash: r.transactionHash, block: r.blockNumber, time: times.get(r.blockNumber) ?? null, pin, kind, shares: kind === "deposit" ? minted - burned : burned - minted, usdgOut, usdgIn, stockIn };
      acc.events.push(ev);
      if (kind === "deposit") {
        acc.deposits += 1;
        acc.usdgOut += usdgOut - usdgIn; // leftovers the router returns count against the deposit
      } else {
        acc.withdrawals += 1;
        acc.usdgIn += usdgIn - usdgOut;
        acc.stockOut += stockIn;
      }
    }
  }
  const out = [...byVault.values()].filter((v) => v.events.length);
  for (const v of out) v.events.sort((a, b) => Number(b.block - a.block));
  return out.sort((a, b) => Number((b.events[0]?.block ?? 0n) - (a.events[0]?.block ?? 0n)));
}

export const ZERO_ADDRESS = ZERO;

let relay: PublicClient | undefined;
/**
 * Log scans need the official endpoint (the public mirrors cap the block
 * range), and the browser cannot call it directly, so history goes through
 * the same-origin relay, which tries the official endpoint first.
 */
export function historyClient(): PublicClient {
  if (typeof window === "undefined") throw new Error("historyClient is browser-only");
  relay ??= createPublicClient({ chain: robinhoodChain, transport: http("/api/rpc", { batch: true, timeout: 45_000, retryCount: 1 }) }) as PublicClient;
  return relay;
}
