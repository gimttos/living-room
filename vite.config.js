import { defineConfig } from "vite";

// Tauri + Vite (vanilla JS) 표준 설정
export default defineConfig({
  // Tauri CLI가 에러 메시지를 가리지 않도록
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // Rust 빌드 산출물 변동으로 Vite 워처가 죽지 않도록 src-tauri 감시 제외
    watch: { ignored: ["**/src-tauri/**"] },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
  },
});
