# 초기 자세 실험 도구 보관

기존 posture-web의 메인 서비스와 무관한 실험 화면·전용 스크립트·분석 자료를 이곳으로 이동했다. 현재 제품 기능이나 주최측 제출 시나리오가 아니다. 원래 실험 안내는 [README.source.md](README.source.md)에 그대로 보존한다. 원문이 설명하는 과거 서비스 index.html은 현재 posture-web/에 남아 있다.

| 보관 항목 | 내용 |
|---|---|
| front.html·side.html·angle.html·lab.html | 정면·측면·사진 각도 측정·실험 링크 화면이다. |
| src/front.js·side.js·angle.js·phoneQr.js·recorder.js·recorder.test.js·style.css | 실험 전용 동작·기록·스타일·기존 테스트이다. |
| analysis/ | 분석 스크립트와 합성 데이터 테스트이다. |
| docs/ | 과거 기술검증 계획·판정기준 근거이다. |
| src/signals.js·vision.js | 메인 서비스에서도 사용하므로 원본은 유지하고 실험 당시 바이트가 같은 스냅샷을 복사했다. |
| package.json·package-lock.json·.gitignore·vite.config.js | 실험을 따로 다룰 때의 실행 설정이다. Vite의 메인 서비스 진입점만 제외했다. |

이번 정리 시 실제 data/·results/·사진/영상 데이터 폴더는 발견되지 않았다. 존재하지 않는 데이터를 새로 만들거나 실험 수행 이력을 추가하지 않았다. 이후 실험 자료는 현재 기획 문서와 구분해 이 보관소에서 관리한다.

이 도구들의 재실행·감지 성능·개인정보 처리·브라우저 동작은 이번 기획 정리에서 검증하지 않았다. 원본의 실험 시간값·라벨·잠정 임계값은 현재 정책이 아니다.
