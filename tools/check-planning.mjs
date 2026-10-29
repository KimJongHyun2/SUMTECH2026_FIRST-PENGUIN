// 공식 시나리오 규격, 팀의 운영 기본값 대조, 가상 산술을 검사한다. E2E를 대신하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { POLICY, CONNECTION_PILOT } from '../posture-web/src/core/policy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const mapping = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, label, max = Infinity) => {
  assert(typeof value === 'string' && value.trim(), `${label}: 빈 문자열 또는 잘못된 형식`);
  assert([...value].length <= max, `${label}: 최대 ${max}자`);
};

function unionLength(intervals) {
  let sum = 0;
  let end = -Infinity;
  for (const [start, stop] of intervals.map((item) => [...item]).sort((a, b) => a[0] - b[0])) {
    assert(Number.isFinite(start) && Number.isFinite(stop) && start <= stop, '잘못된 시간 구간');
    sum += Math.max(0, stop - Math.max(start, end));
    end = Math.max(end, stop);
  }
  return sum;
}

try {
  const problem = yaml.load(read('docs/problem.yaml'));
  const scenarios = yaml.load(read('docs/scenarios.yaml'));
  assert(mapping(scenarios), '시나리오 문서는 객체여야 한다.');
  assert(['desktop', 'mobile', 'both'].includes(scenarios.platform), 'platform 값');
  text(scenarios.platformReason, 'platformReason');
  assert(Array.isArray(scenarios.scenarios) && scenarios.scenarios.length >= 3 && scenarios.scenarios.length <= 8, '흐름은 3~8개');
  const ids = new Set();
  for (const item of scenarios.scenarios) {
    assert(mapping(item), '흐름 객체');
    assert(typeof item.id === 'string' && /^S[1-9]\d*$/.test(item.id), 'S+양의 정수 ID');
    assert(!ids.has(item.id), `중복 흐름 ID: ${item.id}`);
    ids.add(item.id);
    for (const key of Object.keys(item)) assert(['id', 'title', 'account', 'steps', 'expected'].includes(key), `${item.id}: 알 수 없는 키 ${key}`);
    text(item.title, `${item.id} 제목`, 120);
    text(item.expected, `${item.id} 기대 결과`, 500);
    if ('account' in item) text(item.account, `${item.id} 역할`);
    assert(Array.isArray(item.steps) && item.steps.length >= 1 && item.steps.length <= 12, `${item.id}: 단계는 1~12개`);
    item.steps.forEach((step) => text(step, `${item.id} 단계`));
  }

  const prd = read('docs/prd.md');
  // 운영 기본값과 명시된 파일럿을 코드와 대조한다. 파일럿의 제품 승인을 뜻하지 않는다.
  const defaults = { ...POLICY, qrExpirySeconds: CONNECTION_PILOT.qrExpirySeconds };
  for (const [key, seconds] of Object.entries(defaults)) {
    // 짧은 가림 유예는 0이 '유예 없음(즉시 초기화)'이라 0을 허용한다. 나머지 시간값은 양의 정수다.
    const minimum = key === 'recognitionGraceSeconds' ? 0 : 1;
    assert(Number.isSafeInteger(seconds) && seconds >= minimum, `운영 기본값 ${key}`);
    const row = prd.split('\n').find((line) => line.startsWith(`| \`${key}\` |`));
    assert(row, `PRD 정책 행 누락: ${key}`);
    assert.equal(row.split('|')[2].trim(), `${seconds}초`, `PRD/코드 기본값 불일치: ${key}`);
  }
  assert(Array.isArray(problem.features), '기능 목록');
  for (const feature of problem.features) {
    if (typeof feature.id !== 'string' || !feature.id.trim()) continue;
    const escaped = feature.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert(new RegExp(`\\b${escaped}\\b`).test(prd), `PRD 기능 참조 누락: ${feature.id}`);
  }
  assert(!read('.github/workflows/scenarios.yml').includes('--pass-with-no-tests'), '테스트 부재를 성공으로 처리하는 옵션');

  const fixture = JSON.parse(read('tools/fixtures/report-calculation.json'));
  assert.equal(fixture.app_e2e_executed, false, '가상 산술은 E2E 실행 증거가 아니다.');
  assert(Array.isArray(fixture.cases) && fixture.cases.length, '가상 산술 사례');
  const caseIds = new Set();
  for (const item of fixture.cases) {
    assert(!caseIds.has(item.id), `중복 산술 ID: ${item.id}`);
    caseIds.add(item.id);
    const input = item.input;
    let actual;
    if (item.kind === 'intervals') {
      const valid = unionLength(input.valid);
      const intersections = input.deviations.flatMap(([a, b]) => input.valid.map(([c, d]) => [Math.max(a, c), Math.min(b, d)]).filter(([start, end]) => end > start));
      const deviation = unionLength(intersections);
      actual = { valid_seconds: valid, deviation_seconds: deviation, deviation_percent: valid > 0 ? deviation / valid * 100 : null };
    } else if (item.kind === 'split') {
      const { onset, end } = input;
      const boundary = POLICY.reportValidSeconds;
      actual = { first_seconds: Math.max(0, Math.min(end, boundary) - onset), next_seconds: Math.max(0, end - Math.max(onset, boundary)), first_new_events: onset < boundary ? 1 : 0, next_new_events: onset >= boundary ? 1 : 0 };
    } else if (item.kind === 'boundary') {
      actual = { complete_windows: Math.floor(input.valid_seconds / POLICY.reportValidSeconds), partial_windows: input.valid_seconds % POLICY.reportValidSeconds ? 1 : 0 };
    } else throw new Error(`알 수 없는 산술 종류: ${item.kind}`);
    assert.deepEqual(actual, item.expected, item.id);
  }
  console.log(`문서 정적 검사 통과: ${scenarios.scenarios.length}개 흐름 규격, ${Object.keys(defaults).length}개 코드 정책값(파일럿 포함), ${problem.features.length}개 기능 참조, ${fixture.cases.length}개 가상 산술. 정책 승인·내용의 타당성·선택 경로 완주·앱/E2E는 별도 검증이다.`);

  if (process.argv.includes('--submission')) {
    const required = scenarios.scenarios.map((item) => `e2e/scenarios/${item.id}.spec.ts`);
    // 현재 흐름이 채택한 녹화 입력 자료이다. 공식 키트의 고정 파일명이 아니다.
    if (scenarios.scenarios.some((item) => item.steps.some((step) => step.includes('/?mode=eval')))) {
      required.push('e2e/fixtures/test-pose.webm', 'e2e/fixtures/test-pose.manifest.json');
    }
    const missing = required.filter((file) => {
      const location = path.join(root, file);
      return !fs.existsSync(location) || !fs.statSync(location).isFile() || fs.statSync(location).size === 0;
    });
    if (missing.length) {
      console.error(`제출 준비 검사 실패: 누락 또는 빈 파일 ${missing.length}개\n${missing.join('\n')}`);
      process.exitCode = 1;
    } else console.log('제출 자료 존재 검사 통과. 영상 품질·spec 내용·E2E 통과·주최 측 허용은 별도 확인한다.');
  }
} catch (error) {
  console.error(`문서 검사 실패: ${error.message}`);
  process.exitCode = 1;
}
