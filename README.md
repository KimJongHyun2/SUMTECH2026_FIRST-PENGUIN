# SUMTECH2026 FIRST-PENGUIN — 내 카드 찾기

신분과 한 달 지출을 넣으면 카드마다 **내가 실제로 받을 혜택 금액**을 계산해 맞는 카드를 추천하고, 지금 쓰는 카드와 비교해 **바꾸면 1년에 얼마 더 받는지**까지 보여 주는 웹 서비스예요.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/problem.yaml](docs/problem.yaml) | **기준.** 문제정의와 기능 명세 F1~F8 (대시보드가 읽음) |
| [docs/scenarios.yaml](docs/scenarios.yaml) | **기준.** 사용자 핵심 흐름 S1~S8 = E2E 대본 (대시보드가 읽음) |
| [docs/intent.md](docs/intent.md) | 왜 이렇게 만들었나 — 의도·차별점·안 만드는 것 |
| [docs/spec.md](docs/spec.md) | 화면·타입·계산식·문구·API 구현 명세 |
| [docs/plan.md](docs/plan.md) | 구현 순서·검증 방법·진행 상태 |
| [progress.md](progress.md) | 대회 진행 기록 |

## 기술 구성

Next.js 15 (App Router) · React 19 · TypeScript (strict) · CSS Modules. 데스크톱 웹 기준(헤더 + 2단 레이아웃, 좁은 화면은 1단). 카드 데이터는 `data/cards.json`(읽기 전용, DB 없음), 입력값은 브라우저 sessionStorage에만 저장해요.

```
src/
  app/          라우트(/, /find, /result, /compare, /cards, /cards/[id]) · api/parse-spending · __health
  components/   layout · ui(Button·Field·Panel·Badge) · card · find · result · compare  (각자 .module.css)
  providers/    FormProvider (입력 상태)
  lib/          types · constants · cards · recommend(계산, 순수 함수) · format · parse-spending(AI)
  styles/       globals.css (디자인 토큰)
data/cards.json
```

자세한 구조와 규칙은 [docs/spec.md](docs/spec.md) 2장을 봐 주세요.

## 실행

```bash
npm install
```

```bash
npm run dev
```

http://localhost:3000 에서 열려요. 그 밖의 명령: `npm run typecheck`, `npm run build`, `npm start`.
docker 실행 방법은 docker 구성을 마친 뒤 여기에 적어요.

| 환경변수 | 용도 | 설정 위치 |
|---|---|---|
| AI_GATEWAY_API_KEY | 문장으로 지출 입력(F3)의 AI 호출. 없으면 규칙 기반 추출로 대신함 | 로컬 `.env`, 배포 환경변수, GitHub Secrets |
| AI_MODEL | AI Gateway 모델 이름(선택, 기본 `openai/gpt-4o-mini`) | 로컬 `.env`, 배포 환경변수 |
| RELEASE_ID | `/__health`가 응답하는 배포 commit | 배포·CI |
