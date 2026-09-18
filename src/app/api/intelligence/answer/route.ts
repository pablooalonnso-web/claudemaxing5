import { NextResponse } from "next/server";
import { answerGuided, getSignals, GUIDED_QUESTIONS, type GuidedId } from "@/server/intelligence";

export const dynamic = "force-dynamic";

/** Answers one of the guided questions from the signals. No model involved. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("q") ?? "";
  if (!GUIDED_QUESTIONS.some((q) => q.id === id)) return NextResponse.json({ error: "Unknown question" }, { status: 400 });
  try {
    const signals = await getSignals();
    return NextResponse.json({ data: { answer: answerGuided(signals, id as GuidedId), signalsAt: signals.generatedAt, source: "rules" } }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unavailable" }, { status: 503 });
  }
}
