// docs/problem.yaml 자가 검사
// 키트 steps/02-problem.md의 "탄탄한 칸" 기준과 problem.example.yaml의 키를 그대로 검사한다.
// 실행: cd tools && npm install && npm run check
// 점수표가 아니라 "대시보드가 읽는 파일에 무엇이 비었고 무엇이 약한가"를 보여 주는 도구다.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(here, "..", "docs", "problem.yaml");
const doc = yaml.load(fs.readFileSync(file, "utf8"));

const fails = []; // 비었거나 형식이 틀림 → 대시보드가 빈칸으로 봄
const warns = []; // 채워졌지만 "탄탄한 칸" 기준에 약함
const oks = [];

const empty = (v) =>
  v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
const text = (v) => (typeof v === "string" ? v : "");

// ── 1. 캔버스 6칸 + 한 문장 ─────────────────────────────────────────
const canvas = doc.canvas ?? {};
const cells = {
  "statement (한 문장)": doc.statement,
  "① context 상황": canvas.context,
  "② customer 고객": canvas.customer,
  "③ root_problem 근본 문제": canvas.root_problem,
  "④ impact.feeling 감정": canvas.impact?.feeling,
  "④ impact.measurable 측정 가능한 영향": canvas.impact?.measurable,
};
for (const [k, v] of Object.entries(cells)) (empty(v) ? fails : oks).push(k);

// 일반론 표현: "실제로 겪은 구체적인 장면" 기준
const generic = /(많은|대부분의|다들|요즘|누구나|사람들은)/;
for (const k of ["context", "customer", "root_problem"]) {
  if (generic.test(text(canvas[k]))) warns.push(`canvas.${k}: 일반론 표현("많은/대부분/다들")이 있음 — 언제·어디서·무슨 일로 바꾸기`);
}
// 해법에서 거꾸로 만든 문제: "기능이 없어서"
if (/기능이 없|앱이 없|서비스가 없/.test(text(canvas.root_problem))) warns.push("root_problem: '기능이 없어서'는 해법에서 거꾸로 만든 문제");

// ── 2. 대안과 단점 (짝) ────────────────────────────────────────────
const alts = canvas.alternatives ?? [];
if (alts.length === 0) fails.push("⑤⑥ alternatives 현재 대안");
alts.forEach((a, i) => {
  for (const k of ["how_used", "shortcoming", "why_ours"])
    if (empty(a[k])) fails.push(`alternatives[${i}].${k}`);
  if (/도구|앱|서비스$/.test(text(a.how_used)) && text(a.how_used).length < 12)
    warns.push(`alternatives[${i}].how_used: 도구 이름만 있음 — 실제 행동으로`);
});

// ── 3. 뒷면: personas / experiences / sources ─────────────────────
const personas = doc.personas ?? [];
if (personas.length === 0) fails.push("personas 대상 (실제 대상 1명)");
personas.forEach((p, i) => for_each_key(p, ["id", "description", "source"], `personas[${i}]`));

const exps = doc.experiences ?? [];
if (exps.length === 0) fails.push("experiences 실제 경험 (언제·무슨 일·대응·기분·실제 한 말)");
exps.forEach((e, i) => {
  for_each_key(e, ["id", "when", "what_happened", "workaround", "feeling", "quote", "source"], `experiences[${i}]`);
  if (!/\d|지난|작년|올해|어제|달|주|학기/.test(text(e.when))) warns.push(`experiences[${i}].when: 시점이 구체적이지 않음`);
});

const sources = doc.sources ?? [];
if (sources.length === 0) fails.push("sources 외부 근거 (열어 확인한 https URL + 원문이 직접 말하는 claim)");
sources.forEach((s, i) => {
  for_each_key(s, ["id", "url", "title", "claim"], `sources[${i}]`);
  if (!/^https:\/\//.test(text(s.url))) fails.push(`sources[${i}].url: https:// 로 시작하지 않음`);
  if (/example\.com/.test(text(s.url))) fails.push(`sources[${i}].url: 예시 주소`);
});

// 출처 없는 수치: canvas·statement에 숫자+단위가 있는데 sources가 비었거나 '추정' 표시가 없음
const numeric = /\d+(\.\d+)?\s*(%|명|분|시간|초|원|배|건|회|cm|°)/;
const canvasText = [doc.statement, canvas.context, canvas.customer, canvas.root_problem, canvas.impact?.feeling, canvas.impact?.measurable].map(text).join("\n");
if (numeric.test(canvasText) && sources.length === 0 && !/추정|직접 잰|직접 측정/.test(canvasText))
  warns.push("캔버스에 수치가 있는데 sources가 비어 있고 '추정' 표시도 없음 — 출처 없는 수치");

// ── 4. 5 Whys / solution_paths / insight ──────────────────────────
const fw = doc.five_whys ?? {};
if (empty(fw.symptom)) fails.push("five_whys.symptom");
if (empty(fw.whys)) fails.push("five_whys.whys");
else if (fw.whys.length < 3) warns.push(`five_whys.whys: ${fw.whys.length}단계 — 원인이 끝까지 파고들어졌는지 확인`);
else oks.push(`five_whys ${fw.whys.length}단계`);

const paths = doc.solution_paths ?? [];
if (paths.length === 0) fails.push("solution_paths");
if (!paths.some((p) => p.status === "chosen")) fails.push("solution_paths: chosen 이 없음");
paths.forEach((p, i) => {
  for_each_key(p, ["path", "status", "reason"], `solution_paths[${i}]`);
  if (!["chosen", "rejected", "deferred"].includes(p.status)) fails.push(`solution_paths[${i}].status: ${p.status} (chosen/rejected/deferred)`);
});

const ins = doc.insight ?? {};
for (const k of ["claim", "evidence", "design_decision"]) (empty(ins[k]) ? fails : oks).push(`insight.${k}`);
if (!empty(ins.evidence) && !/\b[ER]\d+\b/.test(text(ins.evidence)))
  warns.push("insight.evidence: experiences(E1)·sources(R1) id를 함께 적으면 근거가 연결됨");

// ── 5. features ───────────────────────────────────────────────────
const feats = doc.features ?? [];
if (feats.length === 0) fails.push("features");
const observable = /(보인다|표시|남아|바뀐다|바뀌고|이동|오고|온다|저장|멈춘다|돌아간다|비활성|활성)/;
feats.forEach((f, i) => {
  for_each_key(f, ["id", "name", "input", "output", "done"], `features[${i}]`);
  if (!observable.test(text(f.done))) warns.push(`features[${i}] ${f.id}.done: 관찰할 수 있는 결과(보인다·표시·남아…)가 없음`);
  if (/학생 답 대기|미정|TBD/.test(text(f.done))) warns.push(`features[${i}] ${f.id}.done: 미정 표시가 남아 있음 — 수치 확정 필요`);
});
if (feats.length) oks.push(`features ${feats.length}개`);

// ── 출력 ──────────────────────────────────────────────────────────
function for_each_key(obj, keys, label) {
  for (const k of keys) if (empty(obj?.[k])) fails.push(`${label}.${k}`);
}

const total = Object.keys(cells).length + 3 /* alternatives·personas·experiences */ + 1 /* sources */ + 2 /* five_whys·solution_paths */ + 3 /* insight */ + 1 /* features */;
const filled = total - new Set(fails.map((f) => f.split(/[\[.:]/)[0])).size;

console.log(`\ndocs/problem.yaml 자가 검사 — ${path.relative(process.cwd(), file)}`);
console.log(`채워진 블록 ${filled}/${total}\n`);
if (fails.length) {
  console.log("■ 비었거나 형식이 틀림 (대시보드가 빈칸으로 봄)");
  for (const f of fails) console.log("  ✗ " + f);
}
if (warns.length) {
  console.log("\n■ 채워졌지만 '탄탄한 칸' 기준에 약함");
  for (const w of warns) console.log("  △ " + w);
}
console.log("\n■ 채워짐");
for (const o of oks) console.log("  ✓ " + o);
console.log("");
process.exitCode = fails.length ? 1 : 0;
