import { NextResponse } from "next/server";
import { getStatus } from "@/server/status";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getStatus(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "status_unavailable", message: error instanceof Error ? error.message : "unknown" }, { status: 503 });
  }
}
