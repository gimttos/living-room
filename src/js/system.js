// 시스템 연동: 부팅 시 자동 실행(autostart) + 자동 업데이트(updater).
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export async function initAutostartToggle(checkboxEl) {
  try {
    checkboxEl.checked = await isEnabled();
  } catch (e) {
    console.warn("autostart 상태 조회 실패:", e);
    checkboxEl.disabled = true;
    return;
  }
  checkboxEl.addEventListener("change", async () => {
    const want = checkboxEl.checked;
    try {
      if (want) await enable();
      else await disable();
    } catch (e) {
      console.error("autostart 토글 실패:", e);
      checkboxEl.checked = !want; // 롤백
    }
  });
}

// 업데이트 확인. silent=true면 새 버전 없을 때 조용히 넘어간다.
export async function checkForUpdates({ silent = true, onStatus } = {}) {
  try {
    const update = await check();
    if (update) {
      onStatus?.(`새 버전 ${update.version} 받는 중…`);
      await update.downloadAndInstall();
      onStatus?.("업데이트 완료, 재시작…");
      await relaunch();
    } else if (!silent) {
      onStatus?.("이미 최신 버전이에요");
    }
  } catch (e) {
    // dev 모드나 네트워크 없음 등은 조용히 무시
    console.warn("업데이트 확인 실패:", e);
    if (!silent) onStatus?.("업데이트 확인 실패");
  }
}
