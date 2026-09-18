import type { VaultPin } from "./registry";
import type { VaultSnapshotRow } from "./snapshot-types";

/** Vaults with less than this much USDG in them are not ranked; their APR is too noisy to act on. */
export const BASKET_TVL_FLOOR = 1_000;
/** Smallest deposit the router will accept comfortably per vault. */
export const BASKET_MIN_PER_VAULT = 10;
export const BASKET_SIZES = [3, 4, 6] as const;

export type RankedVault = { pin: VaultPin; apr: number; tvl: number; open: boolean };

/** Ranks the directory vaults by realized fee APR, ignoring thin or closed vaults. */
export function rankVaults(rows: VaultSnapshotRow[], pins: VaultPin[]): RankedVault[] {
  const out: RankedVault[] = [];
  for (const pin of pins) {
    const row = rows.find((r) => r.descriptor.vault.toLowerCase() === pin.vault.toLowerCase());
    const s = row?.snapshot;
    if (!s || s.apr === null || s.assets === null) continue;
    if (s.extras?.feeApr?.source !== "vault-fees-v1") continue;
    const tvl = Number(s.assets) / 1e6;
    const m = s.extras?.managedState;
    const open = !!m && m.open && !m.stopped && !m.recovery;
    if (tvl < BASKET_TVL_FLOOR || !open) continue;
    out.push({ pin, apr: s.apr, tvl, open });
  }
  return out.sort((a, b) => b.apr - a.apr || b.tvl - a.tvl);
}

/** Splits a USDG budget (6 decimals) evenly; the remainder goes to the first leg. */
export function splitBudget(total: bigint, n: number): bigint[] {
  if (n <= 0) return [];
  const each = total / BigInt(n);
  const legs = Array.from({ length: n }, () => each);
  legs[0] += total - each * BigInt(n);
  return legs;
}

export type BasketPosition = { pin: VaultPin; value: number; shares: bigint };

/**
 * Compares what the wallet holds with the current ranking. Nothing here moves
 * funds: it only says which vaults dropped out of the top and which entered.
 */
export function rebalanceHints(positions: BasketPosition[], ranking: RankedVault[], size: number) {
  const top = ranking.slice(0, size);
  const held = positions.filter((p) => p.shares > 0n);
  const inTop = (pin: VaultPin) => top.some((r) => r.pin.vault.toLowerCase() === pin.vault.toLowerCase());
  const dropped = held.filter((p) => !inTop(p.pin));
  const missing = top.filter((r) => !held.some((p) => p.pin.vault.toLowerCase() === r.pin.vault.toLowerCase()));
  return { top, held, dropped, missing };
}
