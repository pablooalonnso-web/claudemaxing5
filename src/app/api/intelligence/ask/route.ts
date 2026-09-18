import { NextResponse } from "next/server";
import { analystOnline, ask, askAllowed } from "@/server/intelligence";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!analystOnline()) return NextResponse.json({ error: "The analyst is not connected yet." }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { question?: string } | null;
  const question = (body?.question ?? "").toString().trim();
  if (question.length < 3 || question.length > 400) return NextResponse.json({ error: "Ask something between 3 and 400 characters." }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "anonymous";
  if (!askAllowed(ip)) return NextResponse.json({ error: "That is enough questions for now. Try again in a while." }, { status: 429 });
  try {
    return NextResponse.json({ data: await ask(question) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The analyst could not answer." }, { status: 503 });
  }
}
