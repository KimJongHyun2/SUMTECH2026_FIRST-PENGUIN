# SUMTECH2026 FIRST-PENGUIN — 패스트거북이

패스트거북이는 노트북 공부·작업 중 지속적인 자세 변화를 알려 사용자가 더 빨리 알아차리고 스스로 조정하도록 돕는 거북목 예방 지원 서비스이다. 핵심 문제는 **작업 몰입 시 발생하는 자세 인지 불능(Unawareness)**, 즉 자세 변화를 제때 알아차리지 못하는 상황이다. 의학적 치료·진단·발병 확률 계산은 범위 밖이다.

성공 지표는 **자세 이탈 비율 R = 확정 이탈 시간 D / 전체 세션 유효 시간 V × 100(%)**이다. 비교 가능한 조건에서 감소 여부를 확인하고, 인지까지 걸리는 시간·오경고·작업 방해도 별도 검증한다. V=0이면 계산 불가이며 보류·등록·정지 시간은 제외한다. 자세 변화 감지·알림 발생만으로 인지 향상이나 예방 효과를 확정하지 않는다.

단일 정책은 기준 등록 5초·최초 연속 유효 이탈 10초·복귀 3초·재경고 60초·자동 리포트 누적 유효 30분이다. 자리 비움·인식 불가는 판정 보류·연속 타이머 초기화, 딥 장애는 유효 정면 기준·입력과 사용자 선택 후 기본 전환이다. 로그인 없이 같은 PC 사이트·브라우저 프로필에 로컬 저장한다. 화면 상태 문구 ‘거북목이에요’는 유지한다.

기획 점수는 사용자 전달 기준 **14.6/30**, 목표는 **20점대 상위권**이다. 팀 제공 인터뷰 E1~E3·five_whys·why_ours를 반영한다. 핵심 기능은 problem.yaml, 상세 정책·구현 계약·리스크는 PRD를 따른다. 문서 검사와 앱·E2E·효과·점수 검증은 별도로 확인한다.

- [문제정의·기능 명세](docs/problem.yaml)
- [독립 사용자 흐름과 기대 결과](docs/scenarios.yaml)
- [최신 PRD](docs/prd.md)
- [공통 정책값·용어](docs/planning-policy.yaml)
- [집계·중단·삭제 계약](docs/report-contract.md)
- [검증 계획과 실행 제약](docs/validation-plan.md)
- [기획 문서 연결 기준](docs/integration-notes.md)
- [기획 평가 대응 기준](docs/scoring-strategy.md)
- [최신 Starter Kit 대조](docs/starter-kit-review.md)
- [과거 기획·초기 실험 아카이브](archive/README.md)
- [진행 기록](progress.md)

문서 검사는 `tools` 디렉터리에서 `npm ci`로 기존 의존성을 준비한 뒤 저장소 루트에서 실행한다.

```sh
node tools/check-problem.mjs
node tools/check-planning.mjs
```

이 검사는 문서 구조·참조·가상 구간 산술을 확인하며 앱 실행·주최측 재현·기획 재채점을 대신하지 않는다. 테스트 가용성 정책은 [PRD §5.1·§8.1](docs/prd.md)에 명시한다. 운영 자동 리포트는 30분이며 S3은 테스트에서 첫 주기만 3초로 가속하고, S5·S6은 단일 PC의 측면 데이터 주입 버튼으로 재현하도록 설계한다. 테스트 도구·E2E spec 구현, 실제 실행, 운영 1800초·실기기 시험과 주최측 mock 예외 수용 확인은 남아 있다.

초기 구현 실행 안내는 [posture-web/README.md](posture-web/README.md)에 있다. 과거 정적 확인에서 발견한 기획과 구현의 차이는 [구현 대조 기록](archive/planning-history/implementation-status.md)에 있다.
