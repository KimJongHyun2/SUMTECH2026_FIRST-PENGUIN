# Starter Kit 제출 규칙 대조

대조 대상은 기존에 확보한 `loopthon-starter.zip`의 `START_HERE.md`, `CHECKLIST.md`, `problem.example.yaml`, `scenarios.example.yaml`, `steps/02-problem.md`, `steps/03-delivery.md`이다. ZIP SHA-256은 `304478e454c1fc7d0d68a01b90892af63715e4fcf0bbf3dc4cf08fb7f4c7c61e`이다.

| 근거 | 제출 규칙 | 문서 적용 |
|---|---|---|
| problem.example.yaml | statement·canvas·personas·experiences·sources·five_whys·solution_paths·insight·features 키이다. | 최상위 키를 추가하지 않는다. why_ours는 canvas.alternatives 안에 둔다. |
| steps/02-problem.md 2-A | 실제 장면·행동·손실·출처를 연결한다. | 팀 제공 인터뷰 E1~E3와 외부 근거를 구분한다. |
| steps/02-problem.md 2-B | 팀이 낸 해법과 선택 이유를 기록한다. | 팀의 five_whys와 why_ours를 원문에 맞춰 반영한다. |
| steps/02-problem.md 2-C | 기능마다 입력·결과·관찰 가능한 완료 조건이 있다. | YAML은 핵심 기능, PRD는 상세 계약을 담당한다. |
| scenarios.example.yaml | platform은 desktop/mobile/both이며 platformReason을 둔다. | 노트북 학습과 PC 기록 확인에 따라 desktop이다. |
| scenarios.example.yaml | 흐름 3~8개·고유 S번호·제목 1~120자·단계 1~12개·expected 1~500자이다. | S1~S8이며 로그인 없는 account는 생략한다. |
| scenarios.example.yaml | 선택한 해법마다 끝까지 수행하는 흐름이 있다. | 기본 S2·S3, 딥 S5·S6을 유지한다. |
| steps/03-delivery.md 3-4 | 같은 DB에서 순차 실행하되 앞 흐름 데이터에 기대지 않는다. | 별도 context의 첫 화면에서 기준·세션·기록을 자체 생성한다. |
| steps/03-delivery.md 3-4 | 흐름당 같은 ID의 spec 하나·test 하나, UI 단계·최종 상태 단언, 가짜 응답·상태·skip 금지이다. | 테스트 입력과 최종 상태 직접 생성을 구분한다. |
| steps/03-delivery.md 3-4 | 입력·의존성의 저장소 포함, 로컬 흐름당 1분 이내, 주최측 화면 크기, 팀 globalSetup·storageState·retries에 의존하지 않는다. | S3 가속·S5/S6 입력 주입의 수용 범위를 제출 전 확인한다. |
| START_HERE.md·steps/03-delivery.md | Docker·헬스 응답·공개 HTTPS·실제 실행·기본 브랜치 반영이다. | 문서 검사와 구현·배포·원격 반영을 별도로 검증한다. |

five_whys.whys는 반드시 다섯 개일 필요는 없으며 팀이 제공한 인과 설명을 기록한다. 현재 팀은 5단계를 제공했다. 키트에서 독립 인터뷰 참여자 3~5명이라는 고정 인원 규칙은 확인되지 않으며 세 경험을 세 명의 표본으로 해석하지 않는다.

공식 P0/P1 등급표와 30점 세부 배점은 키트에 없다. 예시의 P1은 페르소나 ID이다. 현재 문서의 P0/P1은 내부 검증 우선순위이다.
