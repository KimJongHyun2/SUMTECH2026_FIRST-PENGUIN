# 제출 점수 전략 — 키트(loopthon-starter)가 무엇을 보는가

> 키트(START_HERE.md, CHECKLIST.md, steps/02-problem.md, steps/03-delivery.md, 2026-10-29판)를 읽고 정리했다. **키트에 점수표·배점은 없다.** 대신 대시보드가 읽는 것과 "탄탄한 칸"의 정의, 제출 요건(노란 줄)이 사실상의 채점 기준이다.

## 1. 대시보드가 자동으로 보는 것 (= 기계 채점)

| 보는 것 | 어디서 | 우리 상태 |
|---|---|---|
| `docs/problem.yaml` 캔버스 | main에 push된 파일을 직접 읽어 종이 캔버스 위치에 표시 | 표시 확인 완료(2026-10-29) |
| `docs/scenarios.yaml` | 주최 측 실행이 흐름을 읽어 E2E 실행, 단계마다 화면 캡처 | **아직 없음** → 다음 commit |
| `docker-compose.yml` | main push마다 빈 DB에서 `docker compose up --build`, 2분 안에 떠야 함 | 3단계 |
| `GET /__health` | 인증·리다이렉트 없이 200, 배포 commit = releaseId | 3단계 |
| 공개 HTTPS 배포 URL | UP 표시, 배포 commit 일치 | 3단계 |
| `e2e/scenarios/S<n>.spec.ts` | 흐름마다 spec 1개, test 1개, 팀 config 안 씀, 1분 안 | 6단계 |
| 자료 → 제출 요건 화면 | 노란 줄 = 미충족 항목 | 학생만 볼 수 있음 |

**고득점 규칙 1: 대시보드가 읽는 파일 3개(problem.yaml·scenarios.yaml·docker-compose.yml)가 형식 그대로 main에 있어야 점수가 "존재"한다.** 아무리 좋은 PRD도 이 파일이 없으면 기계는 못 본다.

## 2. 문제정의에서 "탄탄한 칸"의 정의 (steps/02-problem.md)

| 기준 | 뜻 | 우리 상태 | 올리려면 |
|---|---|---|---|
| 실제로 겪은 구체적인 장면 | "많은 학생이 불편"(일반론) ✗ → 언제·어디서·무슨 일·어떻게 대응 | **비어 있음** (experiences: []) | E1 한 건: 누가 언제 누구에게 "거북이 같아"를 들었고 그 뒤 뭘 했나 + 실제 한 말(quote) |
| 해법에서 거꾸로 만들지 않은 문제 | "우리 앱 기능이 없어서" ✗ | 통과 — "집중하면 무너지고 본인은 모른다" | 유지 |
| 원인이 끝까지 파고들어짐 | 5 Whys로 근본 문제 | 통과 — 4단계 "다시 무너지는 순간을 아무도 알려 주지 않는다" | 유지 |
| 출처 없는 수치가 없다 | 어림값은 추정이라 표시 | 통과 — measurable null, 수치 없음 | measurable을 **팀이 직접 잰 값**으로(예: 1시간 중 자세 무너진 횟수·분, "추정" 표기) |
| personas | 실제 대상 1명 | **비어 있음** | P1: 팀원 한 명을 비식별화해 처지까지 |
| sources | 열어 확인한 공개 URL + 원문이 직접 말하는 claim | **비어 있음** | detection-basis.md의 URL 중 **실제로 열어 본 것만** 옮기기. 추측 URL 금지 |
| alternatives의 why_ours | 대안 대신 우리여야 하는 이유 | 통과 | 유지 |
| solution_paths | 선택·보류·제외와 이유 | 통과 (chosen 1, deferred 2) | 유지 |
| features | 해법에서 나온 기능만, 입력·결과·관찰 가능한 완료 조건 | F1~F6 | 완료 조건의 수치(30초·5초)가 바뀌면 같이 고치기 |

**고득점 규칙 2: 문제정의 점수는 experiences·personas·sources·measurable 네 칸이 결정한다.** 지금 가장 비어 있고, 지어낼 수 없고, 팀만 채울 수 있다. 30분이면 채운다.

## 3. 구현 설계·흐름에서 보는 것 (steps/02-problem.md 2-C, 03-delivery.md)

- `scenarios.yaml`: `platform`·`platformReason`·`scenarios[].id/title/account/steps/expected`. steps는 **화면의 메뉴·버튼 이름 그대로** 한 줄 한 동작. expected는 저장된 값·바뀐 상태처럼 **화면에서 확인 가능한 결과**. chosen 해법마다 처음부터 끝까지 해내는 흐름이 있어야 함
- 첫 화면 `/`: 로그인 없이 서비스 이름과 하는 일이 보여야 함. 로그인 화면으로 보내면 감점 요인
- 플랫폼 이유: "다들 휴대폰" 같은 일반론 ✗ → 실제 장면("노트북 정면캠 앞에서 공부")
- 없는 주소는 404(500 아님), 주 플랫폼 화면 폭에서 안 깨짐
- E2E 금지: `test.skip`·`only`·try/catch 삼킴·`page.route`·`addInitScript`·화면 글자 바꾸는 evaluate·팀 config 의존. **우리 서비스는 카메라가 필요해서 이 제약이 가장 큰 기술 위험** → technical-design에서 먼저 푼다(가짜 카메라 장치 없이 spec만으로 통과하는 방법, 예: 앱 안의 테스트용 영상 입력 모드)
- 경고 시간 30초·복귀 5초는 E2E 1분 제한 안에 들어감. 5분이면 불가 → 설정값으로 줄일 수 있어야 함

## 4. 과정 규칙 (Agent 쪽 감점 요인)

- Agent가 문제·해법·기능 내용을 대신 채우면 안 됨 → 그래서 PRD의 **가정** 표시가 중요: "팀이 정한 것"과 "Agent 기본값"을 구분해 두고 팀이 확인하면 **확정**으로 바꾼다
- 확인하지 않은 결과를 성공으로 표시하지 않음 → progress.md 체크는 실제 확인한 것만
- 기능을 추가하려면 features에 먼저 → 구현

## 5. 지금 당장 점수가 오르는 순서

1. **E1·P1·measurable** 채우기 (팀, 30분) — 문제정의 점수의 빈칸
2. **PRD 가정값 확인** (팀, 5분) — 가정 → 확정
3. **scenarios.yaml** 작성·push (Agent) — 대시보드가 읽는 두 번째 파일
4. **sources** — detection-basis.md URL을 실제로 열어 본 것만 옮기기
5. 3단계: 최소 화면 + `/__health` + docker + 배포 → 대시보드 UP
