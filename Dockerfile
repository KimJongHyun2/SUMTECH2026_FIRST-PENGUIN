# 주최 측 실행·CI가 docker-compose.yml로 빌드하는 이미지. 의존성 설치·빌드는 여기서 끝내고 시작 명령은 서버 실행만 한다.
FROM node:24-alpine AS build
WORKDIR /app
COPY posture-web/package.json posture-web/package-lock.json ./
RUN npm ci
COPY posture-web/ ./
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
