import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rolling 24h fee observations per vault, used to estimate a fee APR from
 * onchain state alone. Samples live in memory and are mirrored to
 * `.data/fee-samples.json` so the window survives restarts.
 */
export type FeeSample = { t: number; fees: number; assets: number; price?: number | null };

const WINDOW_MS = 24 * 60 * 60 * 1000;
const MIN_GAP_MS = 20_000;
const FILE = path.join(process.cwd(), ".data", "fee-samples.json");

type Store = Record<string, FeeSample[]>;

const g = globalThis as unknown as { __feeSamples?: Store; __feeSamplesLoaded?: Promise<void> };

async function load(): Promise<Store> {
  if (g.__feeSamples) return g.__feeSamples;
  if (!g.__feeSamplesLoaded) {
    g.__feeSamplesLoaded = (async () => {
      try {
        const raw = await readFile(FILE, "utf8");
        const parsed = JSON.parse(raw) as Store;
        g.__feeSamples = typeof parsed === "object" && parsed ? parsed : {};
      } catch {
        g.__feeSamples = {};
      }
    })();
  }
  await g.__feeSamplesLoaded;
  return g.__feeSamples ?? (g.__feeSamples = {});
}

let persistTimer: NodeJS.Timeout | undefined;
function schedulePersist(store: Store) {
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = undefined;
    try {
      await mkdir(path.dirname(FILE), { recursive: true });
      await writeFile(FILE, JSON.stringify(store));
    } catch {
      /* read-only file system (e.g. serverless) — memory only */
    }
  }, 2_000);
}

/** Records a sample and returns the APR estimate (after the 30% protocol split) plus window info. */
export async function recordAndEstimate(
  vault: string,
  fees: number,
  assets: number,
  price: number | null = null,
  now = Date.now(),
): Promise<{ apr: number | null; observedSeconds: number; asOf: string; priceHistory: { date: string; dexPriceUsd: number }[] }> {
  const store = await load();
  const key = vault.toLowerCase();
  const list = (store[key] ??= []);
  const last = list[list.length - 1];
  if (!last || now - last.t >= MIN_GAP_MS) {
    list.push({ t: now, fees, assets, price });
    while (list.length && now - list[0].t > WINDOW_MS && list.length > 1 && now - list[1].t > WINDOW_MS) list.shift();
    if (list.length > 6_000) list.splice(0, list.length - 6_000);
    schedulePersist(store);
  }
  const first = list.find((s) => now - s.t <= WINDOW_MS) ?? list[0];
  const observedSeconds = Math.max(0, Math.round((now - first.t) / 1000));
  const priceHistory = list
    .filter((s) => s.t >= first.t && typeof s.price === "number" && Number.isFinite(s.price) && s.price > 0)
    .map((s) => ({ date: new Date(s.t).toISOString(), dexPriceUsd: s.price as number }));
  if (!first || observedSeconds < 60 || fees < first.fees || assets <= 0) {
    return { apr: null, observedSeconds, asOf: new Date(now).toISOString(), priceHistory };
  }
  const avgAssets = list.filter((s) => s.t >= first.t).reduce((a, s) => a + s.assets, 0) / list.filter((s) => s.t >= first.t).length;
  const grossDelta = fees - first.fees;
  const netDelta = grossDelta * 0.7; // 70% of fees stay in the vault
  const apr = avgAssets > 0 ? (netDelta / avgAssets) * ((365 * 24 * 3600) / observedSeconds) : null;
  return { apr: apr !== null && Number.isFinite(apr) && apr >= 0 ? apr : null, observedSeconds, asOf: new Date(now).toISOString(), priceHistory };
}
