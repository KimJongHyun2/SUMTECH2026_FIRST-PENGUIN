// docs/scenarios.yaml의 각 흐름 ID에 e2e/scenarios/<id>.spec.ts와 test 하나가 있는지 검사한다.
// 루프톤 실행 규칙(START_HERE)의 금지 우회도 함께 찾는다. 팀이 정한 평가 영상 파일명은 공식 규격이 아니라 검사하지 않는다.
// 이 검사는 파일 구성만 본다. spec이 실제로 통과하는지는 scenarios workflow의 Playwright 실행이 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

const FORBIDDEN = [
  [/\b(test|describe)\.(skip|only|fixme)\b/, 'test.skip·only·fixme'],
  [/\.route\s*\(/, 'page.route·context.route'],
  [/\broute\.fulfill\b/, 'route.fulfill'],
  [/\brouteFromHAR\b/, 'routeFromHAR'],
  [/\brouteWebSocket\b/, 'routeWebSocket'],
  [/\baddInitScript\b/, 'addInitScript'],
];

/** 주석의 글자는 검사하지 않는다(설명에 API 이름을 적을 수 있다). */
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

export function checkSpec(code) {
  const body = stripComments(code);
  const problems = [];
  // test.describe·test.step 같은 속성 호출은 빼고 test( 호출만 센다.
  const tests = (body.match(/(^|[^.\w])test\s*\(/g) ?? []).length;
  if (tests !== 1) problems.push(`test가 ${tests}개예요 (1개여야 해요)`);
  for (const [pattern, name] of FORBIDDEN) {
    if (pattern.test(body)) problems.push(`금지된 우회 사용: ${name}`);
  }
  const gotos = (body.match(/\.goto\s*\(/g) ?? []).length;
  if (gotos > 1) problems.push(`page.goto가 ${gotos}번이에요 (context마다 1번)`);
  return problems;
}

export function checkScenarioSpecs(root) {
  const { scenarios = [] } = yaml.load(fs.readFileSync(path.join(root, 'docs/scenarios.yaml'), 'utf8')) ?? {};
  const ids = scenarios.map((s) => s.id);
  const dir = path.join(root, 'e2e/scenarios');
  const results = ids.map((id) => {
    const file = path.join(dir, `${id}.spec.ts`);
    if (!fs.existsSync(file)) return { id, problems: ['spec 파일이 없어요'] };
    return { id, problems: checkSpec(fs.readFileSync(file, 'utf8')) };
  });
  // 흐름에 없는 spec은 주최 측이 실행하지 않는다. 이름이 어긋난 것을 놓치지 않게 알린다.
  const extra = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.spec.ts') && !ids.includes(f.replace(/\.spec\.ts$/, '')))
    : [];
  return { results, extra, ok: results.every((r) => !r.problems.length) && !extra.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { results, extra, ok } = checkScenarioSpecs(root);
  for (const { id, problems } of results) {
    console.log(problems.length ? `✗ ${id}: ${problems.join(', ')}` : `✓ ${id}`);
  }
  for (const file of extra) console.log(`✗ ${file}: docs/scenarios.yaml에 없는 흐름이에요`);
  const done = results.filter((r) => !r.problems.length).length;
  console.log(`흐름 ${results.length}개 중 spec 준비 ${done}개. 파일 구성 검사이며 실행 통과는 scenarios workflow가 확인한다.`);
  process.exit(ok ? 0 : 1);
}
