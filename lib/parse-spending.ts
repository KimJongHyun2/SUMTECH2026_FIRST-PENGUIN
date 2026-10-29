// F3 문장 → 분야별 금액. 서버에서만 import한다(API 키 사용).
import { CATEGORIES } from "./constants";
import type { Category, Spending } from "./types";

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4o-mini";
const TIMEOUT_MS = 20_000;

export function emptySpending(): Spending {
  return Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Spending;
}

const KEYWORDS: Record<Exclude<Category, "기타">, string[]> = {
  "식비·카페": ["배달", "음식", "식비", "카페", "커피", "밥", "외식", "식당"],
  대중교통: ["지하철", "버스", "교통"],
  편의점: ["편의점", "gs25", "cu", "세븐일레븐"],
  온라인쇼핑: ["쇼핑", "쿠팡", "무신사", "11번가"],
  통신비: ["통신", "핸드폰", "휴대폰", "요금제"],
  구독서비스: ["넷플릭스", "유튜브", "멜론", "구독", "티빙", "스포티파이"],
};

/** 키가 없는 로컬 개발 환경용 규칙 추출: "배달 20만 원, 지하철 6만 원" */
export function parseByRule(text: string): Spending {
  const result = emptySpending();
  for (const part of text.split(/[,，\n]/)) {
    const amount = part.match(/(\d+(?:\.\d+)?)\s*(만)?\s*원?/);
    const lower = part.toLowerCase();
    const category = (Object.keys(KEYWORDS) as (keyof typeof KEYWORDS)[]).find((c) =>
      KEYWORDS[c].some((w) => lower.includes(w)),
    );
    if (category && amount) result[category] += Math.round(Number(amount[1]) * (amount[2] ? 10_000 : 1));
  }
  return result;
}

function toSpending(raw: unknown): Spending | null {
  if (typeof raw !== "object" || raw === null) return null;
  const result = emptySpending();
  for (const c of CATEGORIES) {
    const v = (raw as Record<string, unknown>)[c];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
    result[c] = Math.round(v);
  }
  return result;
}

export async function parseByAi(text: string, apiKey: string): Promise<Spending | null> {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model: process.env.AI_MODEL || DEFAULT_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            `사용자가 적은 한 달 소비 문장을 다음 7개 분야의 한 달 금액(원, 정수)으로 바꿔 JSON 객체 하나로만 답해. 키: ${CATEGORIES.join(", ")}. ` +
            `문장에 없는 분야는 0. "20만 원"은 200000. 금액 없이 서비스 이름만 있으면 일반적인 월 요금을 넣지 말고 0으로 둬.`,
        },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return toSpending(JSON.parse(content));
  } catch {
    return null;
  }
}
