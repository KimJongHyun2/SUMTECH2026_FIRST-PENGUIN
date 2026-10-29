# E2E 입력 자료

실제 흐름에서 쓰는 자료를 이 폴더에 포함한다. 주최 측 실행은 저장소만으로 재현되어야 한다. 파일 하나는 10MB 이하이며 빈 파일·가짜 결과를 넣지 않는다. 영상은 촬영 동의를 받고 불필요한 개인정보를 포함하지 않는다.

## 현재 평가 설계의 자료

`front-good.webm`·`front-turtle.webm`·`front-away.webm`은 `test-pose.webm`을 만든 원본 촬영 영상이다. `front-good.webm`에는 6~7.5초에 손으로 안경·머리를 만지는 장면이 있어 반복 재생하면 주기적으로 가려진다. 흐름 spec은 평가 빌드(`/?mode=eval`)에서 아래 `test-pose.webm`을 쓴다. 처리 규칙은 [PRD 7절](../../docs/prd.md#7-평가-재현-설계), 준비 상태는 [진행 기록](../../progress.md)을 따른다. 공식 키트가 특정 영상 파일명이나 시험 우회를 허용했다는 뜻은 아니다.

| 파일 | 내용 |
|---|---|
| `test-pose.webm` | 같은 사람·배치의 실제 영상 3개를 이어 붙인 54.5초 VP8 영상이다. good 0–16초·turtle 16–36초·away 36–51초·brief_touch 51–54.5초(참고용 짧은 가림)이다. 손으로 얼굴을 만지는 장면은 good에서 뺐다. Playwright 기본 Chromium이 H.264를 재생하지 못할 수 있어 MP4 대신 WebM을 쓴다. |
| `test-pose.manifest.json` | SHA-256·크기·해상도·프레임률·구간 시작/끝·사람의 라벨·모델·실제 추론 결과와 구간별 verified이다. 앱은 해시와 필수 구간(good·turtle·away)의 verified를 확인한 뒤에만 영상을 쓴다. |

구간 명세는 손으로 쓰지 않고 `e2e/tools/verify-test-pose.mjs`로 만든다. `posture-web`에서 `EVAL_ENABLED=true npm run dev`를 띄운 뒤 `e2e`에서 `node tools/verify-test-pose.mjs`를 실행하면, 개발 서버의 확인 페이지가 앱과 같은 모델·판정 코드로 각 구간을 추론하고 기준을 넘은 구간만 verified로 남긴다. 영상을 바꾸면 이 명령을 다시 실행한다.

영상 시각을 앱의 연속 측정 시각에 매핑하고 시크·루프 이동을 유효 시간에 더하지 않는다. 영상 라벨과 추론 결과가 일치하는지 먼저 확인한다. E2E 오차는 처리 주기·평활화·추론 지연을 실측해 정한다. 현재 영상 한 프레임 이내 정확도를 보장하지 않는다.

## 촬영 도구

저장소 루트에서 실행한다.

```sh
python3 -m http.server 8123 --bind 127.0.0.1 -d e2e/tools
```

브라우저에서 http://localhost:8123/record.html 을 연다. 도구는 640×480 WebM을 저장한다. 기존 촬영 안내의 기준 자세 30초·이탈 20초·자리 비움 15초는 촬영 길이이며 제품의 시간 임계값이 아니다. 새로 찍은 WebM으로 평가 영상을 바꾸려면 구간을 이어 붙인 뒤 위 확인 도구로 구간 명세를 다시 만들어야 한다.

파일 업로드를 사용하는 spec은 `__dirname` 기준으로 fixtures 경로를 만든다. e2e는 독립 패키지이며 package.json에 type: module을 넣지 않는다. 제출 전 `node tools/check-planning.mjs --submission`으로 존재를 확인하고 실제 내용·실행은 별도 검증한다.
