/**
 * Vertex verification run.
 *
 * Exercises the live contracts on Robinhood Chain and the production site the
 * same way the app does, without sending a transaction. Every deposit and
 * withdrawal is an eth_call simulation: a throwaway account is given a USDG
 * (or vault share) allowance and balance through state overrides so the
 * router can be executed end to end inside the node. Nothing is signed.
 *
 *   npm run verify                       # chain + site (usevertex.xyz)
 *   npm run verify -- --site http://localhost:3000
 *   npm run verify -- --no-site          # chain only
 *   npm run verify -- --build            # also run typecheck and lint
 *
 * Writes public/verification/latest.json (served at /verification/latest.json
 * and rendered at /verify) and verification/<date>.md.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, encodeAbiParameters, formatUnits, http, keccak256, pad, parseUnits, toHex, type Address, type Hex, type PublicClient } from "viem";
import { erc20Abi, managedPositionAbi, managedRouterAbi, managedValuationAbi, managedVaultAbi } from "@/lib/abis";
import { BRAND } from "@/lib/brand";
import { BURN_ADDRESS, robinhoodChain, TOKEN_ADDRESS, USDG_ADDRESS } from "@/lib/chain";
import { buildDepositQuote, readManagedState, swapSqrtLimit } from "@/lib/managed-vault";
import { LENDING_MARKETS, MANAGED_VAULTS, VAULT_PINS, type ManagedVaultRegistryEntry } from "@/lib/registry";
import { getLendingMarkets, getLendingPosition } from "@/server/lending";
import { getStatus } from "@/server/status";
import { kyberBuild, kyberRoute } from "@/server/trade";

import type { VerificationCheck as Check, VerificationGroup as Group, VerificationReport as Report, VerificationStatus as Status } from "@/lib/verification";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const SITE = flag("--no-site") ? null : opt("--site", BRAND.siteUrl).replace(/\/$/, "");
const ONLY = opt("--only", "");
const OUT = opt("--out", "public/verification/latest.json");

const TEST_ACCOUNT = BURN_ADDRESS as Address; // never holds a key; only used inside eth_call simulations
const DEPOSIT_USDG = parseUnits("100", 6);
/** The split the site describes; the fee counters on every vault are checked against it. */
const CLAIM = { buyback: 20, treasury: 10 };
const MAX = ("0x" + "f".repeat(64)) as Hex;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const pct = (part: bigint, whole: bigint) => (whole === 0n ? null : Number((part * 1_000_000n) / whole) / 10_000);
const fmtPct = (v: number | null) => (v === null ? "n/a" : `${v.toFixed(2)}%`);
const amount = (raw: bigint, decimals: number, significant = 6) => {
  const n = Number(formatUnits(raw, decimals));
  if (n === 0) return "0";
  const digits = Math.max(0, significant - 1 - Math.floor(Math.log10(Math.abs(n))));
  return n.toLocaleString("en-US", { maximumFractionDigits: Math.min(18, digits) });
};
const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 220);

const client: PublicClient = createPublicClient({
  chain: robinhoodChain,
  transport: http(undefined, { timeout: 30_000, retryCount: 2 }),
  batch: { multicall: { wait: 16 } },
}) as PublicClient;

const wants = (id: string) => !ONLY || ONLY.split(",").includes(id);
const groups: Group[] = [];
function group(id: string, title: string, description: string) {
  const g: Group = { id, title, description, checks: [] };
  groups.push(g);
  return g;
}
async function check(g: Group, name: string, fn: () => Promise<{ status?: Status; detail: string }>) {
  if (!wants(g.id)) return null;
  const t0 = Date.now();
  let c: Check | null = null;
  // The public RPC sits behind a pool of nodes and occasionally drops a burst or lands on a node without state-override support; transient errors get five tries.
  for (let attempt = 1; attempt <= 5 && !c; attempt++) {
    try {
      const r = await fn();
      c = { name, status: r.status ?? "pass", detail: r.detail, ms: Date.now() - t0 };
    } catch (e) {
      const transient = /RPC Request failed|invalid parameters|took too long|timed? ?out|rate limit|429|502|503|fetch failed|socket/i.test(firstLine(e));
      if (transient && attempt < 5) await new Promise((r) => setTimeout(r, 2500 * attempt));
      else c = { name, status: "fail", detail: firstLine(e), ms: Date.now() - t0 };
    }
  }
  c ??= { name, status: "fail", detail: "No result", ms: Date.now() - t0 };
  g.checks.push(c);
  const mark = { pass: "PASS", fail: "FAIL", warn: "WARN", skip: "SKIP" }[c.status];
  console.log(`${mark.padEnd(5)} ${g.id}/${name}: ${c.detail}`);
  return c;
}

const LIVE = VAULT_PINS.map((pin) => ({ pin, entry: MANAGED_VAULTS.find((e) => e.id === pin.id && same(e.vault, pin.vault))! })).filter((x) => x.entry);

/** Finds the mapping base slot whose (owner) entry the contract reads for `fn`, by probing overrides. */
async function probeSlot(token: Address, fn: "balanceOf" | "allowance", owner: Address, spender?: Address): Promise<{ base: number; slot: Hex } | null> {
  for (let base = 0; base < 64; base++) {
    const inner = keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [owner, pad(toHex(base), { size: 32 })]));
    const slot = fn === "allowance" ? keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [spender!, inner])) : inner;
    const probe = 0x5eed5eedn;
    const value = await client
      .readContract({ address: token, abi: erc20Abi, functionName: fn, args: fn === "allowance" ? [owner, spender!] : [owner], stateOverride: [{ address: token, stateDiff: [{ slot, value: pad(toHex(probe), { size: 32 }) }] }] } as never)
      .catch(() => 0n);
    if (value === probe) return { base, slot };
  }
  return null;
}
const mappingSlot = (owner: Address, base: number) => keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [owner, pad(toHex(base), { size: 32 })]));
const allowanceSlot = (owner: Address, spender: Address, base: number) => keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [spender, mappingSlot(owner, base)]));

async function main() {
  const startedAt = new Date();
  console.log(`${BRAND.name} verification · ${startedAt.toISOString()} · site ${SITE ?? "skipped"}`);
  let commit: string | null = null;
  try {
    commit = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {}

  // ---------------------------------------------------------------- network
  const net = group("network", "Network", "The RPC endpoint the app reads from, and the chain behind it.");
  const chainId = await client.getChainId();
  const head = await client.getBlock({ blockTag: "latest" });
  await check(net, "Chain id", async () => ({ status: chainId === robinhoodChain.id ? "pass" : "fail", detail: `eth_chainId returned ${chainId} (expected ${robinhoodChain.id}, Robinhood Chain)` }));
  await check(net, "Chain head", async () => {
    const age = Math.floor(Date.now() / 1000) - Number(head.timestamp);
    return { status: age < 120 ? "pass" : "warn", detail: `Block ${head.number} sealed ${age}s ago` };
  });
  await check(net, "Multicall3", async () => {
    const code = await client.getCode({ address: robinhoodChain.contracts!.multicall3!.address });
    return { status: code && code !== "0x" ? "pass" : "fail", detail: code && code !== "0x" ? `Contract present at ${short(robinhoodChain.contracts!.multicall3!.address)}, batched reads work` : "No code at the multicall3 address" };
  });

  // -------------------------------------------------------------- contracts
  const con = group("contracts", "Contracts", "Token contracts and the wiring between each vault, its router, oracle and position.");
  await check(con, "USDG", async () => {
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: USDG_ADDRESS, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: USDG_ADDRESS, abi: erc20Abi, functionName: "decimals" }),
    ]);
    return { status: symbol === "USDG" && decimals === 6 ? "pass" : "fail", detail: `${symbol}, ${decimals} decimals at ${short(USDG_ADDRESS)}` };
  });
  await check(con, `${BRAND.name} token`, async () => {
    const [name, symbol, decimals, supply, burned] = await Promise.all([
      client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "name" }),
      client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "decimals" }),
      client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "totalSupply" }),
      client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [BURN_ADDRESS] }),
    ]);
    return { detail: `${name} (${symbol}), ${decimals} decimals, supply ${Number(formatUnits(supply, decimals)).toLocaleString("en-US")}, ${formatUnits(burned, decimals)} at the burn address` };
  });
  await check(con, "Registry", async () => ({ status: LIVE.length === 18 ? "pass" : "fail", detail: `${LIVE.length} of ${VAULT_PINS.length} pinned vaults resolve to a version 7 registry entry (${MANAGED_VAULTS.length} entries in total)` }));
  for (const { pin, entry } of LIVE) {
    await check(con, `${pin.symbol} wiring`, async () => {
      const v = { address: entry.vault as Address, abi: managedVaultAbi } as const;
      const [version, t0, t1, position, router, valuation, treasury, buyback, rVault, rAsset, pPool, pVault, oAsset, oStock] = await Promise.all([
        client.readContract({ ...v, functionName: "VERSION" }),
        client.readContract({ ...v, functionName: "token0" }),
        client.readContract({ ...v, functionName: "token1" }),
        client.readContract({ ...v, functionName: "position" }),
        client.readContract({ ...v, functionName: "router" }),
        client.readContract({ ...v, functionName: "valuation" }),
        client.readContract({ ...v, functionName: "treasury" }),
        client.readContract({ ...v, functionName: "buyback" }),
        client.readContract({ address: entry.router as Address, abi: managedRouterAbi, functionName: "vault" }),
        client.readContract({ address: entry.router as Address, abi: managedRouterAbi, functionName: "asset" }),
        client.readContract({ address: entry.position as Address, abi: managedPositionAbi, functionName: "pool" }),
        client.readContract({ address: entry.position as Address, abi: managedPositionAbi, functionName: "vault" }),
        client.readContract({ address: entry.oracle as Address, abi: managedValuationAbi, functionName: "asset" }),
        client.readContract({ address: entry.oracle as Address, abi: managedValuationAbi, functionName: "stock" }),
      ]);
      const stock = same(entry.token0, USDG_ADDRESS) ? entry.token1 : entry.token0;
      const problems: string[] = [];
      if (Number(version) !== entry.version) problems.push(`VERSION ${version} ≠ registry ${entry.version}`);
      if (!same(t0, entry.token0) || !same(t1, entry.token1)) problems.push("pool tokens differ from registry");
      if (!same(position, entry.position)) problems.push("position differs");
      if (!same(router, entry.router)) problems.push("router differs");
      if (!same(valuation, entry.oracle)) problems.push("oracle differs");
      if (!same(treasury, entry.treasury)) problems.push("treasury differs");
      if (!same(buyback, entry.buyback)) problems.push("buyback differs");
      if (!same(rVault, entry.vault)) problems.push("router.vault differs");
      if (!same(rAsset, USDG_ADDRESS)) problems.push("router.asset is not USDG");
      if (!same(pPool, entry.pool) || !same(pVault, entry.vault)) problems.push("position wiring differs");
      if (!same(oAsset, USDG_ADDRESS) || !same(oStock, stock)) problems.push("oracle tokens differ");
      return problems.length ? { status: "fail", detail: problems.join("; ") } : { detail: `Vault ${short(entry.vault)} v${version}: router, position, oracle, treasury and buyback addresses match the registry; router settles in USDG` };
    });
  }

  // ------------------------------------------------------------ vault state
  const vs = group("vaults", "Vault state", "Live state of each of the 18 vaults, read at one block the way the vault page does.");
  const states = new Map<string, Awaited<ReturnType<typeof readManagedState>>>();
  for (const { pin, entry } of LIVE) {
    await check(vs, pin.symbol, async () => {
      const s = await readManagedState(entry, TEST_ACCOUNT, client);
      states.set(pin.id, s);
      const quoteAge = s.quote ? Math.floor(Date.now() / 1000) - Number(s.quote.updatedAt) : null;
      const inRange = s.tick > s.lower && s.tick < s.upper;
      const problems: string[] = [];
      if (!s.open || s.stopped || s.recovery || s.restart) problems.push(`deposits closed (open ${s.open}, stopped ${s.stopped}, recovery ${s.recovery}, restart ${s.restart})`);
      if (s.quote && quoteAge! > 26 * 3600) problems.push(`oracle quote ${Math.round(quoteAge! / 3600)}h old`);
      if (!inRange) problems.push(`tick ${s.tick} outside range [${s.lower}, ${s.upper}]`);
      if (s.supply === 0n) problems.push("no shares issued");
      if (s.quote && (s.value === null || s.value === 0n)) problems.push("valuation unavailable");
      if (s.cases[0] || s.cases[1]) problems.push("recovery case opened");
      const tvl = s.value ? `$${Number(formatUnits(s.value, 6)).toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "n/a";
      const detail = `Block ${s.block}: open, tick ${s.tick} in [${s.lower}, ${s.upper}], oracle quote ${quoteAge === null ? "missing" : `${Math.round(quoteAge / 60)} min old`}, value ${tvl}, ${amount(s.supply, 18)} shares`;
      if (problems.length) return { status: "fail", detail: `${problems.join("; ")} (${detail})` };
      // No quote means the Chainlink stock feed is older than the valuation accepts (markets closed). The vault fails closed by design.
      if (!s.quote) return { status: "warn", detail: `Paused by design: the Chainlink reference is stale, so the valuation reverts, deposits are refused and USDG exits wait; token exits still work (${detail})` };
      return { detail };
    });
  }

  // ------------------------------------------------------------- fee split
  const fees = group("fees", "Fee accounting", `What each vault's own counters say about the fee split. The site says ${100 - CLAIM.buyback - CLAIM.treasury}% of claimed fees compounds, ${CLAIM.buyback}% is reserved for the buyback and ${CLAIM.treasury}% goes to the protocol treasury.`);
  for (const { pin, entry } of LIVE) {
    await check(fees, pin.symbol, async () => {
      const v = { address: entry.vault as Address, abi: managedVaultAbi } as const;
      const read = (fn: "grossFees" | "protocolFees" | "buybackFees", i: bigint) => client.readContract({ ...v, functionName: fn, args: [i] });
      const [g0, g1, p0, p1, b0, b1] = await Promise.all([read("grossFees", 0n), read("grossFees", 1n), read("protocolFees", 0n), read("protocolFees", 1n), read("buybackFees", 0n), read("buybackFees", 1n)]);
      const s = states.get(pin.id);
      const legs = [
        { sym: s?.symbols[0] ?? "token0", dec: s?.decimals[0] ?? 18, g: g0, p: p0, b: b0 },
        { sym: s?.symbols[1] ?? "token1", dec: s?.decimals[1] ?? 18, g: g1, p: p1, b: b1 },
      ];
      const observed = legs.filter((l) => l.g > 0n);
      if (!observed.length) return { status: "warn", detail: "No fees collected yet, so the split cannot be observed on this vault" };
      const parts = observed.map((l) => `${l.sym} gross ${amount(l.g, l.dec)}`);
      const shares = observed.map((l) => ({ bb: pct(l.b, l.g)!, pp: pct(l.p, l.g)! }));
      const bb = shares[0].bb;
      const pp = shares[0].pp;
      const consistent = shares.every((x) => Math.abs(x.bb - bb) < 0.01 && Math.abs(x.pp - pp) < 0.01);
      const compound = 100 - bb - pp;
      const ok = consistent && Math.abs(bb - CLAIM.buyback) <= 0.5 && Math.abs(pp - CLAIM.treasury) <= 0.5;
      const observedSplit = consistent ? `${compound.toFixed(0)}% compounds, ${bb.toFixed(0)}% buyback, ${pp.toFixed(0)}% protocol treasury` : shares.map((x, i) => `${observed[i].sym}: buyback ${fmtPct(x.bb)}, protocol ${fmtPct(x.pp)}`).join("; ");
      return { status: ok ? "pass" : "fail", detail: `${ok ? "Matches what the site describes" : "Does not match what the site describes"}. Counters show ${observedSplit} (${parts.join(", ")})` };
    });
  }

  // ---------------------------------------------------------- deposit sims
  const dep = group("deposits", "Deposit simulation", "Builds a 100 USDG deposit for every vault exactly like the vault page and executes the router call inside eth_call. The test account is given a USDG balance and allowance through a state override; nothing is signed or sent.");
  const usdgBalance = await probeSlot(USDG_ADDRESS, "balanceOf", TEST_ACCOUNT);
  const usdgAllowance = LIVE[0] ? await probeSlot(USDG_ADDRESS, "allowance", TEST_ACCOUNT, LIVE[0].entry.router as Address) : null;
  await check(dep, "USDG storage layout", async () => ({
    status: usdgBalance && usdgAllowance ? "pass" : "fail",
    detail: usdgBalance && usdgAllowance ? `balances mapping at slot ${usdgBalance.base}, allowances mapping at slot ${usdgAllowance.base} (found by probing eth_call state overrides)` : "Could not locate the USDG balance or allowance slots, so router deposits cannot be simulated",
  }));
  for (const { pin, entry } of LIVE) {
    await check(dep, pin.symbol, async () => {
      if (!usdgBalance || !usdgAllowance) return { status: "skip", detail: "USDG storage layout unknown" };
      const override = [{ address: USDG_ADDRESS, stateDiff: [{ slot: usdgBalance.slot, value: pad(toHex(parseUnits("1000", 6)), { size: 32 }) }, { slot: allowanceSlot(TEST_ACCOUNT, entry.router as Address, usdgAllowance.base), value: MAX }] }];
      // Reads of the test account's USDG balance see the override, everything else is untouched.
      const proxy = { ...client, readContract: (a: Parameters<PublicClient["readContract"]>[0]) => client.readContract(same(a.address ?? "", USDG_ADDRESS) ? ({ ...a, stateOverride: override } as never) : (a as never)) } as PublicClient;
      let quote: Awaited<ReturnType<typeof buildDepositQuote>>;
      try {
        quote = await buildDepositQuote(entry, TEST_ACCOUNT, DEPOSIT_USDG, false, proxy);
      } catch (e) {
        if (/Waiting for valid prices/i.test(firstLine(e)) && !states.get(pin.id)?.quote) return { status: "warn", detail: "Refused by design: no fresh Chainlink reference, so the router will not build a deposit" };
        throw e;
      }
      const call = { address: entry.router as Address, abi: managedRouterAbi, functionName: "deposit", args: [quote.entry], account: TEST_ACCOUNT, stateOverride: override } as const;
      // Some nodes behind the public endpoint reject state overrides on eth_estimateGas; retry, then fall back to eth_call.
      let gas: bigint | null = null;
      for (let attempt = 0; attempt < 3 && gas === null; attempt++) {
        try {
          gas = await client.estimateContractGas(call);
        } catch (e) {
          if (!/invalid parameters/i.test(firstLine(e)) || attempt === 2) {
            if (!/invalid parameters/i.test(firstLine(e))) throw e;
            break;
          }
          await new Promise((r) => setTimeout(r, 600));
        }
      }
      if (gas === null) {
        const sim = await client.simulateContract(call);
        return { detail: `100 USDG → ${amount(quote.shares, 18)} shares, swap leg ${formatUnits(quote.entry.swap.amount, 6)} USDG, router.deposit executes in eth_call and mints ${amount(sim.result, 18)} shares (gas estimate unavailable from this node)` };
      }
      return { detail: `100 USDG → ${amount(quote.shares, 18)} shares, swap leg ${formatUnits(quote.entry.swap.amount, 6)} USDG, router.deposit executes with ${gas.toLocaleString("en-US")} gas` };
    });
  }

  // --------------------------------------------------------- withdraw sims
  const wd = group("withdrawals", "Withdrawal simulation", "Redeems 0.1% of each vault's supply from the test account, both as pool tokens (vault.redeem) and as USDG through the router's protected swap (router.withdrawUSDG). Share balance and allowance are injected through a state override.");
  let shareBalanceBase: number | null = null;
  let shareAllowanceBase: number | null = null;
  if (LIVE[0]) {
    shareBalanceBase = (await probeSlot(LIVE[0].entry.vault as Address, "balanceOf", TEST_ACCOUNT))?.base ?? null;
    shareAllowanceBase = (await probeSlot(LIVE[0].entry.vault as Address, "allowance", TEST_ACCOUNT, LIVE[0].entry.router as Address))?.base ?? null;
  }
  await check(wd, "Share storage layout", async () => ({
    status: shareBalanceBase !== null && shareAllowanceBase !== null ? "pass" : "fail",
    detail: shareBalanceBase !== null && shareAllowanceBase !== null ? `vault share balances at slot ${shareBalanceBase}, allowances at slot ${shareAllowanceBase}` : "Could not locate the vault share balance or allowance slots",
  }));
  for (const { pin, entry } of LIVE) {
    await check(wd, pin.symbol, async () => {
      if (shareBalanceBase === null || shareAllowanceBase === null) return { status: "skip", detail: "Share storage layout unknown" };
      const s = await readManagedState(entry, TEST_ACCOUNT, client); // fresh block so every simulation below shares one state
      const vault = entry.vault as Address;
      const router = entry.router as Address;
      const shares = s.supply / 1000n;
      if (shares === 0n) return { status: "skip", detail: "Vault has no supply" };
      const override = [{ address: vault, stateDiff: [{ slot: mappingSlot(TEST_ACCOUNT, shareBalanceBase), value: pad(toHex(shares), { size: 32 }) }, { slot: allowanceSlot(TEST_ACCOUNT, router, shareAllowanceBase), value: MAX }] }];
      const seen = await client.readContract({ address: vault, abi: erc20Abi, functionName: "balanceOf", args: [TEST_ACCOUNT], stateOverride: override });
      if (seen !== shares) return { status: "fail", detail: "Balance override was not honoured for this vault's storage layout" };
      const deadline = (await client.getBlock()).timestamp + 180n;
      const probe = await client.simulateContract({ address: vault, abi: managedVaultAbi, functionName: "redeem", args: [shares, TEST_ACCOUNT, TEST_ACCOUNT, 0n, 0n, deadline], account: TEST_ACCOUNT, stateOverride: override, blockNumber: s.block });
      const tokens = await client.simulateContract({ address: vault, abi: managedVaultAbi, functionName: "redeem", args: [shares, TEST_ACCOUNT, TEST_ACCOUNT, (probe.result[0] * 99n) / 100n, (probe.result[1] * 99n) / 100n, deadline], account: TEST_ACCOUNT, stateOverride: override, blockNumber: s.block });
      const stockIsToken0 = !same(entry.asset, entry.token0);
      const stockOut = stockIsToken0 ? probe.result[0] : probe.result[1];
      const usdgOut = stockIsToken0 ? probe.result[1] : probe.result[0];
      if (!s.quote || s.value === null) {
        const stockSym0 = stockIsToken0 ? s.symbols[0] : s.symbols[1];
        const stockDec0 = stockIsToken0 ? s.decimals[0] : s.decimals[1];
        return { status: "warn", detail: `Token exit works: ${amount(shares, 18)} shares → ${amount(stockOut, stockDec0)} ${stockSym0} + ${formatUnits(usdgOut, 6)} USDG (1% floor honoured: ${amount(tokens.result[0], s.decimals[0])} ${s.symbols[0]} and ${amount(tokens.result[1], s.decimals[1])} ${s.symbols[1]}). USDG exit waits for a fresh Chainlink reference, by design` };
      }
      const stockValue = await client.readContract({ address: entry.oracle as Address, abi: managedValuationAbi, functionName: "value", args: stockIsToken0 ? [stockOut, 0n] : [0n, stockOut], blockNumber: s.block });
      const swapLoss = s.lossLimits?.swapLossBps ?? entry.maxSwapLossBps;
      const minOut = (stockValue * BigInt(10_000 - swapLoss) + 9_999n) / 10_000n;
      const minimum = s.lossLimits ? usdgOut + minOut : (((s.value ?? 0n) * shares) / s.supply) * 98n / 100n;
      const sqrtLimit = await swapSqrtLimit(entry, stockIsToken0, s.block, s.lossLimits?.slippageBps, client);
      const usdg = await client.simulateContract({ address: router, abi: managedRouterAbi, functionName: "withdrawUSDG", args: [shares, TEST_ACCOUNT, minimum, deadline, s.epoch, { minOut, sqrtLimit, route: "0x" }], account: TEST_ACCOUNT, stateOverride: override, blockNumber: s.block });
      const stockSym = stockIsToken0 ? s.symbols[0] : s.symbols[1];
      const stockDec = stockIsToken0 ? s.decimals[0] : s.decimals[1];
      return {
        detail: `${amount(shares, 18)} shares → tokens: ${amount(stockOut, stockDec)} ${stockSym} + ${formatUnits(usdgOut, 6)} USDG · USDG only: ${formatUnits(usdg.result, 6)} USDG (floor ${formatUnits(minimum, 6)}); with a 1% floor the token route returns ${amount(tokens.result[0], s.decimals[0])} ${s.symbols[0]} and ${amount(tokens.result[1], s.decimals[1])} ${s.symbols[1]}`,
      };
    });
  }

  // ---------------------------------------------------------------- lending
  const ln = group("lending", "Lending", "The META lending market and the oracle guard behind it.");
  await check(ln, "Market state", async () => {
    const m = (await getLendingMarkets()).data[0];
    const supplied = Number(formatUnits(BigInt(m.accounting.supplied), 6)).toLocaleString("en-US", { maximumFractionDigits: 0 });
    const borrowed = Number(formatUnits(BigInt(m.accounting.borrowed), 6)).toLocaleString("en-US", { maximumFractionDigits: 0 });
    return { status: m.contractState.name === "Active" && m.oracle.available ? "pass" : "warn", detail: `${m.pin.name} ${m.contractState.name.toLowerCase()} at block ${m.block.number}: $${supplied} supplied, $${borrowed} borrowed, utilisation ${(m.rates.utilizationBps / 100).toFixed(1)}%, oracle ${m.oracle.available ? "available" : "unavailable"}, bad debt ${formatUnits(BigInt(m.badDebt), 6)}` };
  });
  await check(ln, "Position read", async () => {
    const p = await getLendingPosition(LENDING_MARKETS[0], TEST_ACCOUNT);
    return { detail: `Position endpoint answers for an arbitrary owner at block ${p.block} (supply ${p.supplyShares}, collateral ${p.collateralShares}, debt ${p.debt})` };
  });
  await check(ln, "Oracle guard", async () => {
    const st = await getStatus();
    const o = st.components.oracle;
    return { status: o.tone === "good" ? "pass" : "warn", detail: `${o.state}: ${o.detail}` };
  });

  // ------------------------------------------------------------------- swap
  const sw = group("swap", "Swap routing", "The aggregator route the trade page shows, and the calldata it would hand to the wallet.");
  const aapl = LIVE.find((x) => x.pin.symbol === "AAPL")?.entry;
  const stockOf = (e: ManagedVaultRegistryEntry) => (same(e.token0, USDG_ADDRESS) ? e.token1 : e.token0);
  let route: Awaited<ReturnType<typeof kyberRoute>> = null;
  await check(sw, "Quote 100 USDG → AAPL", async () => {
    if (!aapl) return { status: "skip", detail: "AAPL vault missing" };
    route = await kyberRoute(USDG_ADDRESS, stockOf(aapl), DEPOSIT_USDG.toString());
    if (!route) return { status: "fail", detail: "KyberSwap returned no route" };
    return { detail: `KyberSwap route: ${amount(BigInt(route.routeSummary.amountOut), 18)} AAPL out (≈$${route.routeSummary.amountOutUsd ?? "?"}), gas ${route.routeSummary.gas}` };
  });
  await check(sw, "Build calldata", async () => {
    if (!route) return { status: "skip", detail: "No route to build" };
    const built = await kyberBuild(route.routeSummary, TEST_ACCOUNT, TEST_ACCOUNT, 50);
    const code = await client.getCode({ address: built.routerAddress as Address });
    return { status: code && code !== "0x" ? "pass" : "fail", detail: `${(built.data.length - 2) / 2} bytes of calldata for router ${short(built.routerAddress)}${code && code !== "0x" ? " (contract present on chain)" : " (no code at router address)"}` };
  });

  // ------------------------------------------------------------ token supply
  const tok = group(
    "token",
    "Token and liquidity",
    "Where the VERTEX supply actually sits: the burn address, the wallets the project has used, and the pool. Liquidity on Robinhood Chain lives inside the Uniswap V4 singleton, and a liquidity position is owned by whoever holds it; these checks read the project's own wallets so anyone can confirm what they do and do not control.",
  );
  const TEAM_WALLETS: { label: string; address: Address }[] = [
    { label: "Deployer wallet", address: "0x0Ce9f80e1Ad5698d5F82B1Ce7AD4db4b835556A2" },
    { label: "Buyback wallet", address: "0xBABe28C7325f9549C406a1504B701594D27B5676" },
    { label: "Launch contract", address: "0xc90640704bDA73422469420dfc2AD0ed7aE90310" },
  ];
  const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as Hex;
  const LAUNCH_BLOCK = 65_890_000n;

  await check(tok, "Supply and burn", async () => {
    const [supply, burned] = await Promise.all([
      client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "totalSupply" }),
      client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [BURN_ADDRESS] }),
    ]);
    const share = (Number(burned) / Number(supply)) * 100;
    return { detail: `${amount(supply, 18)} minted, ${amount(burned, 18)} (${share.toFixed(2)}%) held by the burn address, ${amount(supply - burned, 18)} circulating` };
  });

  for (const w of TEAM_WALLETS) {
    await check(tok, w.label, async () => {
      const balance = await client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [w.address] });
      // An ERC-721 Transfer carries four topics (signature, from, to, tokenId); an ERC-20 Transfer carries three.
      // A Uniswap liquidity position is an ERC-721, so a wallet that has never received one cannot be holding one.
      // The public RPC pool rejects a single full-range getLogs often enough that one
      // bad response would fail the check, so the window is walked in chunks and each
      // chunk gets its own retries.
      const head = await client.getBlockNumber();
      const STEP = 250_000n;
      const rawLogs = async (topics: (Hex | null)[]) => {
        const out: { topics: Hex[] }[] = [];
        for (let from = LAUNCH_BLOCK; from <= head; from += STEP) {
          const to = from + STEP - 1n > head ? head : from + STEP - 1n;
          let chunk: { topics: Hex[] }[] | null = null;
          for (let attempt = 1; attempt <= 4 && !chunk; attempt++) {
            try {
              chunk = (await client.request({ method: "eth_getLogs", params: [{ fromBlock: toHex(from), toBlock: toHex(to), topics }] })) as { topics: Hex[] }[];
            } catch {
              await new Promise((r) => setTimeout(r, 400 * attempt));
            }
          }
          if (!chunk) throw new Error(`log query failed for blocks ${from}-${to}`);
          out.push(...chunk);
        }
        return out;
      };
      const [incoming, outgoing] = await Promise.all([rawLogs([TRANSFER_TOPIC, null, pad(w.address)]), rawLogs([TRANSFER_TOPIC, pad(w.address)])]);
      const nftsIn = incoming.filter((l) => l.topics.length === 4).length;
      const nftsOut = outgoing.filter((l) => l.topics.length === 4).length;
      const held = balance === 0n ? "holds no VERTEX" : `holds ${amount(balance, 18)} VERTEX`;
      const positions = nftsIn === 0 && nftsOut === 0 ? "and has never received or sent an ERC-721, so it holds no liquidity position" : `and has handled ${nftsIn} incoming and ${nftsOut} outgoing ERC-721 transfers`;
      return { status: nftsIn === 0 && nftsOut === 0 ? "pass" : "warn", detail: `${short(w.address)} ${held}, ${positions}` };
    });
  }

  await check(tok, "Liquidity venue", async () => {
    const pool = "0x8366a39CC670B4001A1121B8F6A443A643e40951" as Address;
    const [held, code] = await Promise.all([
      client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [pool] }),
      client.getCode({ address: pool }),
    ]);
    if (!code || code === "0x") return { status: "fail", detail: `No contract at ${short(pool)}` };
    const supply = await client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "totalSupply" });
    const share = (Number(held) / Number(supply)) * 100;
    return { detail: `${amount(held, 18)} VERTEX (${share.toFixed(2)}% of supply) sits in the Uniswap V4 singleton at ${short(pool)}, which custodies every pool on the chain` };
  });

  // ------------------------------------------------------------------- site
  const site = group("site", "Production site", SITE ? `Pages and APIs served from ${SITE}.` : "Skipped (--no-site).");
  if (SITE) {
    const get = (path: string, init?: RequestInit) => fetch(SITE + path, { ...init, redirect: "manual", signal: AbortSignal.timeout(60_000), headers: { "user-agent": "vertex-verify", ...(init?.headers ?? {}) } });
    const pages = ["/", "/vaults", `/vaults/${aapl?.id ?? VAULT_PINS[0].id}`, "/lending", "/lending/meta", "/trade/swap", "/portfolio", "/strategies", "/allocator", "/intelligence", "/docs", "/help", "/help/contact", "/status"];
    for (const path of pages) {
      await check(site, `GET ${path}`, async () => {
        const r = await get(path);
        const html = await r.text();
        const ok = r.status === 200 && html.includes(BRAND.name) && html.includes("</html>");
        return { status: ok ? "pass" : "fail", detail: `${r.status} ${r.headers.get("content-type") ?? ""}, ${(html.length / 1024).toFixed(0)} KB${ok ? "" : ", page did not render"}` };
      });
    }
    await check(site, "API /api/public/vaults", async () => {
      // The page loads above can leave a few rows mid-refresh for one cache window (12 s); give the API three windows.
      let r!: Response;
      let j!: { data?: { descriptor: { id: string }; snapshot: { apr: number | null } | null }[]; source?: string };
      let rows: NonNullable<typeof j.data> = [];
      let live = 0;
      for (let attempt = 0; attempt < 4; attempt++) {
        if (attempt) await new Promise((res) => setTimeout(res, 13_000));
        r = await get("/api/public/vaults");
        j = (await r.json()) as typeof j;
        rows = j.data ?? [];
        live = rows.filter((x) => x.snapshot).length;
        if (r.status === 200 && rows.length && live === rows.length) break;
      }
      return { status: r.status === 200 && rows.length === 18 && live === 18 ? "pass" : live > 0 ? "warn" : "fail", detail: `${r.status}: ${rows.length} vaults, ${live} with a live snapshot, ${rows.filter((x) => x.snapshot?.apr !== null && x.snapshot?.apr !== undefined).length} with a fee APR, source ${j.source ?? "?"}` };
    });
    await check(site, "API /api/status", async () => {
      const r = await get("/api/status");
      const j = (await r.json()) as { overall?: { label: string }; components?: Record<string, { state: string }> };
      return { status: r.status === 200 && j.overall ? "pass" : "fail", detail: `${r.status}: ${j.overall?.label ?? "no payload"}; ${Object.entries(j.components ?? {}).map(([k, v]) => `${k} ${v.state}`).join(", ")}` };
    });
    await check(site, "API /api/lending/v2/markets", async () => {
      const r = await get("/api/lending/v2/markets");
      const j = (await r.json()) as { data?: { contractState: { name: string } }[] };
      return { status: r.status === 200 && j.data?.length ? "pass" : "fail", detail: `${r.status}: ${j.data?.length ?? 0} market(s), ${j.data?.map((m) => m.contractState.name).join(", ") ?? ""}` };
    });
    await check(site, "API /api/allocator", async () => {
      const r = await get("/api/allocator?amount=1000&risk=balanced");
      const j = (await r.json()) as { model?: string; positions?: { symbol: string; kind: string; weight: number; amount: string }[]; lendingShare?: number };
      const positions = j.positions ?? [];
      const sum = positions.reduce((a, p) => a + Number(p.amount), 0);
      const weights = positions.reduce((a, p) => a + p.weight, 0);
      const ok = r.status === 200 && positions.length > 0 && Math.abs(sum - 1000) < 0.000001 && Math.abs(weights - 1) < 0.0001;
      return { status: ok ? "pass" : "fail", detail: `${r.status}: model ${j.model ?? "?"}, ${positions.length} position(s) summing to ${sum.toFixed(2)} USDG, weights ${weights.toFixed(4)}; ${positions.map((p) => `${p.symbol} ${(p.weight * 100).toFixed(1)}%`).join(", ")}` };
    });
    await check(site, "API /api/trade/quotes", async () => {
      if (!aapl) return { status: "skip", detail: "AAPL vault missing" };
      const r = await get(`/api/trade/quotes?tokenIn=${USDG_ADDRESS}&tokenOut=${stockOf(aapl)}&amountIn=${DEPOSIT_USDG}`);
      const j = (await r.json()) as { data?: { quotes: { providerId: string; amountOutRaw: string }[] } };
      const q = j.data?.quotes ?? [];
      return { status: r.status === 200 && q.length ? "pass" : "fail", detail: `${r.status}: ${q.length} quote(s) ${q.map((x) => `${x.providerId} ${Number(formatUnits(BigInt(x.amountOutRaw), 18)).toFixed(6)} AAPL`).join(", ")}` };
    });
    await check(site, "API /api/trade/build", async () => {
      if (!route) return { status: "skip", detail: "No route to build" };
      const r = await get("/api/trade/build", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ routeSummary: route.routeSummary, sender: TEST_ACCOUNT, recipient: TEST_ACCOUNT, slippageBps: 50 }) });
      const j = (await r.json()) as { data?: { data: string; routerAddress: string }; error?: string };
      return { status: r.status === 200 && j.data?.data?.startsWith("0x") ? "pass" : "fail", detail: r.status === 200 && j.data ? `${r.status}: calldata for ${short(j.data.routerAddress)} returned` : `${r.status}: ${j.error ?? "no calldata"}` };
    });
    await check(site, "RPC relay allows reads", async () => {
      const r = await get("/api/rpc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
      const j = (await r.json()) as { result?: string };
      return { status: r.status === 200 && j.result === "0x1237" ? "pass" : "fail", detail: `${r.status}: eth_chainId → ${j.result ?? "no result"}` };
    });
    await check(site, "RPC relay refuses writes", async () => {
      const r = await get("/api/rpc", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: ["0x00"] }) });
      const j = (await r.json()) as { error?: { message: string } };
      return { status: r.status === 403 ? "pass" : "fail", detail: `${r.status}: ${j.error?.message ?? "accepted a write method"}` };
    });
    await check(site, "Security headers", async () => {
      const r = await get("/");
      const hsts = r.headers.get("strict-transport-security");
      const xcto = r.headers.get("x-content-type-options");
      const missing = [!hsts && "strict-transport-security", !xcto && "x-content-type-options"].filter(Boolean);
      return { status: missing.length ? "warn" : "pass", detail: missing.length ? `Missing ${missing.join(", ")}` : "HSTS and nosniff present" };
    });
    await check(site, "www alias", async () => {
      try {
        const host = new URL(SITE).host;
        const r = await fetch(`https://www.${host}/`, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
        return { status: [200, 301, 302, 307, 308].includes(r.status) ? "pass" : "warn", detail: `www.${host} answered ${r.status}` };
      } catch (e) {
        return { status: "warn", detail: `www alias does not resolve yet (${firstLine(e)})` };
      }
    });
  }

  // ------------------------------------------------------------------ build
  if (flag("--build")) {
    const b = group("build", "Build checks", "Static checks on the site's source at this commit.");
    for (const [name, cmd] of [["Typecheck", "npm run -s typecheck"], ["Lint", "npm run -s lint"]] as const) {
      await check(b, name, async () => {
        try {
          execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], timeout: 600_000 });
          return { detail: `${cmd} exited 0` };
        } catch (e) {
          const err = e as { stdout?: Buffer; stderr?: Buffer };
          return { status: "fail", detail: `${cmd} failed: ${(err.stderr?.toString() || err.stdout?.toString() || "").trim().split("\n").slice(-3).join(" | ").slice(0, 300)}` };
        }
      });
    }
  }

  // ----------------------------------------------------------------- report
  const all = groups.filter((g) => wants(g.id));
  const summary = { pass: 0, fail: 0, warn: 0, skip: 0, total: 0 } as Report["summary"];
  for (const g of all) for (const c of g.checks) (summary[c.status]++, summary.total++);
  const report: Report = {
    version: 1,
    generatedAt: startedAt.toISOString(),
    commit,
    site: SITE,
    chain: { id: chainId, head: head.number.toString(), headTime: new Date(Number(head.timestamp) * 1000).toISOString(), rpcHost: new URL(robinhoodChain.rpcUrls.default.http[0]).host },
    summary,
    groups: all,
  };
  console.log(`\n${summary.pass} pass · ${summary.fail} fail · ${summary.warn} warn · ${summary.skip} skip · ${summary.total} checks in ${((Date.now() - startedAt.getTime()) / 1000).toFixed(0)}s`);
  if (ONLY && !args.includes("--out")) {
    console.log("Partial run (--only): nothing written. Pass --out <file> to save it.");
  } else {
    mkdirSync(OUT.replace(/\/[^/]+$/, ""), { recursive: true });
    writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
    const day = startedAt.toISOString().slice(0, 10);
    mkdirSync("verification", { recursive: true });
    writeFileSync(`verification/${day}.md`, toMarkdown(report));
    console.log(`Wrote ${OUT} and verification/${day}.md`);
  }
  process.exit(summary.fail ? 1 : 0);
}

function toMarkdown(r: Report) {
  const lines = [
    `# ${BRAND.name} verification · ${r.generatedAt.slice(0, 10)}`,
    "",
    `Automated functional verification of the live contracts and the production site. Not a third-party security audit.`,
    "",
    `- Run at: ${r.generatedAt}`,
    `- Chain: ${r.chain.id} via ${r.chain.rpcHost}, block ${r.chain.head} (${r.chain.headTime})`,
    `- Site: ${r.site ?? "skipped"}`,
    `- Commit: ${r.commit ?? "unknown"}`,
    `- Result: ${r.summary.pass} pass, ${r.summary.fail} fail, ${r.summary.warn} warn, ${r.summary.skip} skip`,
    "",
    "Reproduce with `npm run verify` (see scripts/verify.ts).",
  ];
  for (const g of r.groups) {
    lines.push("", `## ${g.title}`, "", g.description, "", "| Check | Result | Detail |", "| --- | --- | --- |");
    for (const c of g.checks) lines.push(`| ${c.name} | ${c.status.toUpperCase()} | ${c.detail.replace(/\|/g, "\\|")} |`);
  }
  return lines.join("\n") + "\n";
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
