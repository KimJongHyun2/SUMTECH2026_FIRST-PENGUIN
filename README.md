# SUMTECH 2026 루프톤 — 패스트거북이

패스트거북이는 공부·코딩에 몰입한 대학생에게 지속적인 자세 변화를 알려 스스로 확인하고 조정하도록 돕는 서비스이다. 개인 기준 비교와 경고·복귀 기록·리포트를 연결해 거북목 예방을 위한 일상 자세 관리를 지원한다. 측정 범위는 [구현 설계](docs/prd.md#2-화면과-판정-입력)를 따른다.

## 구현 설계

핵심 흐름은 개인 기준 등록 → 탐지 → 지속 이탈 경고 → 복귀 → 리포트·기록 확인이다. 로그인 없이 같은 PC 브라우저에 기준·설정·세션·리포트를 저장한다. 선택형 딥 모드는 휴대폰 측면 입력을 추가한다. 두 경로 모두 현재 채택 범위이며, 기획과 실제 구현 완료는 구분한다.

| 문서 | 역할 |
|---|---|
| [문제정의·기능 명세](docs/problem.yaml) | 사용자 경험·근거·대안·선택 이유·기능별 입력·결과·완료 조건이다. |
| [사용자 흐름](docs/scenarios.yaml) | 주 사용 플랫폼, 행동 순서와 최종 확인 결과이다. |
| [MVP 구현 설계](docs/prd.md) | 화면·판정·시간·상태 전이·집계·저장·실패 처리·시험 설계이다. |
| [진행 기록](progress.md) | 실행 결과·미완료 조건·팀 결정 대기이다. |

기록의 읽기·변경·삭제 범위는 같은 사이트·브라우저 프로필이다. 구현의 기본값은 [policy.js](posture-web/src/core/policy.js), 세부 동작·실패 조건은 PRD를 따른다. 정책 변경은 기능 명세·시나리오·구현과 함께 맞춘다. 과거 자료는 [archive](archive/README.md)에 둔다.

팀은 캡스톤 디자인과 해커톤에서 노트북으로 작업하는 IT융합학과 4학년 당사자들이다. 팀 소개 원문은 [정리 전 기록](archive/planning-history/2026-10-30-docs-consolidation/problem.before-consolidation.yaml)에 보존한다. 당사자 경험 자체를 효과·차별성의 입증으로 사용하지 않는다.

## 설치·개발·검사

React 화면의 개발·빌드·UI 검사는 [frontend 실행 안내](frontend/README.md)를 따른다. 아래 명령은 기존 `posture-web` 구현과 제출 문서 검사 기준이다. 두 구현의 실행·배포 경로는 각각 유지한다.

Node.js 24를 기준으로 한다. 명령은 저장소 루트에서 실행한다. 개발 서버의 실제 HTTPS 주소는 Vite 출력으로 확인한다.

```sh
npm ci --prefix tools
npm ci --prefix posture-web
npm run dev --prefix posture-web
```

```sh
node tools/check-problem.mjs
node tools/check-planning.mjs
npm test --prefix posture-web
npm run build --prefix posture-web
```

문제정의 검사는 형식 오류와 내용 보강 대상을 구분한다. null·빈 배열을 채우려고 경험·근거를 만들지 않는다. 정적 검사는 문서 규격·코드 기본값 대조·가상 산술이며 기획 점수나 앱 실행 성공이 아니다.

## 환경변수

| 이름 | 용도 | 설정 위치 |
|---|---|---|
| `RELEASE_ID` | 실제 빌드·배포 commit 전체 SHA이다. 로컬 기본값 dev는 제출 버전이 아니다. | Docker 빌드·실행 환경, CI 또는 배포 환경이다. |
| `AI_GATEWAY_API_KEY` | 향후 서버 AI 호출에 쓰는 비밀키이다. 현재 서비스는 Gateway를 호출하지 않는다. | 필요할 때 서버·배포 환경과 GitHub Secrets에 직접 설정한다. |
| `PORT` | 로컬 Node 서버 포트이다. Docker의 app은 3000을 사용한다. | 로컬 실행 환경이다. |
| `E2E_BASE_URL` | 로컬 E2E가 접속하는 앱 주소이다. 주최 측 주소는 실행 환경이 정한다. | E2E 실행 환경이다. |
| `EVAL_ENABLED` | `true`로 빌드하면 평가 자료(`e2e/fixtures/test-pose.*`)를 산출물 `/eval/`에 넣고, `/?mode=eval`로 연 탭에서만 녹화 입력·테스트 도구를 켠다. 자료가 없으면 빌드가 실패한다. 주최 측 허용 여부는 미확인이다(PRD 7절). | `docker-compose.yml` 빌드 인자(기본 true)이다. 배포 사이트 빌드에는 넣지 않는다. |

비밀값은 저장소·브라우저 번들·로그에 넣지 않는다. `.env.example`은 변수 이름만 제공한다.

## 루프톤 제출 요건

2026-10-30 공식 API에서 받은 Starter Kit의 START_HERE·steps/02-problem·steps/03-delivery·예시 양식과 대조했다. ZIP SHA-256은 `304478e454c1fc7d0d68a01b90892af63715e4fcf0bbf3dc4cf08fb7f4c7c61e`이다. 아래는 제출·실행 요건이며 세부 배점표가 아니다.

- 기본 브랜치의 `docs/problem.yaml`·`docs/scenarios.yaml`과 구현 설계가 있어야 한다. 흐름은 3~8개, 단계는 1~12개, 제목은 1~120자, expected는 1~500자이다. 채택한 해법마다 끝까지 수행하는 흐름을 둔다.
- 주최 측은 배포 사이트 대신 저장소의 `Dockerfile`·`docker-compose.yml`로 앱을 빈 DB에서 띄운다. app은 컨테이너 안 3000 포트를 사용한다. 이 서비스는 로그인·서버 DB가 없어 시드 계정도 없다.
- 빌드는 10분 이내, 기동부터 `/__health` 200까지는 2분 이내이다. health는 인증·리다이렉트 없이 실제 배포 SHA를 releaseId로 반환한다.
- 각 흐름에 `e2e/scenarios/<id>.spec.ts` 하나와 test 하나를 둔다. UI 단계와 최종 값을 실제로 검증하고 앞 흐름의 데이터에 기대지 않는다. 입력 자료는 저장소의 `e2e/fixtures/`에 포함한다.
- 흐름은 로컬에서 1분 안에 끝나야 한다. 주최 측은 자체 Playwright 설정을 쓰므로 팀의 globalSetup·storageState·retries·카메라 설정에 기대지 않는다. spec은 baseURL 기준 상대 주소를 사용한다.
- skip·가짜 응답/상태·단계 우회를 쓰지 않는다. PRD의 녹화 입력·측면 모의 입력·시간 가속은 팀 설계이며 각각의 허용 여부는 미확인이다.
- 공개 HTTPS 배포는 발표·대시보드 상태용이다. CI·실제 실행·배포 버전을 각각 확인한다. 키트에는 30점 상세 배점표가 없다.

## Docker·흐름 검증

```sh
docker compose down -v
docker compose up -d --build
curl --fail http://localhost:3000/__health
node tools/check-planning.mjs --submission
npm ci --prefix e2e
```

E2E 자료·구현을 준비한 뒤 e2e 디렉터리에서 실행한다.

```sh
npx playwright install chromium
npx playwright test --project=desktop --forbid-only
```

테스트가 없으면 실패한다. 제출 자료 존재 검사도 파일 내용·영상 추론·실제 E2E 통과를 대신하지 않는다. 현재 준비 상태는 진행 기록을 따른다. 실제 제출에서는 CI가 하는 것처럼 RELEASE_ID에 빌드 대상 SHA를 주입한다.

## 딥 모드 연결 서버

`posture-web/server.js`가 앱과 같은 포트에서 `/relay` WebSocket을 받는다. QR 토큰·PC 승인·측면 입력 전달·유실·종료 확인을 처리하며 연결 상태는 메모리에만 둔다. 프로토콜은 PRD 6절, 시간값은 `posture-web/shared/deep-protocol.js`이다. 서버 테스트는 `npm test --prefix posture-web`에 포함된다.

- 사용 순서: PC 첫 화면의 '딥 모드 사용하기'(`/connect`)에서 QR을 띄우고, 휴대폰으로 QR 주소(`/phone?token=…`)를 열어 '연결 요청' → PC '연결 승인' → 휴대폰 '측면 촬영 시작' → PC '카메라 켜기'·'기준 자세 등록'(정면·측면 동시 5초) → '딥 모드 탐지 시작'이다.
- 휴대폰 카메라는 HTTPS(보안 문맥)에서만 켜진다. 같은 Wi-Fi에서 시험할 때는 `npm run dev --prefix posture-web`의 HTTPS 주소(자체 서명 인증서)를 PC·휴대폰에서 연다.
- Vercel 같은 정적 호스팅에서 `/relay` 연결이 실패하거나 2초 동안 접속 응답이 없으면 BroadcastChannel로 자동 전환한다. 같은 브라우저·동일 출처의 PC 탭과 휴대폰 역할 탭(평가용 모의 입력 포함) 사이에서 QR 승인·측면 입력·촬영 종료 확인을 전달한다. 서로 다른 실제 기기의 연결에는 WebSocket 중계가 필요하다. 탭 사이 연결에서도 QR 주소를 열고 PC 승인을 거쳐야 하며, 연결 유실 시 기존 승인을 재사용하지 않는다.

## 배포 사이트

Vercel 배포는 `posture-web`에서 빌드한다. 배포할 commit을 깨끗한 작업 트리로 꺼낸 뒤 그 commit의 전체 SHA를 `RELEASE_ID`로 넣는다. 작업 중인 파일이 남은 상태에서 다른 SHA를 붙여 배포하지 않는다.

```sh
git status --porcelain   # 비어 있어야 한다
npx vercel deploy --prod --build-env RELEASE_ID=$(git rev-parse HEAD)
curl https://<배포 주소>/__health   # releaseId가 같은 SHA인지 확인
```
