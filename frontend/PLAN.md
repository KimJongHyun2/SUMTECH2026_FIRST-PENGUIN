# 프론트엔드 계획

## 범위와 작업 원칙
- 브랜치: main(7c8b636)에서 새로 만든 frontend. 커밋·푸시는 요청 전 보류.
- 제출 웹사이트의 화면은 frontend/가 맡고, 판정·저장·리포트 로직은 posture-web/src/core를 그대로 가져다 쓴다. core는 고치지 않는다.
- React + TypeScript + Vite + Tailwind CSS. JSX 컴포넌트를 사용하며 HTML 문자열/innerHTML 방식은 사용하지 않는다.
- Figma turtle(Chok7h7eWT4ESnUQs5tOkb)의 확인된 화면·원본 SVG를 사용한다.
- 기준 문서는 main의 docs/prd.md, docs/problem.yaml(features), docs/scenarios.yaml이다. 정책값은 posture-web/src/core/policy.js 하나를 따른다.

## 설계
- src/app: 앱 진입점, React Router, 공통 레이아웃, SessionProvider
- src/components/ui, src/components/layout: 접근 가능한 공통 UI, Header, PageHeading
- src/features/camera: CameraService, CameraPreview. 가장 가까운 사람 선택, core의 입력 품질 판정
- src/features/session: SessionController. 세션 상태·경고·기준 등록·딥 모드 복구·휴대폰 종료 확인
- src/features/history: core store.js(IndexedDB) 연결, core compare.js 비교
- src/features/connection, server/relay.mjs: PC 승인 기반 휴대폰 연결, QR 120초·1회 사용
- src/pages: Home, Setup, Watch, Settings, Report, History, Connect, Phone, NotFound
- src/lib/posture.ts, src/lib/policy.ts: core를 읽기 전용으로 참조하는 어댑터

## 구현 순서
1. 바뀐 core와 다시 연결 (기준 수집기·판정 함수·2초 가림 유예·배치 확인)
2. 저장을 core의 IndexedDB 저장소로 교체, 저장 중/완료/실패 표시
3. 첫 화면 → 카메라 설정으로 바로 이동 (모드 선택 화면 제거)
4. 빠진 문구·규칙: 리포트가 준비됐어요, 판정 보류 표시, 카메라를 쓸 수 없어요, 기본 모드로 계속, 휴대폰 종료 확인, QR 120초, 같은 설정 재적용 시 새 버전 없음
5. 평가 모드: EVAL_ENABLED 빌드 + /?mode=eval, '테스트 도구'와 [테스트용] 버튼(녹화 입력 재생, 리포트 3초 가속, 측면 데이터 주입·끊기)
6. Dockerfile·docker-compose·E2E 실행 대상을 frontend/로 전환, scenarios S1~S8 spec 작성
7. 실제 카메라·휴대폰으로 확인

## 체크리스트
- [x] 1. core 연결 복구 (민감도 배율·설정 기본값까지 core를 따름)
- [x] 2. IndexedDB 저장 교체
- [x] 3. 모드 선택 화면 제거
- [x] 4. 빠진 문구·규칙
- [x] 딥 모드 연결을 백엔드 중계(posture-web/shared/relay.js·deep-protocol.js) 계약으로 교체, frontend 전용 중계 삭제
- [x] 5. 평가 모드 (posture-web eval.js 재사용, 측면 주입은 실제 중계에 접속하는 모의 휴대폰. 주최 측 허용 여부 미확인)
- [ ] 6. Docker·E2E 전환 (팀과 실행 대상 합의 필요)
- [ ] 7. 실기기 확인

## 팀 결정이 필요한 것
- 2초 이하 가림 유예(core recognitionGraceSeconds): 문서는 즉시 초기화, 코드는 유지. frontend는 core를 따른다.
- 민감도 배율(낮음 1.5·보통 1·높음 0.7)은 core의 파일럿 값이다. 경계는 실측 후 확정한다.
- 기록 비교 조건: core는 모드·기준·설정만 본다. 문서의 지표·촬영 배치 조건은 아직 없다.
- 다른 탭·IDE에서 작업할 때 경고를 알아차릴 방법(브라우저 알림 등)은 features에 없다.
- 백엔드 계약상 휴대폰 종료 요청은 연결을 끝낸다. 딥 모드에서 일시 정지하면 재개 전에 휴대폰을 다시 연결해야 한다.

## 문서 담당자에게 전달할 화면 차이 (scenarios.yaml)
- 카메라 설정 화면은 '카메라 배치와 앉은 자세를 확인했어요' 체크 뒤에 '기준 자세 등록'이 켜진다. 흐름 단계에는 이 체크가 없다.
- 딥 모드는 '연결 승인' 뒤 '측면 배치 안내' → '확인했어요'를 거쳐 카메라 설정 화면으로 간다. 흐름은 승인 뒤 바로 'PC에서 카메라 켜기'다.

## 미확정/검증 구분
- 시안의 사진·안내 일러스트는 원본부터 빈 자리표시자다. 실제 사진이 완성된 것으로 가장하지 않는다.
- 연결 감시·장애 판정·휴대폰 자체 중단 시간, 측면 동기화 오차, 감지 경계값은 파일럿 값이며 실기기 검증이 필요하다.
- 실제 카메라 정확도와 두 물리 기기 연결 검증은 녹화·모의 입력 자동 테스트로 대체하지 않는다.

## 검증 결과
- TypeScript 검사, 일반 빌드(/eval 없음)와 EVAL_ENABLED=true 빌드(/eval 포함) 통과.
- Vitest 7개 통과: 2초 유예와 긴 끊김 재시작, 10초 경고, 설정 검증, 같은 값 재적용·예전 설정 기본값, IndexedDB 새로고침 복원·삭제, 기록 비교, 백엔드 중계를 통한 QR 발급·사용된 QR 거부·승인·측면 전달·종료 확인.
- Chrome UI 테스트 4개 통과: 합성 입력 2개, 평가 모드 2개(녹화 영상 실제 추론으로 이탈·경고·복귀·종료 리포트 저장, 모의 휴대폰의 승인 연결·양쪽 재생·종료 확인).
- 빌드 서버의 /__health 200, /eval 자료 제공, /relay WebSocket 연결 확인.
- 실제 카메라 인식, 물리 휴대폰 연동, 주최 측 실행은 미검증.
