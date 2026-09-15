"use client";

import type { VaultSnapshotRow } from "./snapshot-types";

/** How often live figures are re-read while a tab is visible. */
export const REFRESH_MS = 15_000;

function validate(json: unknown): VaultSnapshotRow[] {
  const body = json as { version?: number; data?: VaultSnapshotRow[] };
  if (body?.version !== 1 || !Array.isArray(body.data) || body.data.length > 1000) throw new Error("Invalid vault snapshots");
  const seen = new Set<string>();
  for (const row of body.data) {
    const d = row?.descriptor;
    const s = row?.snapshot;
    if (!d || !["basket", "single", "managed"].includes(d.kind) || typeof d.id !== "string" || !/^0x[\da-f]{40}$/i.test(d.vault)) {
      throw new Error("Invalid vault identity");
    }
    if (seen.has(d.vault.toLowerCase()) || typeof row.stale !== "boolean") throw new Error("Invalid vault identity");
    seen.add(d.vault.toLowerCase());
    if (s !== null) {
      if (!s || !Number.isFinite(Date.parse(s.observedAt)) || !/^\d+$/.test(s.block) || !Array.isArray(s.rates) || !Array.isArray(s.history)) {
        throw new Error("Invalid snapshot");
      }
      if (!Number.isInteger(s.feeBps) || s.feeBps < 0 || s.feeBps > 10_000) throw new Error("Invalid snapshot");
      if (s.apr !== null && (typeof s.apr !== "number" || !Number.isFinite(s.apr) || s.apr < 0)) throw new Error("Invalid snapshot");
      for (const key of ["assets", "fees", "buyback"] as const) {
        if (s[key] !== null && (typeof s[key] !== "string" || !/^\d+$/.test(s[key] as string))) throw new Error("Invalid snapshot amount");
      }
      if (s.holdings && s.holdings.vault.toLowerCase() !== d.vault.toLowerCase()) throw new Error("Wrong snapshot vault");
    }
  }
  return body.data;
}

function createLoader(fetcher: (url: string, init: RequestInit) => Promise<Response>, now = Date.now) {
  let cache: { at: number; rows: VaultSnapshotRow[] } | undefined;
  let inflight: Promise<VaultSnapshotRow[]> | undefined;
  let failedAt: number | undefined;
  return function load(): Promise<VaultSnapshotRow[]> {
    if (cache && now() - cache.at < REFRESH_MS) return Promise.resolve(cache.rows);
    if (failedAt !== undefined && now() - failedAt < REFRESH_MS) {
      return cache ? Promise.resolve(cache.rows.map((r) => ({ ...r, stale: true }))) : Promise.reject(new Error("Vault snapshots unavailable"));
    }
    if (inflight) return inflight;
    inflight = fetcher("/api/public/vaults", { signal: AbortSignal.timeout(12_000), cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Vault snapshots unavailable");
        const rows = validate(await res.json());
        cache = { at: now(), rows };
        failedAt = undefined;
        return rows;
      })
      .catch((e) => {
        failedAt = now();
        if (cache) return cache.rows.map((r) => ({ ...r, stale: true }));
        throw e;
      })
      .finally(() => {
        inflight = undefined;
      });
    return inflight;
  };
}

export const loadSnapshots = createLoader((url, init) => fetch(url, init));

export async function loadVaultSnapshot(vault: string): Promise<VaultSnapshotRow> {
  const row = (await loadSnapshots()).find((r) => r.descriptor.vault.toLowerCase() === vault.toLowerCase());
  if (!row?.snapshot) throw new Error("Vault snapshot is warming up");
  return row;
}

/** A managed snapshot is stale after 3 minutes; other kinds after 20. */
export function isStale(row: VaultSnapshotRow, now = Date.now()) {
  const t = Date.parse(row.snapshot?.observedAt ?? "");
  return row.stale || !Number.isFinite(t) || t > now + 30_000 || now - t > (row.descriptor.kind === "managed" ? 180_000 : 1_200_000);
}
