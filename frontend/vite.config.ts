import { copyFileSync, createReadStream, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { attachRelay } from "../posture-web/shared/relay.js";

// 평가 전용 빌드 (docs/prd.md 7절). EVAL_ENABLED=true로 빌드할 때만 녹화 입력을 /eval/에 넣는다.
// 일반 빌드(배포 사이트)에는 평가 입력·테스트 도구가 들어가지 않는다.
const EVAL_ENABLED = process.env.EVAL_ENABLED === "true";
const EVAL_FILES = ["test-pose.webm", "test-pose.manifest.json"];
const FIXTURES = resolve(import.meta.dirname, "../e2e/fixtures");

function evalInput(): Plugin {
  let outDir = "";
  return {
    name: "eval-input",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      if (!EVAL_ENABLED) return;
      server.middlewares.use("/eval", (req, res, next) => {
        const name = (req.url ?? "").split("?")[0].slice(1);
        if (!EVAL_FILES.includes(name)) return next();
        res.setHeader(
          "Content-Type",
          name.endsWith(".json") ? "application/json" : "video/webm",
        );
        createReadStream(resolve(FIXTURES, name)).pipe(res);
      });
    },
    closeBundle() {
      if (!EVAL_ENABLED) return;
      // 평가 빌드인데 자료가 없으면 빌드를 실패시킨다. 빈 경로를 성공처럼 배포하지 않는다.
      const missing = EVAL_FILES.filter(
        (name) => !existsSync(resolve(FIXTURES, name)),
      );
      if (missing.length)
        throw new Error(
          `EVAL_ENABLED=true 빌드에 평가 자료가 없어요: e2e/fixtures/${missing.join(", ")}`,
        );
      const out = resolve(outDir, "eval");
      mkdirSync(out, { recursive: true });
      for (const name of EVAL_FILES)
        copyFileSync(resolve(FIXTURES, name), resolve(out, name));
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === "https" ? [basicSsl()] : []),
    evalInput(),
    {
      // 개발 서버에서도 운영 서버와 같은 백엔드 중계를 붙인다.
      name: "deep-relay",
      configureServer(server) {
        if (server.httpServer) attachRelay(server.httpServer);
      },
    },
  ],
  define: { __EVAL_ENABLED__: JSON.stringify(EVAL_ENABLED) },
  server: { host: true, port: 5173, strictPort: true },
}));
