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
- [x] 1. core 연결 복구
- [x] 2. IndexedDB 저장 교체
- [x] 3. 모드 선택 화면 제거
- [x] 4. 빠진 문구·규칙
- [ ] 5. 평가 모드 (주최 측 허용 여부 미확인)
- [ ] 6. Docker·E2E 전환 (팀과 실행 대상 합의 필요)
- [ ] 7. 실기기 확인

## 팀 결정이 필요한 것
- 2초 이하 가림 유예(core recognitionGraceSeconds): 문서는 즉시 초기화, 코드는 유지. frontend는 core를 따른다.
- 민감도: core가 민감도 경계를 없앴다. 설정 화면의 민감도는 저장만 되고 판정에 쓰이지 않는다.
- 기록 비교 조건: core는 모드·기준·설정만 본다. 문서의 지표·촬영 배치 조건은 아직 없다.
- 다른 탭·IDE에서 작업할 때 경고를 알아차릴 방법(브라우저 알림 등)은 features에 없다.

## 미확정/검증 구분
- 시안의 사진·안내 일러스트는 원본부터 빈 자리표시자다. 실제 사진이 완성된 것으로 가장하지 않는다.
- 연결 감시·장애 판정·휴대폰 자체 중단 시간, 감지 경계값은 파일럿 값이며 실기기 검증이 필요하다.
- 실제 카메라 정확도와 두 물리 기기 연결 검증은 합성 입력 자동 테스트로 대체하지 않는다.

## 검증 결과 (1~4단계)
- TypeScript 검사·프로덕션 빌드 통과.
- Vitest 7개 통과: 2초 유예와 긴 끊김 재시작, 10초 경고, 설정 검증, 같은 값 재적용, IndexedDB 새로고침 복원·삭제, 기록 비교, QR 120초 만료·사용된 QR 거부.
- Chrome UI 테스트 2개 통과(합성 카메라 입력). 빌드 서버의 /__health 200, /start 404 확인.
- 실제 카메라 인식과 물리 휴대폰 연동, 휴대폰 종료 확인 흐름은 미검증.
