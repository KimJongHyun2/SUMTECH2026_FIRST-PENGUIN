# 구현 명세 (spec) — 내 카드 찾기

> [problem.yaml](problem.yaml)의 기능 F1~F8을 구현 수준으로 풀어 쓴 문서예요. **두 문서가 다르면 problem.yaml이 맞아요.** 새 기능은 problem.yaml에 먼저 추가해요.
> 화면 글자(버튼·문구)는 [scenarios.yaml](scenarios.yaml)과 E2E가 그대로 찾으니, 아래 표의 글자를 바꾸면 세 곳을 같은 commit에서 고쳐요.

## 1. 기술 구성

| 항목 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | Next.js 15 App Router + React 19 | AI 키를 서버에서만 쓰는 API, `/__health`, 404를 앱 하나로 처리 |
| 언어 | TypeScript (strict) | 카드·입력·계산 결과 타입을 고정해 기획과 코드의 어긋남을 줄임 |
| 스타일 | CSS Modules + `app/globals.css`의 CSS 변수(디자인 토큰) | 추가 의존성 없이 컴포넌트별 스타일 분리 |
| 데이터 | `data/cards.json` (읽기 전용, 서버에서 import) | 카드 정보는 사용자가 바꾸지 않아 DB가 필요 없음 |
| 상태 | React Context + sessionStorage(`card-finder-form`) | 로그인 없이 새로고침·뒤로 가기에도 입력 유지 |
| AI | Vercel AI Gateway (OpenAI 호환 `/v1/chat/completions`), 모델은 `AI_MODEL` 환경변수 | 키가 없으면 규칙 기반 추출로 대신(F3) |

## 2. 폴더 구조

```
app/
  layout.tsx            공통 레이아웃 + FormProvider
  globals.css           디자인 토큰(색·간격·반경), 기본 요소 스타일
  page.tsx              /            첫 화면
  find/page.tsx         /find        입력 (F2·F3·F8)
  result/page.tsx       /result      추천 결과 (F4·F6 담기·F8)
  compare/page.tsx      /compare     비교 표 (F6)
  cards/page.tsx        /cards       전체 카드 (F7)
  cards/[id]/page.tsx   /cards/:id   카드 상세 (F5, 없는 id → notFound())
  not-found.tsx         404 화면
  api/parse-spending/route.ts   F3 서버 API
  %5F%5Fhealth/route.ts         GET /__health
components/             화면 조각 (각자 .module.css)
lib/
  types.ts              Card, Benefit, FormState, Evaluation 등 타입
  constants.ts          CATEGORIES, STATUSES, CARD_TYPES, sessionStorage 키
  cards.ts              cards.json 로드·조회 (서버 전용)
  recommend.ts          evaluate(), recommend(), compareWithCurrent() — 순수 함수
  format.ts             won(), signedWon()
  parse-spending.ts     AI 호출 + 규칙 기반 대체 추출
data/cards.json
```

## 3. 데이터 타입

```ts
type Category = "식비·카페" | "대중교통" | "편의점" | "온라인쇼핑" | "통신비" | "구독서비스" | "기타";
type Status = "대학생" | "군인" | "직장인" | "기타";
type Target = "전체" | "대학생" | "군인";

interface Benefit { category: Category; rate: number /* % */; cap: number /* 월 한도(원) */ }
interface Card {
  id: string; name: string; issuer: string; type: "신용" | "체크";
  annualFee: number; target: Target; minAge: number; minSpend: number /* 전월실적(원) */;
  benefits: Benefit[]; sourceUrl: string | null; checkedAt: string | null /* YYYY-MM-DD */;
}
interface FormState {
  status: Status | ""; age: string; cardType: "상관없음" | "신용카드" | "체크카드"; feeCap: string;
  spend: Record<Category, number>; sentence: string; currentCardId: string | null; compareIds: string[];
}
interface Evaluation { card: Card; monthly: number; yearly: number; parts: { category: Category; amount: number }[]; shortOfMinSpend: boolean }
```

## 4. 계산 (lib/recommend.ts)

```
evaluate(card, spend):
  total = Σ spend
  if total < card.minSpend → monthly 0, parts [], shortOfMinSpend true
  parts = card.benefits 각각 min(floor(spend[b.category] × b.rate / 100), b.cap), 0원 초과만
  monthly = Σ parts, yearly = monthly × 12 − card.annualFee

recommend(cards, form):
  filter: (target = "전체" or target = status) and age ≥ minAge and (cardType 상관없음 or 종류 일치) and annualFee ≤ feeCap(비면 ∞)
  map evaluate → sort yearly 내림차순, annualFee 오름차순, name 가나다순 → 앞에서 3장

compareWithCurrent(top, current):  # F8, current는 거르기 없이 evaluate
  gain = top[0].yearly − current.yearly
  gain > 0 → "1위 카드로 바꾸면 연 {gain}원 더", 아니면 "지금 카드가 가장 잘 맞아요. 바꾸지 않아도 돼요"
  카드마다 diff = card.yearly − current.yearly (같은 카드면 0, "지금 쓰는 카드" 표시)
```

## 5. 화면별 요소와 문구

### / 첫 화면
- 제목 "내 카드 찾기", 소개 2줄(금액 계산 추천 · 지금 카드와 비교)
- 버튼 **내 카드 찾기** → /find, **전체 카드 보기** → /cards

### /find 입력
| 요소 | 라벨/글자 | 규칙 |
|---|---|---|
| 선택 | 신분 | 대학생·군인·직장인·기타, 기본 "선택" |
| 숫자 | 나이 | 1 이상 |
| 선택 | 카드 종류 | 상관없음(기본)·신용카드·체크카드 |
| 숫자 | 연회비 상한 | 비우면 제한 없음 |
| 글 | 문장으로 입력 | 버튼 **AI로 채우기** (요청 중 "분석 중…", 비활성) |
| 숫자 ×7 | 분야 이름 그대로 | 0 이상, 비우면 0 |
| 검색 | 지금 쓰는 카드 | 이름 일부 검색 → 결과 목록 클릭으로 선택, 선택 후 **빼기** |
| 버튼 | **추천 받기** | 검사 통과 시 /result |

오류 문구(위에서부터 첫 오류 하나): "신분을 골라 주세요" → "나이를 입력해 주세요" → "지출 금액을 하나 이상 입력해 주세요"
F3 문구: "소비 내용을 적어 주세요" / "자동 채우기에 실패했어요. 직접 입력해 주세요" · F8 검색 결과 없음: "찾는 카드가 없어요"

### /result 추천 결과
- (F8) 맨 위 상자: "지금 카드: {이름} · 연간 순혜택 {n}원" + "1위 카드로 바꾸면 연 {n}원 더" 또는 "지금 카드가 가장 잘 맞아요. 바꾸지 않아도 돼요"
- 카드 3장: "{순위}위", 이름(→ /cards/[id]), 카드사·종류, "예상 월 혜택 {n}원", "연간 순혜택 {n}원", "연회비 {n}원", 분야별 "{분야} 월 {n}원", 실적 미달이면 "실적 미달" 표시, (F8) "지금보다 연 +{n}원" / "−{n}원", 지금 카드면 "지금 쓰는 카드"
- 버튼 **비교 담기** ↔ **담김**(다시 누르면 취소), 4번째 담기 시 "최대 3장까지 비교할 수 있어요"
- 하단 **다시 입력하기**(→ /find, 값 유지), **비교하기 ({n})** (2장 미만이면 비활성)
- 결과 없음: "조건에 맞는 카드가 없어요. 연회비 상한이나 카드 종류를 바꿔 보세요" · 입력 없음: "먼저 내 정보를 입력해 주세요" + **입력하러 가기**

### /compare 비교
- 표 열 = 카드, 행 = 카드, 연회비, 전월실적, 예상 월 혜택, 연간 순혜택, 7개 분야별 혜택 금액 · 2장 미만이면 안내 + **추천 결과로**

### /cards 전체 카드
- 필터 "카드 종류"(전체·신용·체크), "가입 대상"(전체·대학생·군인) · 항목: 이름, 카드사·종류, "연회비 {n}원", "가입 대상 전체" 또는 "가입 대상 {대상} 전용"

### /cards/[id] 상세
- 혜택 표(분야·할인율·월 한도), 전월실적·연회비·가입 대상·최소 나이, **출처**(새 탭) · "{YYYY-MM-DD} 기준", "단순화한 계산이에요: 전월실적 구간은 가장 낮은 구간만, 실적 제외 조건은 반영하지 않아요"

## 6. API

### POST /api/parse-spending
- 요청 `{ "text": string }` · 응답 200 `{ "spending": Record<Category, number>, "source": "ai" | "rule" }`
- 400 `{ "error": "소비 내용을 적어 주세요" }` · 422/502/504 `{ "error": "자동 채우기에 실패했어요. 직접 입력해 주세요" }`
- `AI_GATEWAY_API_KEY`가 있으면 AI Gateway 호출(20초 제한, 응답 JSON 검증: 7개 분야 키, 0 이상 정수), 없으면 규칙 추출(분야 키워드 + "20만 원"/"60000원" 금액 패턴)

### GET /__health
- 인증·리다이렉트 없이 200 `{ "ok": true, "releaseId": RELEASE_ID ?? "dev" }`

## 7. 환경변수

| 이름 | 용도 | 필수 |
|---|---|---|
| AI_GATEWAY_API_KEY | F3 AI 호출 (서버 전용) | 배포 시 |
| AI_MODEL | AI Gateway 모델 이름 (기본값은 lib/parse-spending.ts) | 아니오 |
| RELEASE_ID | /__health가 돌려주는 배포 commit | 배포 시 |
