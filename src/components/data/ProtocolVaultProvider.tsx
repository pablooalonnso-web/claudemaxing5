"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { directoryVaults, type VaultPin } from "@/lib/registry";
import type { VaultSnapshotRow } from "@/lib/snapshot-types";
import { isStale, loadSnapshots, REFRESH_MS } from "@/lib/snapshots-client";

export type SnapshotRowSummary = {
  vault: string;
  id: string;
  kind: "managed" | "single" | "basket";
  assets: string | null;
  fees: string | null;
  buyback: string | null;
  apr: number | null;
};

export type ProtocolSnapshot = {
  observedAt: number;
  block: string;
  rows: SnapshotRowSummary[];
};

type ContextValue = {
  snapshot: ProtocolSnapshot | null;
  singles: VaultPin[];
  rows: VaultSnapshotRow[] | null;
  error: boolean;
};

const Ctx = createContext<ContextValue>({ snapshot: null, singles: [], rows: null, error: false });

/** Lifetime fees include LP fees that are earned but not yet claimed. */
function lifetimeFees(row: VaultSnapshotRow): string | null {
  const fees = row.snapshot?.fees ?? null;
  if (row.descriptor.kind !== "managed" || fees === null) return fees;
  const positions = row.snapshot?.holdings?.positions;
  if (!positions) return null;
  let total = BigInt(fees);
  for (const p of positions) {
    if (p.unclaimedFees == null) return null;
    total += BigInt(p.unclaimedFees);
  }
  return total.toString();
}

function summarise(rows: VaultSnapshotRow[], pins: VaultPin[]): ProtocolSnapshot {
  const relevant = rows.filter((r) => pins.some((p) => p.vault.toLowerCase() === r.descriptor.vault.toLowerCase()));
  const times = relevant.flatMap((r) => (r.snapshot ? [Date.parse(r.snapshot.observedAt)] : []));
  const list: SnapshotRowSummary[] = relevant.map((r) => ({
    vault: r.descriptor.vault,
    id: r.descriptor.id,
    kind: r.descriptor.kind,
    assets: r.snapshot?.assets ?? null,
    fees: lifetimeFees(r),
    buyback: r.snapshot?.buyback ?? null,
    apr: r.snapshot?.extras?.feeApr?.source === "vault-fees-v1" && Number.isFinite(r.snapshot?.apr) ? r.snapshot!.apr : null,
  }));
  for (const pin of pins) {
    if (!list.some((r) => r.vault.toLowerCase() === pin.vault.toLowerCase())) {
      list.push({ vault: pin.vault, id: pin.id, kind: "managed", assets: null, fees: null, buyback: null, apr: null });
    }
  }
  return { observedAt: times.length ? Math.min(...times) : Date.now(), block: relevant.find((r) => r.snapshot)?.snapshot?.block ?? "0", rows: list };
}

export function ProtocolVaultProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<ProtocolSnapshot | null>(null);
  const [rows, setRows] = useState<VaultSnapshotRow[] | null>(null);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const singles = directoryVaults();

  useEffect(() => {
    let alive = true;
    let busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const data = await loadSnapshots();
        if (!alive) return;
        setRows(data);
        setSnapshot(summarise(data, singles));
        setError(data.some((r) => isStale(r)));
      } catch {
        if (alive) setError(true);
      } finally {
        busy = false;
      }
    };
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    void refresh();
    const timer = setInterval(visible, REFRESH_MS);
    const clock = setInterval(() => setNow(Date.now()), 5_000);
    window.addEventListener("focus", visible);
    window.addEventListener(BRAND.vaultUpdatedEvent, visible);
    return () => {
      alive = false;
      clearInterval(timer);
      clearInterval(clock);
      window.removeEventListener("focus", visible);
      window.removeEventListener(BRAND.vaultUpdatedEvent, visible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Ctx.Provider value={{ snapshot, singles, rows, error: error || !!(snapshot && now - snapshot.observedAt > 1_200_000) }}>
      {children}
    </Ctx.Provider>
  );
}

export const useProtocolVaults = () => useContext(Ctx);
