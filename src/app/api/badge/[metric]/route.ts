import { NextResponse } from "next/server";
import { formatUnits } from "viem";
import { erc20Abi } from "@/lib/abis";
import { BURN_ADDRESS, publicClient, TOKEN_ADDRESS } from "@/lib/chain";
import { VAULT_PINS } from "@/lib/registry";
import report from "../../../../../public/verification/latest.json";

export const dynamic = "force-dynamic";

/**
 * Embeddable SVG badges, generated per request from chain reads and the published
 * verification run. Drop one anywhere an image works:
 *
 *   ![burned](https://usevertex.xyz/api/badge/burned.svg)
 *
 * Metrics: burned, circulating, supply, vaults, checks, split.
 */
const SLATE = "#3D3B4F";
const MINT = "#28E99F";
const FOG = "#F7F7F9";
/** Every accent is a light brand colour, so the value always reads in dark ink. */
const INK = "#04231A";

/** Rough advance width for the 11px monospace face the badge asks for. */
const width = (text: string) => Math.ceil(text.length * 6.6) + 20;

function badge(label: string, value: string, accent: string) {
  const lw = width(label);
  const vw = width(value);
  const w = lw + vw;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="24" role="img" aria-label="${esc(label)}: ${esc(value)}">
  <title>${esc(label)}: ${esc(value)}</title>
  <rect width="${w}" height="24" rx="6" fill="${SLATE}"/>
  <rect x="${lw}" width="${vw}" height="24" rx="6" fill="${accent}"/>
  <rect x="${lw}" width="8" height="24" fill="${accent}"/>
  <g font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="11" letter-spacing="0.4">
    <text x="${lw / 2}" y="16" fill="${FOG}" text-anchor="middle">${esc(label)}</text>
    <text x="${lw + vw / 2}" y="16" fill="${INK}" text-anchor="middle" font-weight="bold">${esc(value)}</text>
  </g>
</svg>`;
}

const compact = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(0);

export async function GET(_req: Request, ctx: { params: Promise<{ metric: string }> }) {
  const { metric } = await ctx.params;
  const key = metric.replace(/\.svg$/i, "").toLowerCase();
  const client = publicClient();
  const svg = (label: string, value: string, accent = MINT) =>
    new NextResponse(badge(label, value, accent), {
      headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=300" },
    });

  try {
    if (key === "vaults") return svg("vaults live", String(VAULT_PINS.length));
    if (key === "split") return svg("fee split", "70 / 20 / 10");
    if (key === "checks") {
      const { pass, total } = report.summary;
      return svg("verified", `${pass} / ${total}`, pass === total ? MINT : "#ECFFA3");
    }
    const [minted, burned] = await Promise.all([
      client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "totalSupply" }),
      client.readContract({ address: TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [BURN_ADDRESS] }),
    ]);
    const num = (v: bigint) => Number(formatUnits(v, 18));
    if (key === "burned") return svg("VERTEX burned", compact(num(burned)));
    if (key === "supply") return svg("max supply", compact(num(minted)));
    if (key === "circulating") return svg("circulating", compact(num(minted - burned)));
    return svg("unknown badge", key.slice(0, 24), "#FFACFE");
  } catch {
    return svg("vertex", "unavailable", "#FFACFE");
  }
}
