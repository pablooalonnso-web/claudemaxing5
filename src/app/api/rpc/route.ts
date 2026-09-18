import { NextResponse } from "next/server";
import { RPC_URLS } from "@/lib/chain";

export const dynamic = "force-dynamic";

/**
 * Same-origin JSON-RPC relay used by the browser as a fallback when the public
 * RPC answers without CORS headers (rate limits, edge errors). Read-only
 * methods only; transactions always go through the visitor's wallet.
 */
const ALLOWED = /^(eth_(blockNumber|call|chainId|estimateGas|feeHistory|gasPrice|getBalance|getBlockByNumber|getBlockByHash|getCode|getLogs|getStorageAt|getTransactionByHash|getTransactionCount|getTransactionReceipt|maxPriorityFeePerGas)|net_version|web3_clientVersion)$/;
const MAX_BODY = 256 * 1024;

type RpcCall = { jsonrpc?: string; id?: number | string | null; method?: string; params?: unknown };

function reject(id: RpcCall["id"], message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message } };
}

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let body: RpcCall | RpcCall[];
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length > 100) return NextResponse.json({ error: "Batch too large" }, { status: 413 });
  const blocked = calls.filter((c) => typeof c?.method !== "string" || !ALLOWED.test(c.method));
  if (blocked.length) {
    const errors = blocked.map((c) => reject(c?.id, "Method not allowed through the relay"));
    return NextResponse.json(Array.isArray(body) ? errors : errors[0], { status: 403 });
  }
  const urls = process.env.RPC_URL ? [process.env.RPC_URL, ...RPC_URLS] : RPC_URLS;
  let lastError = "RPC relay failed";
  for (const url of urls) {
    try {
      const upstream = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: text,
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      const payload = await upstream.text();
      // A bot challenge or an outage answers with HTML or a non-2xx status; try the next endpoint.
      if (!upstream.ok || !payload.trimStart().startsWith("[") && !payload.trimStart().startsWith("{")) {
        lastError = `Upstream ${new URL(url).host} answered ${upstream.status}`;
        continue;
      }
      return new NextResponse(payload, { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  return NextResponse.json({ error: lastError }, { status: 502 });
}
