import { defineConfig } from "vite";

// Tauri + Vite (vanilla JS) 표준 설정
export default defineConfig({
  // Tauri CLI가 에러 메시지를 가리지 않도록
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
  },
});
