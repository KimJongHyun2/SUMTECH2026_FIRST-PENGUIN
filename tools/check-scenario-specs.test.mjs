import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkScenarioSpecs, checkSpec } from './check-scenario-specs.mjs';

const GOOD = `import { expect, test } from "@playwright/test"
// page.route는 쓰지 않는다 (주석은 검사하지 않음)
test("S1 흐름", async ({ page }) => {
  await page.goto("/")
  await test.step("단계", async () => {})
  await page.reload()
})
`;

function repo(scenarioIds, specs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-'));
  fs.mkdirSync(path.join(root, 'docs'));
  fs.mkdirSync(path.join(root, 'e2e/scenarios'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/scenarios.yaml'),
    `scenarios:\n${scenarioIds.map((id) => `  - id: ${id}\n    title: t\n`).join('')}`);
  for (const [name, code] of Object.entries(specs)) fs.writeFileSync(path.join(root, 'e2e/scenarios', name), code);
  return root;
}

test('test 하나·goto 한 번·주석의 API 이름은 통과', () => {
  assert.deepEqual(checkSpec(GOOD), []);
});

test('test 개수와 금지된 우회를 찾는다', () => {
  assert.match(checkSpec('test("a", () => {})\ntest("b", () => {})').join(), /test가 2개/);
  assert.match(checkSpec('').join(), /test가 0개/);
  assert.match(checkSpec('test.skip("a", () => {})').join(), /test.skip/);
  assert.match(checkSpec('test("a", async ({ page }) => { await page.route("**", r => r.fulfill()) })').join(), /page.route/);
  assert.match(checkSpec('test("a", async ({ page }) => { await page.addInitScript(() => {}) })').join(), /addInitScript/);
  assert.match(checkSpec('test("a", async ({ page }) => { await page.goto("/"); await page.goto("/x") })').join(), /goto가 2번/);
});

test('선언된 흐름의 spec 누락과 흐름에 없는 spec을 모두 실패로 본다', () => {
  const root = repo(['S1', 'S2', 'S3'], { 'S1.spec.ts': GOOD, 'S9.spec.ts': GOOD });
  const { results, extra, ok } = checkScenarioSpecs(root);
  assert.equal(ok, false);
  assert.deepEqual(results.map((r) => [r.id, r.problems.length]), [['S1', 0], ['S2', 1], ['S3', 1]]);
  assert.deepEqual(extra, ['S9.spec.ts']);
});

test('모든 흐름의 spec이 맞으면 통과', () => {
  const root = repo(['S1', 'S2'], { 'S1.spec.ts': GOOD, 'S2.spec.ts': GOOD });
  assert.equal(checkScenarioSpecs(root).ok, true);
});
