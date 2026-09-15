"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { managedVaultAbi } from "@/lib/abis";
import { publicClient } from "@/lib/chain";
import type { VaultPin } from "@/lib/registry";
import type { VaultSnapshotRow } from "@/lib/snapshot-types";
import { isStale, loadVaultSnapshot, REFRESH_MS } from "@/lib/snapshots-client";
import { BRAND } from "@/lib/brand";

export type OwnerPosition = { shares: bigint; assets: bigint | null };

/** Live view of one vault: snapshot, APR, deposit flags and (optionally) the connected owner's position. */
export function useVaultView(pin: VaultPin | null, owner?: Address) {
  const [row, setRow] = useState<VaultSnapshotRow | null>(null);
  const [error, setError] = useState(false);
  const [position, setPosition] = useState<OwnerPosition | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    setRow(null);
    setError(false);
    const refresh = async () => {
      if (!pin) return;
      try {
        const r = await loadVaultSnapshot(pin.vault);
        if (alive) {
          setRow(r);
          setError(false);
        }
      } catch {
        if (alive) setError(true);
      }
    };
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    window.addEventListener(BRAND.vaultUpdatedEvent, refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      clearInterval(clock);
      window.removeEventListener(BRAND.vaultUpdatedEvent, refresh);
    };
  }, [pin?.vault, pin]);

  useEffect(() => {
    let alive = true;
    setPosition(null);
    if (!pin || !owner) return;
    const read = async () => {
      try {
        const client = publicClient();
        const shares = await client.readContract({ address: pin.vault as Address, abi: managedVaultAbi, functionName: "balanceOf", args: [owner] });
        const supply = row?.snapshot?.extras?.totalSupply ? BigInt(row.snapshot.extras.totalSupply) : null;
        const totalAssets = row?.snapshot?.holdings?.totalAssets ? BigInt(row.snapshot.holdings.totalAssets) : null;
        const assets = supply && totalAssets && supply > 0n ? (shares * totalAssets) / supply : null;
        if (alive) setPosition({ shares, assets });
      } catch {
        /* keep previous */
      }
    };
    void read();
    const timer = setInterval(read, REFRESH_MS);
    window.addEventListener(BRAND.vaultUpdatedEvent, read);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(BRAND.vaultUpdatedEvent, read);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin?.vault, owner, row?.snapshot?.block]);

  const snapshot = row?.snapshot ?? null;
  const managed = snapshot?.extras?.managedState;
  const depositsEnabled = typeof managed?.open === "boolean" ? managed.open : null;
  const depositsPaused =
    managed && [managed.stopped, managed.recovery, managed.restart].every((v) => typeof v === "boolean")
      ? !!(managed.stopped || managed.recovery || managed.restart)
      : null;

  return {
    row,
    snapshot,
    holdings: snapshot?.holdings ?? null,
    apr: snapshot?.extras?.feeApr?.source === "vault-fees-v1" ? snapshot.apr : null,
    aprInfo: snapshot?.extras?.feeApr ?? null,
    stale: error || !row || isStale(row, now) || snapshot?.apr === null,
    asOf: snapshot?.aprAsOf ? Date.parse(snapshot.aprAsOf) : null,
    extras: snapshot?.extras ? { ...snapshot.extras, depositsEnabled, depositsPaused, ownerShares: position ? position.shares.toString() : null } : null,
    feeBps: snapshot?.feeBps ?? null,
    position,
    error,
  };
}
