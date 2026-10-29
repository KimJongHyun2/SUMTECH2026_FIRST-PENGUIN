import { NextResponse } from "next/server";
import { parseByAi, parseByRule } from "@/lib/parse-spending";

const FAIL = "자동 채우기에 실패했어요. 직접 입력해 주세요";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "소비 내용을 적어 주세요" }, { status: 400 });

  const apiKey = process.env.AI_GATEWAY_API_KEY;
  try {
    const spending = apiKey ? await parseByAi(text, apiKey) : parseByRule(text);
    if (!spending || Object.values(spending).every((v) => v === 0)) {
      return NextResponse.json({ error: FAIL }, { status: 422 });
    }
    return NextResponse.json({ spending, source: apiKey ? "ai" : "rule" });
  } catch {
    return NextResponse.json({ error: FAIL }, { status: 502 });
  }
}
