# FAST TURTLE 프론트엔드

React + TypeScript + Vite + Tailwind CSS. 기존 `posture-web/`는 수정하지 않는다.

```powershell
cd frontend
npm ci
npm run dev
```

개발 주소는 **http://localhost:5173**. 기본 실행은 인증서가 필요 없는 HTTP이며 localhost에서 카메라를 사용할 수 있다. 포트가 사용 중이면 기존 서버를 종료한 뒤 실행한다.

휴대폰 연결 개발은 `npm run dev:https`를 사용하고, 휴대폰에서 접근 가능한 HTTPS 주소로 QR을 생성한다. 개발용 자체 서명 인증서는 기기에서 신뢰되지 않을 수 있으므로 신뢰된 인증서/HTTPS 환경이 필요하다. 일반 정적 호스팅은 `/relay` WebSocket을 제공하지 않으며 딥 모드에는 Node 서버 또는 별도 중계가 필요하다.

```powershell
npm run build
npm start
```

운영 Node 서버 기본 주소는 http://localhost:3000. 배포 시 HTTPS 역방향 프록시를 사용한다.

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
- `npm run test:ui`: Playwright UI 테스트 (Chrome 사용)
- `npm run build`: TypeScript 검사와 프로덕션 빌드

합성 입력 테스트는 실제 자세 감지 정확도를 보장하지 않는다. 딥 모드의 안정성·장애 감시값 및 측면 임계값은 파일럿 구현이며 실제 다중 기기로 검증해야 한다. 원본 사진·일러스트가 없는 Figma 슬롯은 준비 영역으로 표시한다.
