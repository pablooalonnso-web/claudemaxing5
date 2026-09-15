import { NextResponse } from "next/server";
import { getVaultSnapshot } from "@/server/vault-snapshots";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ vault: string }> }) {
  const { vault } = await ctx.params;
  if (!/^0x[\da-f]{40}$/i.test(vault)) return NextResponse.json({ error: "Invalid vault" }, { status: 400 });
  const row = await getVaultSnapshot(vault);
  if (!row) return NextResponse.json({ error: "Invalid vault" }, { status: 400 });
  return NextResponse.json({ version: 1, data: row }, { headers: { "cache-control": "public, max-age=10, stale-while-revalidate=30" } });
}
