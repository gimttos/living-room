// 전역 설정 저장 (settings.json @ AppData). 현재는 마지막 오버레이 모드 기억용.
import { readTextFile, writeTextFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";
import { SETTINGS_PATH } from "./config.js";

const APP = { baseDir: BaseDirectory.AppData };
const DEFAULTS = { overlayMode: false, editMode: false, sidebarCollapsed: false };

let cache = { ...DEFAULTS };

export async function loadSettings() {
  try {
    if (await exists(SETTINGS_PATH, APP)) {
      const text = await readTextFile(SETTINGS_PATH, APP);
      cache = { ...DEFAULTS, ...JSON.parse(text) };
    }
  } catch (e) {
    console.warn("설정 로드 실패, 기본값 사용:", e);
    cache = { ...DEFAULTS };
  }
  return { ...cache };
}

export function getSettings() {
  return { ...cache };
}

export async function saveSettings(patch) {
  cache = { ...cache, ...patch };
  try {
    await writeTextFile(SETTINGS_PATH, JSON.stringify(cache, null, 2), APP);
  } catch (e) {
    console.warn("설정 저장 실패:", e);
  }
}
