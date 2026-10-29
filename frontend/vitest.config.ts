import { defineConfig } from "vitest/config";
export default defineConfig({
  define: { __EVAL_ENABLED__: "false" },
  test: { include: ["tests/unit/**/*.test.ts"] },
});
