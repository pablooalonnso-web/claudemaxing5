import { NextResponse } from "next/server";
import { getVaultSnapshots } from "@/server/vault-snapshots";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getVaultSnapshots();
    return NextResponse.json(data, { headers: { "cache-control": "public, max-age=10, stale-while-revalidate=30" } });
  } catch (error) {
    return NextResponse.json({ error: "snapshots_unavailable", message: error instanceof Error ? error.message : "unknown" }, { status: 503 });
  }
}
