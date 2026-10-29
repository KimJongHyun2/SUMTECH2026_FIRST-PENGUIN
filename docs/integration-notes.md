# 기획 문서 연결 기준

| 문서 | 담당 내용 |
|---|---|
| [problem.yaml](problem.yaml) | 문제 정의·인터뷰 E1~E3·팀의 five_whys·why_ours·외부 근거·핵심 기능이다. |
| [PRD](prd.md) | 상세 정책 수치·기능별 구현 계약·상태 전이·저장·리스크·테스트 예외이다. |
| [planning-policy.yaml](planning-policy.yaml) | PRD와 같은 정책의 구조화된 참조이다. |
| [scenarios.yaml](scenarios.yaml) | 독립 UI 흐름 S1~S8과 관찰 가능한 결과이다. |
| [report-contract.md](report-contract.md) | 집계·경계 개정·비교·삭제의 상세 산술이다. |
| [validation-plan.md](validation-plan.md) | 정적 검사·가상 산술·실기기·효과 검증 기준이다. |

외부 출처는 R1·R2·R5~R11의 9개이다. R3·R4는 PRD의 리스크 및 검증 계획에 URL·주장·대응을 보존한다. R10은 건강 맥락이며 R11은 과거 문제 규모의 2차 자료이다.

기능 ID F1~F10·F12를 유지하고 YAML에서는 입력·결과·완료 조건을 요약한다. 세부 계약은 PRD 8.2절을 따른다. 세 인터뷰의 상대 날짜와 발화를 원문대로 보존하며 독립 참여자 수를 추가하지 않는다.

테스트 예외는 S3 첫 리포트 유효 3초, S5·S6 측면 데이터·연결 장애 주입이다. NODE_ENV=test와 명시적 활성화를 함께 요구하며 운영에서 UI·주입 핸들러를 제공하지 않는다. 실제 기기 시험과 운영 1800초 경계는 별도로 검증한다.

이전 격리·구현·원격 반영 이력은 [archive/planning-history](../archive/planning-history/README.md)와 Git 이력을 따른다.
