# 구현 계획 (plan) — 내 카드 찾기

> 무엇을 만드는지는 [problem.yaml](problem.yaml), 어떻게 만드는지는 [spec.md](spec.md)에 있어요. 이 문서는 **순서·검증·현재 상태**만 다뤄요.
> 체크 표시는 실제로 확인한 것만 해요.

## 단계

### 1. 뼈대 (Next.js + TS + CSS Modules)
- [x] package.json, tsconfig(strict), next.config(standalone 출력)
- [x] lib/types·constants·format·recommend (순수 함수)
- [x] 화면 6개 + not-found + /__health
- 검증: `npm run typecheck`, `npm run build` 통과

### 2. 기능 F1~F8
- [x] F2 입력·검사, F4 추천, F5 상세, F6 비교, F7 목록, F8 지금 카드 비교
- [x] F3 규칙 기반 추출 + AI Gateway 호출 코드
- [ ] F3 실제 AI 연결 확인 (학생이 AI_GATEWAY_API_KEY 설정 후 작은 요청 1번)
- 검증: 브라우저에서 S1~S8 직접 실행

### 3. 카드 데이터 (F1) — **가장 급함**
- [ ] `data/cards.json`을 실제 카드 20장 이상으로 교체 (지금은 샘플 10장, 출처 없음 → F1 완료 조건 미충족)
- [ ] 대학생 대상·군인 대상 카드 각 1장 이상, 모든 카드에 sourceUrl·checkedAt
- [ ] 데이터 검사 스크립트(`npm run check:data`)로 F1 완료 조건 자동 확인

### 4. docker·배포·CI
- [ ] Dockerfile(빌드는 Dockerfile 안에서, 시작 명령은 서버 실행만), docker-compose.yml(app만 3000 포트)
- [ ] 빈 상태에서 `docker compose up --build` 2분 안에 기동
- [ ] 공개 HTTPS 배포, RELEASE_ID 주입, 대시보드에 배포 URL 저장
- [ ] CI(workflows/scenarios.yml) 성공 후 자동 배포

### 5. E2E
- [ ] e2e/scenarios/S1~S8.spec.ts (scenarios.yaml steps 그대로, 휴대폰 화면)
- [ ] `docker compose up -d --build` 후 `npx playwright test` 전부 통과

### 6. 기획 근거 채우기 (팀)
- [ ] impact.measurable, experiences(E1), insight.claim·evidence — [intent.md](intent.md) "아직 채워야 하는 근거" 참고

## 결정 기록

| 날짜 | 결정 | 이유 |
|---|---|---|
| 10-29 | 메인은 새 카드 추천 | 팀 결정 |
| 10-29 | F8 지금 카드와 비교 추가 | 멘토 피드백: 뱅크샐러드와 차이, 추천에서 하나 더 |
| 10-29 | Next.js + TS + CSS Modules | AI 키 서버 처리·/__health·404를 앱 하나로, 프론트 개발자가 다듬기 쉬움 |
| 10-29 | 카드 데이터는 DB 없이 JSON | 읽기 전용 데이터라 DB가 필요 없음 |
