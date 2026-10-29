// 문제정의의 형식 오류와 내용 보강 대상을 구분한다. 사실·점수는 판정하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const mapping = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const empty = (value) => value === null || value === undefined || value === '';

function object(value, label) {
  if (!mapping(value)) { errors.push(`${label}: 객체가 필요하다.`); return {}; }
  return value;
}

function string(value, label) {
  if (empty(value)) warnings.push(`${label}: 팀의 확인된 내용으로 보강할 항목이다.`);
  else if (typeof value !== 'string') errors.push(`${label}: 문자열 또는 null이어야 한다.`);
  else if (!value.trim()) warnings.push(`${label}: 공백만 있다.`);
}

function fields(value, keys, label) {
  const item = object(value, label);
  for (const key of keys) string(item[key], `${label}.${key}`);
  return item;
}

function list(value, label) {
  if (!Array.isArray(value)) { errors.push(`${label}: 배열이 필요하다. 미확인은 []로 남긴다.`); return []; }
  if (!value.length) warnings.push(`${label}: 아직 기록이 없다.`);
  return value;
}

function ids(items, label) {
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    if (!mapping(item) || empty(item.id)) continue;
    if (seen.has(item.id)) errors.push(`${label}[${index}].id: 중복 ID ${item.id}`);
    seen.add(item.id);
  }
}

try {
  const doc = object(yaml.load(fs.readFileSync(path.join(root, 'docs/problem.yaml'), 'utf8')), 'problem');
  const allowed = ['statement', 'canvas', 'personas', 'experiences', 'sources', 'five_whys', 'solution_paths', 'insight', 'features'];
  for (const key of Object.keys(doc)) if (!allowed.includes(key)) errors.push(`problem.${key}: Starter Kit 양식에 없는 최상위 키이다.`);
  string(doc.statement, 'statement');
  const canvas = object(doc.canvas, 'canvas');
  for (const key of ['context', 'customer', 'root_problem']) string(canvas[key], `canvas.${key}`);
  fields(canvas.impact, ['feeling', 'measurable'], 'canvas.impact');
  list(canvas.alternatives, 'canvas.alternatives').forEach((item, index) => fields(item, ['how_used', 'shortcoming', 'why_ours'], `canvas.alternatives[${index}]`));

  const definitions = {
    personas: ['id', 'description', 'source'],
    experiences: ['id', 'when', 'what_happened', 'workaround', 'feeling', 'quote', 'source'],
    sources: ['id', 'url', 'title', 'claim'],
    features: ['id', 'name', 'input', 'output', 'done'],
  };
  for (const [name, keys] of Object.entries(definitions)) {
    const items = list(doc[name], name);
    items.forEach((item, index) => fields(item, keys, `${name}[${index}]`));
    ids(items, name);
  }
  for (const [index, source] of (Array.isArray(doc.sources) ? doc.sources : []).entries()) {
    if (!mapping(source) || empty(source.url) || typeof source.url !== 'string') continue;
    try {
      const url = new URL(source.url);
      if (url.protocol !== 'https:' || !url.hostname || url.hostname === 'example.com') throw new Error();
    } catch { errors.push(`sources[${index}].url: 실제 공개 HTTPS 주소가 필요하다.`); }
  }
  const why = object(doc.five_whys, 'five_whys');
  string(why.symptom, 'five_whys.symptom');
  list(why.whys, 'five_whys.whys').forEach((item, index) => string(item, `five_whys.whys[${index}]`));
  // 질문 횟수는 공식 요건이 아니다. 미확인 내용을 채우도록 강제하지 않는다.
  const paths = list(doc.solution_paths, 'solution_paths');
  paths.forEach((item, index) => {
    fields(item, ['path', 'status', 'reason'], `solution_paths[${index}]`);
    if (mapping(item) && !empty(item.status) && !['chosen', 'rejected', 'deferred'].includes(item.status)) {
      errors.push(`solution_paths[${index}].status: chosen/rejected/deferred 중 하나여야 한다.`);
    }
  });
  if (!paths.some((item) => item?.status === 'chosen')) warnings.push('solution_paths: 선택한 해법이 아직 없다.');
  fields(doc.insight, ['claim', 'evidence', 'design_decision'], 'insight');

  for (const message of warnings) console.warn(`보강: ${message}`);
  for (const message of errors) console.error(`오류: ${message}`);
  console.log(`문제정의 형식 검사: 오류 ${errors.length}개, 보강 ${warnings.length}개. null·빈 배열은 보강 대상으로 남긴다. 사실·논리·점수 검증은 별도이다.`);
  process.exitCode = errors.length ? 1 : 0;
} catch (error) {
  console.error(`문제정의 형식 검사 실패: ${error.message}`);
  process.exitCode = 1;
}
