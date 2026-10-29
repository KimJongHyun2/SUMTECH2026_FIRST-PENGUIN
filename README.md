# SUMTECH2026 FIRST-PENGUIN — 패스트거북이

노트북 학습 중 개인 기준 대비 자세 변화를 확인하고 기록·리포트로 점검하는 서비스입니다. 보완 기획과 병행 개발된 초기 구현은 구분합니다. `posture-web/`에 서비스·기술 검증 코드가 있으며, 최신 기획 전체를 구현하거나 배포·E2E를 검증한 상태는 아닙니다.

- [문제정의·기능](docs/problem.yaml)
- [핵심 사용자 흐름](docs/scenarios.yaml)
- [통합 PRD](docs/prd.md)
- [공통 정책값](docs/planning-policy.yaml)
- [집계 계약](docs/report-contract.md)
- [검증 계획과 외부 제약](docs/validation-plan.md)
- [보완자료 충돌 처리](docs/integration-notes.md)
- [진행 기록](progress.md)

문서 검사: tools 디렉터리에서 npm ci 후 저장소 루트에서 node tools/check-problem.mjs 및 node tools/check-planning.mjs를 실행합니다. 이 검사는 문서 구조·참조·가상 구간 산술을 확인하며 앱 실행을 대신하지 않습니다.

초기 구현 실행 안내는 [posture-web/README.md](posture-web/README.md)에 있습니다. 이번 문서 작업에서는 앱을 실행하지 않았습니다. 최신 설계와 기존 구현의 차이는 [구현 대조 기록](docs/implementation-status.md)에 있습니다. Docker 실행 방법은 실제 확인 후 작성합니다.
