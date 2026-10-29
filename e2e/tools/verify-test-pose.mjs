// 평가 입력 영상(e2e/fixtures/test-pose.webm)의 구간 명세를 만든다 (docs/prd.md 7절).
// 1) 사람이 정한 구간 라벨·해시를 쓰고 2) 개발 서버의 확인 페이지에서 앱과 같은 추론으로 구간을 확인한 뒤
// 3) 기준을 넘은 구간만 verified로 표시한다. 가상 값으로 채우지 않는다.
//
// 사용: posture-web에서 EVAL_ENABLED=true npm run dev 를 띄운 뒤, e2e에서
//   node tools/verify-test-pose.mjs [https://localhost:5173]
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures')
const FILE = 'test-pose.webm'
const BASE = process.argv[2] ?? 'https://localhost:5173'

// 사람의 라벨. 원본은 e2e/tools/record.html로 같은 자리·조명에서 촬영 당사자 동의를 받아 찍은 영상 3개다.
const SEGMENTS = [
  { label: 'good', start: 0, end: 16, description: '바른 자세로 앉아 있기 (손으로 얼굴을 만지는 장면을 뺀 16초)' },
  { label: 'turtle', start: 16, end: 36, description: '몸은 그대로, 머리를 화면 쪽으로 내민 채 유지 (20초)' },
  { label: 'away', start: 36, end: 51, description: '자리를 비워 화면에 본인이 없음, 뒤쪽 다른 사람만 보임 (15초)' },
  { label: 'brief_touch', start: 51, end: 54.5, description: '바른 자세에서 손으로 안경·머리를 잠깐 만짐 (약 2초 가림 포함, 참고용)' },
]

// 구간이 라벨대로 판정되는지의 기준(추론 프레임 비율).
const CHECKS = {
  good: (r) => r.valid / r.frames >= 0.9 && r.deviated / r.frames <= 0.05,
  turtle: (r) => r.valid / r.frames >= 0.9 && r.deviated / r.frames >= 0.9,
  away: (r) => r.away / r.frames >= 0.9,
  brief_touch: (r) => r.valid / r.frames >= 0.3, // 참고 구간: 가린 시간이 있어도 대부분 유효
}

const bytes = readFileSync(join(FIXTURES, FILE))
const manifest = {
  file: FILE,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  bytes: bytes.length,
  width: 640,
  height: 480,
  fps: 30,
  codec: 'vp8',
  durationSeconds: 54.5,
  source: 'front-good·front-turtle·front-away 원본(e2e/tools/record.html, 640×480)을 이어 붙여 VP8로 다시 인코딩',
  segments: SEGMENTS.map((s) => ({ ...s, verified: false })),
}
const write = () => writeFileSync(join(FIXTURES, 'test-pose.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
write()

const browser = await chromium.launch()
const page = await browser.newPage({ ignoreHTTPSErrors: true })
await page.goto(`${BASE}/tools/verify-eval-input.html`)
await page.locator('#out[data-done]').waitFor({ timeout: 300_000 })
const text = await page.locator('#out').textContent()
await browser.close()
if (!text.startsWith('{')) throw new Error(text)
const { stepSeconds, results } = JSON.parse(text)

for (const segment of manifest.segments) {
  segment.inference = results[segment.label]
  segment.verified = CHECKS[segment.label](results[segment.label])
}
manifest.verification = {
  date: new Date().toISOString().slice(0, 10),
  method: `구간마다 ${stepSeconds}초 간격 프레임을 앱과 같은 모델·신호·판정 코드로 추론. 기준은 good 구간 평균`,
  model: 'pose_landmarker_lite/float16/1+face_landmarker/float16/1',
  criteria: 'good: 유효≥90%·이탈≤5%, turtle: 유효≥90%·이탈≥90%, away: 자리 비움≥90%',
  note: '앱 실행 중 판정은 400ms 처리·최근 3개 평균이라 프레임 단위 결과와 다를 수 있다. E2E 시각 오차는 별도 실측한다.',
}
write()
console.log(JSON.stringify(manifest.segments.map(({ label, verified, inference }) => ({ label, verified, ...inference })), null, 2))
