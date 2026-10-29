# 주최 측 실행·CI가 docker-compose.yml로 빌드하는 이미지. 의존성 설치·빌드는 여기서 끝내고 시작 명령은 서버 실행만 한다.
FROM node:24-alpine AS build
WORKDIR /app
COPY posture-web/package.json posture-web/package-lock.json ./
RUN npm ci
COPY posture-web/ ./
# 평가 전용 빌드(docs/prd.md 7절): 녹화 입력 영상·구간 명세를 dist/eval에 넣고 테스트 도구를 켤 수 있게 한다.
# 배포 사이트(Vercel) 빌드에는 넣지 않는다.
ARG EVAL_ENABLED=false
ENV EVAL_ENABLED=$EVAL_ENABLED
# 산출물의 health.json도 실제 빌드 버전을 쓰도록 빌드 단계에도 넘긴다(실행 중 /__health는 server.js가 응답).
ARG RELEASE_ID=dev
ENV RELEASE_ID=$RELEASE_ID
COPY e2e/fixtures/test-pose.webm e2e/fixtures/test-pose.manifest.json /e2e/fixtures/
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY posture-web/package.json posture-web/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY posture-web/server.js ./
COPY posture-web/shared ./shared
COPY --from=build /app/dist ./dist
ARG RELEASE_ID=dev
ENV RELEASE_ID=$RELEASE_ID
EXPOSE 3000
CMD ["node", "server.js"]
