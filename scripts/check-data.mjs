// F1 완료 조건 검사: npm run check:data
import { readFileSync } from "node:fs";

const CATEGORIES = ["식비·카페", "대중교통", "편의점", "온라인쇼핑", "통신비", "구독서비스", "기타"];
const cards = JSON.parse(readFileSync(new URL("../data/cards.json", import.meta.url), "utf8"));
const errors = [];
const ids = new Set();

if (cards.length < 20) errors.push(`카드가 ${cards.length}장이에요 (20장 이상 필요)`);
if (!cards.some((c) => c.target === "대학생")) errors.push("가입 대상이 대학생인 카드가 없어요");
if (!cards.some((c) => c.target === "군인")) errors.push("가입 대상이 군인인 카드가 없어요");

for (const c of cards) {
  const at = `[${c.id}]`;
  if (ids.has(c.id)) errors.push(`${at} id가 중복돼요`);
  ids.add(c.id);
  if (!/^https:\/\//.test(c.sourceUrl ?? "")) errors.push(`${at} 출처 URL이 없어요`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.checkedAt ?? "")) errors.push(`${at} 확인일이 YYYY-MM-DD가 아니에요`);
  if (!["신용", "체크"].includes(c.type)) errors.push(`${at} 종류가 신용/체크가 아니에요`);
  if (!["전체", "대학생", "군인"].includes(c.target)) errors.push(`${at} 가입 대상이 잘못됐어요`);
  if (!c.benefits?.length) errors.push(`${at} 혜택이 없어요`);
  const seen = new Set();
  for (const b of c.benefits ?? []) {
    if (!CATEGORIES.includes(b.category)) errors.push(`${at} 분야 "${b.category}"는 7개 분야가 아니에요`);
    if (seen.has(b.category)) errors.push(`${at} 분야 "${b.category}"가 두 번 있어요`);
    seen.add(b.category);
    if (!(b.rate > 0)) errors.push(`${at} ${b.category} 할인율이 0 이하예요`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`카드 ${cards.length}장 검사 통과`);
