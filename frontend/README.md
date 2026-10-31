# FAST TURTLE 프론트엔드

React + TypeScript + Vite + Tailwind CSS로 만든 화면이다. 공통 판정·중계 코드는 `posture-web/`에서 참조한다. Node.js 24를 기준으로 하며 모델 준비를 위해 저장소 전체 체크아웃이 필요하다.

```powershell
cd frontend
npm ci
npm run dev
```

개발 주소는 **http://localhost:5173**이다. 기본 실행은 인증서가 필요 없는 HTTP이며 localhost에서 카메라를 사용할 수 있다. 포트가 사용 중이면 기존 서버를 종료하거나 `npm run dev -- --port 5181`처럼 다른 포트를 지정한다.

휴대폰 연결 개발은 `npm run dev:https`를 사용하고, 휴대폰에서 접근 가능한 HTTPS 주소로 QR을 생성한다. 개발용 자체 서명 인증서는 기기에서 신뢰되지 않을 수 있으므로 신뢰된 인증서/HTTPS 환경이 필요하다. 일반 정적 호스팅은 `/relay` WebSocket을 제공하지 않으며 딥 모드에는 Node 서버 또는 별도 중계가 필요하다.

```powershell
npm run build
npm start
```

운영 Node 서버 기본 주소는 http://localhost:3000이다. 배포 시 HTTPS 역방향 프록시를 사용한다. 이 안내는 `frontend`만 실행하며 루트 Docker·기존 배포 경로를 변경하지 않는다.

## 코드 위치

- `src/app/`: 라우팅, 레이아웃, 세션 Provider
- `src/components/`: 재사용 JSX UI와 레이아웃
- `src/pages/`: 라우트별 React 페이지
- `src/features/camera/`: MediaPipe 입력과 카메라 수명주기
- `src/features/session/`: UI와 분리된 세션 상태·명령, React 구독
- `src/features/history/`: 로컬 저장·삭제·비교
- `src/features/connection/`, `server/`: 승인 기반 기기 연결
- `src/lib/posture.ts`: 기존 순수 판정 코드의 읽기 전용 어댑터
- `src/styles/globals.css`: Tailwind 테마·전역 스타일

모델과 WASM은 실행/빌드 전에 `scripts/prepare-assets.mjs`가 준비한다. 모델은 저장소의 `posture-web/public/models/`를 읽기만 하므로 저장소 전체 체크아웃이 필요하다.

## 검증

- `npm test`: 설정·저장·장치/세션 연동 테스트
- `npm run test:ui`: Playwright UI 테스트이다. 로컬에서는 설치된 Chrome을 사용하며 CI에서는 Playwright Chromium을 사용한다.
- `npm run build`: TypeScript 검사와 프로덕션 빌드

CI는 `frontend`의 단위 테스트·타입 검사·빌드와 `tests/ui/app.spec.ts`의 화면 회귀 검사를 실행한다. 녹화 입력 추론을 사용하는 `eval.spec.ts`는 별도 로컬 검사이다. CI와 같은 화면 검사는 다음 명령으로 실행한다.

```sh
cd frontend
npx playwright install chromium
CI=true UI_PORT=5181 npm run test:ui -- tests/ui/app.spec.ts --forbid-only
```

위 명령은 저장소 루트 기준이다. Windows PowerShell에서는 마지막 줄 대신 `$env:CI="true"; $env:UI_PORT="5181"; npm run test:ui -- tests/ui/app.spec.ts --forbid-only`를 사용한다. UI 검사는 전용 서버를 띄우므로 지정 포트가 비어 있어야 한다.

합성 입력 테스트는 실제 자세 감지 정확도를 보장하지 않는다. 딥 모드의 안정성·장애 감시값 및 측면 임계값은 파일럿 구현이며 실제 다중 기기로 검증해야 한다. 원본 사진·일러스트가 없는 Figma 슬롯은 준비 영역으로 표시한다.

## 딥 모드 시연·장애 확인

1. `npm run dev:https`를 실행하고 PC와 휴대폰에서 접근 가능한 HTTPS 주소를 사용한다.
2. PC에서 '딥 모드 사용하기'를 선택하고 QR을 휴대폰으로 연다. 휴대폰에서 연결 요청 후 PC에서 승인한다.
3. 휴대폰 카메라를 켜고 측면에 고정한다. PC에서 배치 안내를 확인한 뒤 카메라를 켜고 기준 자세를 등록한다.
4. 딥 모드 탐지를 시작하고 PC에 측면 영상이 보이는지 확인한다. 원본 영상은 저장하지 않는다.
5. 측면 영상 연결이 실패하면 네트워크를 확인하고 PC의 '휴대폰 다시 연결'로 새 QR·승인을 거친다. 연결 시도 후 15초 안에 WebRTC가 연결되지 않아도 실패 안내를 표시한다. 영상 미리보기와 측면 각도 입력은 별개이며 판정은 각도 입력의 유효성을 따른다.
6. 휴대폰 네트워크를 끊어 판정 보류·재연결을 확인하고, 세션 종료 후 휴대폰 촬영 종료 확인과 리포트 저장을 확인한다.

공개 STUN을 사용하고 TURN은 제공하지 않아 일부 네트워크에서는 영상 연결이 실패할 수 있다. 다중 기기 시험이 어려운 경우 기본 모드로 시연한다. 모의 입력·녹화 입력 결과와 실제 기기 검증 결과는 구분해 기록한다.
