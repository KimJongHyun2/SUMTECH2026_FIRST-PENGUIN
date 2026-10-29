# 패스트거북이 — 초기 서비스 구현

현재 서비스 기획은 [최신 PRD](../docs/prd.md)와 [공통 정책](../docs/planning-policy.yaml)을 따른다. 등록 5초·최초 경고 10초·복귀 3초·재경고 60초·자동 리포트 유효 30분, 자리 비움/인식 불가 시 판정 보류·연속 타이머 초기화, 로그인 없는 같은 PC 브라우저의 로컬 저장이 기획 기준이다.

이 디렉터리의 코드는 이전 병행 초기 구현이다. 위 기획 전체를 구현·검증했다는 뜻이 아니다. 화면의 서비스명·소개·상태·알림·리포트 문구는 예방 목적과 개인 기준 대비 변화 표현으로 수정했다. 감지·경고 동작·저장 집계는 후속 구현에서 대조해야 한다. 초기 앱의 기본 전방 이탈 경고는 30초로 기획의 최초 경고 10초와 다르다. 과거 대조 기록은 [아카이브](../archive/planning-history/implementation-status.md)에 있다.

## 파일 구분

- index.html과 src/app.js·app.css·posture.js·report.js·signals.js·vision.js 및 관련 테스트는 메인 서비스 파일이다.
- front.html·side.html·angle.html·lab.html과 실험 전용 스크립트·분석·기술검증 문서는 [archive/posture-experiments/](../archive/posture-experiments/README.md)로 이동했다.
- 메인 Vite 빌드 진입점과 화면 링크에서 격리한 실험 도구 참조를 제거했다. 감지·경고·저장 알고리즘은 변경하지 않았다.

## 기존 개발 명령

```sh
npm ci
npm run dev
npm run build
npm test
```

이번 작업은 기획 정리와 파일 격리이다. 위 명령으로 앱·카메라·실제 사용자 흐름을 검증한 것으로 해석하지 않는다. 실험 도구의 예전 실행 안내는 아카이브의 README.source.md를 참고한다.
