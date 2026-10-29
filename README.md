# SUMTECH2026 FIRST-PENGUIN — 패스트거북이

노트북 학습 중 개인 기준 대비 자세 변화를 확인하고 기록·리포트로 점검하는 서비스의 기획 저장소입니다. 현재는 문서 단계이며 앱 구현·배포·E2E 완료 상태가 아닙니다.

- [문제정의·기능](docs/problem.yaml)
- [핵심 사용자 흐름](docs/scenarios.yaml)
- [통합 PRD](docs/prd.md)
- [공통 정책값](docs/planning-policy.yaml)
- [집계 계약](docs/report-contract.md)
- [검증 계획과 외부 제약](docs/validation-plan.md)
- [보완자료 충돌 처리](docs/integration-notes.md)
- [진행 기록](progress.md)

문서 검사: tools 디렉터리에서 npm ci 후 저장소 루트에서 node tools/check-problem.mjs 및 node tools/check-planning.mjs를 실행합니다. 이 검사는 문서 구조·참조·가상 구간 산술을 확인하며 앱 실행을 대신하지 않습니다.

서비스 설치·Docker 실행 방법은 구현 후 실제 확인한 명령으로 작성합니다.
