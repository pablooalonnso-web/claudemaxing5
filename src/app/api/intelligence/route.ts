import { NextResponse } from "next/server";
import { analystOnline, composeBrief, getBrief, getSignals, GUIDED_QUESTIONS } from "@/server/intelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [signals, modelBrief] = await Promise.all([getSignals(), getBrief()]);
    const brief = modelBrief ?? composeBrief(signals);
    return NextResponse.json({ version: 1, analyst: analystOnline() ? "online" : "offline", signals, brief, guided: GUIDED_QUESTIONS }, { headers: { "cache-control": "public, max-age=30, stale-while-revalidate=60" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Intelligence is temporarily unavailable." }, { status: 503 });
  }
}
