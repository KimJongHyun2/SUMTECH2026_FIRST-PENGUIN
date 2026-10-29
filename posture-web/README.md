# 패스트거북이 — 서비스 구현

공식 기능 명세는 [problem.yaml](../docs/problem.yaml), 세부 구현 규칙은 [PRD](../docs/prd.md), 실행·환경변수·루프톤 제출 요건은 [루트 README](../README.md)를 따른다. 기획 전체의 구현·검증 완료를 뜻하지 않으며 차이는 [진행 기록](../progress.md)에 둔다.

## 파일 구조

- `index.html`, `src/app/main.js`, `src/app/views/`는 첫 화면·등록·감지·리포트·기록 UI이다.
- `src/app/camera.js`, `src/vision.js`, `src/signals.js`는 카메라 입력·모델 추론·특징 계산이다.
- `src/core/`는 시간·판정·세션·집계·로컬 저장·비교와 단위 테스트이다.
- `server.js`는 빌드 산출물·health·404를 제공한다. 모델·WASM은 실행 중 외부 다운로드에 기대지 않도록 자체 제공한다.
- front·side·angle·lab 실험은 [archive/posture-experiments](../archive/posture-experiments/README.md)에 있다.

## 개발 명령

이 디렉터리에서 실행한다.

```sh
npm ci
npm run dev
npm test
npm run build
npm start
```

개발 서버는 Vite가 출력하는 HTTPS 주소를 사용한다. 빌드 후 Node 서버는 기본 3000 포트에서 실행한다. 과거 구현 대조 기록은 [아카이브](../archive/planning-history/implementation-status.md)의 당시 관찰이다.
