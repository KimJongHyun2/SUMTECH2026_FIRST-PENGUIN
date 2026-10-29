import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { attachRelay } from "./server/relay.mjs";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === "https" ? [basicSsl()] : []),
    {
      name: "approved-camera-relay",
      configureServer(server) {
        if (server.httpServer) attachRelay(server.httpServer);
      },
    },
  ],
  server: { host: true, port: 5173, strictPort: true },
}));
