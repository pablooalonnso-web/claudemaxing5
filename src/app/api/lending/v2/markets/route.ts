import { NextResponse } from "next/server";
import { getLendingMarkets } from "@/server/lending";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getLendingMarkets(), { headers: { "cache-control": "public, max-age=10, stale-while-revalidate=30" } });
  } catch (error) {
    return NextResponse.json({ error: "markets_unavailable", message: error instanceof Error ? error.message : "unknown" }, { status: 503 });
  }
}
