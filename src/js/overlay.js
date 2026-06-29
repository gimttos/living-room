// 오버레이 상태 머신: windowed ⇄ overlay-display ⇄ overlay-edit.
// 한 창을 런타임에 데코/투명/클릭통과/크기로 토글한다.
import {
  getCurrentWindow,
  primaryMonitor,
  currentMonitor,
  PhysicalSize,
  PhysicalPosition,
} from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { setBackgroundVisible, selectById } from "./canvas.js";
import { saveSettings } from "./settings.js";

const win = getCurrentWindow();
const body = document.body;

let mode = "windowed"; // "windowed" | "display" | "edit"
let onModeChange = () => {};

export function getMode() {
  return mode;
}

async function coverPrimaryMonitor() {
  const m = (await primaryMonitor()) || (await currentMonitor());
  if (!m || !m.size) {
    console.warn("[overlay] 모니터 정보 없음 — 크기 변경 건너뜀");
    return;
  }
  const w = Number(m.size.width);
  const h = Number(m.size.height);
  if (!w || !h) {
    console.warn("[overlay] 모니터 크기 비정상:", w, h);
    return;
  }
  await win.setPosition(new PhysicalPosition(m.position.x, m.position.y));
  await win.setSize(new PhysicalSize(w, h));
}

// ---------- 전이 ----------
async function enterDisplay() {
  // 창은 항상 borderless(데코 없음). 오버레이는 투명/클릭통과/크기만 토글.
  body.classList.add("overlay-mode");
  body.classList.remove("edit-mode");
  setBackgroundVisible(false);
  selectById(null);

  await win.setSkipTaskbar(true);
  await win.setAlwaysOnTop(false);
  await win.unmaximize(); // 최대화 상태면 명시적 크기 적용이 안 되므로 해제
  await coverPrimaryMonitor();
  await win.setIgnoreCursorEvents(true); // 클릭 통과 (전시)

  setMode("display");
}

async function enterEdit() {
  if (mode === "windowed") {
    await enterDisplay();
  }
  body.classList.add("edit-mode");
  await win.setIgnoreCursorEvents(false); // 상호작용
  await win.setFocus();
  setMode("edit");
}

async function exitToWindowed() {
  await win.setIgnoreCursorEvents(false);
  body.classList.remove("overlay-mode", "edit-mode");
  setBackgroundVisible(true);

  await win.setSkipTaskbar(false);
  await win.maximize(); // 일반 창도 화면을 꽉 채움 (최대화)
  await win.setFocus();
  setMode("windowed");
}

function setMode(m) {
  mode = m;
  saveSettings({ overlayMode: m !== "windowed", editMode: m === "edit" });
  onModeChange(m);
}

// ---------- 공개 토글 ----------
export async function toggleOverlay() {
  if (mode === "windowed") await enterDisplay();
  else await exitToWindowed();
}

export async function toggleEdit() {
  if (mode === "windowed") await enterEdit();
  else if (mode === "display") await enterEdit();
  else await enterDisplay(); // edit → display
}

// ---------- 초기화 ----------
export async function initOverlay({ onModeChange: cb, restore } = {}) {
  onModeChange = cb || (() => {});

  // 트레이 메뉴 이벤트
  await listen("overlay:toggle", () => toggleOverlay());
  await listen("overlay:toggle-edit", () => toggleEdit());

  // 전역 단축키 (실패해도 앱은 동작). 페이지 새로고침 시 중복 등록 방지.
  try {
    await unregisterAll();
    await register("CommandOrControl+Alt+L", (e) => {
      if (e.state === "Pressed") toggleOverlay();
    });
    await register("CommandOrControl+Alt+E", (e) => {
      if (e.state === "Pressed") toggleEdit();
    });
  } catch (e) {
    console.warn("전역 단축키 등록 실패:", e);
  }

  // 마지막 모드 복원
  if (restore?.overlayMode) {
    await enterDisplay();
    if (restore.editMode) await enterEdit();
  } else {
    onModeChange("windowed");
  }
}
