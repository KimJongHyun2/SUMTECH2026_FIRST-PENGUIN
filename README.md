# SUMTECH2026 FIRST-PENGUIN — 패스트거북이

노트북 학습 중 개인 기준 대비 자세 변화를 확인하고 기록·리포트로 점검하는 서비스이다. 현재 기획은 등록 5초·최초 경고 10초·복귀 3초·재경고 60초·자동 리포트 유효 30분을 기준으로 한다. 자리 비움은 판정 보류·연속 타이머 초기화이며 기록은 로그인 없이 같은 PC 사이트·브라우저 프로필에 로컬 저장하는 원칙이다.

기획 문서와 병행 개발된 초기 구현은 구분한다. `posture-web/`에 서비스·기술 검증 코드가 있지만 최신 기획 전체의 구현·배포·E2E 검증 완료를 뜻하지 않는다. 이번 정합성 작업은 기획 문서만 수정한다.

- [문제정의·기능 명세](docs/problem.yaml)
- [독립 사용자 흐름과 기대 결과](docs/scenarios.yaml)
- [최신 PRD](docs/prd.md)
- [공통 정책값·용어](docs/planning-policy.yaml)
- [집계·중단·삭제 계약](docs/report-contract.md)
- [검증 계획과 실행 제약](docs/validation-plan.md)
- [자료 충돌 처리 기록](docs/integration-notes.md)
- [기획 평가 대응 메모](docs/scoring-strategy.md)
- [진행 기록](progress.md)

문서 검사는 `tools` 디렉터리에서 `npm ci`로 기존 의존성을 준비한 뒤 저장소 루트에서 실행한다.

```sh
node tools/check-problem.mjs
node tools/check-planning.mjs
```

이 검사는 문서 구조·참조·가상 구간 산술을 확인하며 앱 실행·주최측 재현·기획 재채점을 대신하지 않는다. 스타터킷 양식의 키·단계 수·문자 수도 별도로 대조했으며 실제 결과는 진행 기록에 남긴다. 자동 리포트의 실제 30분 시험과 흐름당 로컬 1분 이내 요건, 카메라·다중 기기 재현 방식은 미해결이다.

초기 구현 실행 안내는 [posture-web/README.md](posture-web/README.md)에 있다. 과거 정적 확인에서 발견한 기획과 구현의 차이는 [구현 대조 기록](docs/implementation-status.md)에 있다. 이번 작업에서 앱·Docker·E2E·배포는 실행하지 않는다.
