// 리빙룸 v1 — 거실. 부트스트랩 + UI 배선.
import { room } from "./js/room.js";
import { ensureDirs, deleteImageFile } from "./js/storage.js";
import { DEFAULT_THEME, ROOMS, DEFAULT_ROOM } from "./js/config.js";
import {
  initCanvas,
  buildFromRoom,
  rebuild,
  setTheme,
  deleteSelected,
  bringForward,
  sendBackward,
  toggleLockSelected,
  setSelectedFilter,
  resetSelectedEdits,
  enterCropMode,
  applyCrop,
  cancelCrop,
  isCropping,
  objectCount,
} from "./js/canvas.js";
import { initImports } from "./js/imports.js";
import { initAutostartToggle, checkForUpdates } from "./js/system.js";
import { loadSettings, saveSettings } from "./js/settings.js";
import { initOverlay, toggleOverlay, toggleEdit } from "./js/overlay.js";
import { getCurrentWindow } from "@tauri-apps/api/window";

const $ = (id) => document.getElementById(id);

const el = {
  stage: $("stage"),
  canvasWrap: $("canvas-wrap"),
  emptyHint: $("empty-hint"),
  saveStatus: $("save-status"),
  themeSelect: $("theme-select"),
  fileInput: $("file-input"),
  btnAdd: $("btn-add"),
  btnEdit: $("btn-edit"),
  btnFront: $("btn-front"),
  btnBack: $("btn-back"),
  btnLock: $("btn-lock"),
  btnDelete: $("btn-delete"),
  editPanel: $("edit-panel"),
  editClose: $("edit-close"),
  fBrightness: $("f-brightness"),
  fSaturation: $("f-saturation"),
  fHue: $("f-hue"),
  fContrast: $("f-contrast"),
  btnCrop: $("btn-crop"),
  btnReset: $("btn-reset"),
  cropControls: $("crop-controls"),
  cropApply: $("crop-apply"),
  cropCancel: $("crop-cancel"),
  autostartToggle: $("autostart-toggle"),
  btnUpdate: $("btn-update"),
  btnOverlay: $("btn-overlay"),
  btnToDisplay: $("btn-to-display"),
  btnExitOverlay: $("btn-exit-overlay"),
  btnMin: $("btn-min"),
  btnClose: $("btn-close"),
  sidebar: $("sidebar"),
  sidebarToggle: $("btn-sidebar-toggle"),
  sidebarGrip: $("sidebar-grip"),
  roomTabs: $("room-tabs"),
  roomTitle: document.querySelector(".topbar__title"),
};

const STATUS_TEXT = {
  saved: "저장됨 ●",
  saving: "저장 중…",
  dirty: "변경됨",
  error: "저장 실패",
};

let current = null; // 현재 선택 정보

async function boot() {
  await ensureDirs();
  const settings = await loadSettings();
  if (settings.sidebarCollapsed) document.body.classList.add("sidebar-collapsed");
  const startRoom = ROOMS.some((r) => r.id === settings.activeRoom)
    ? settings.activeRoom
    : DEFAULT_ROOM;
  await room.load(startRoom);

  room.onStatus((s) => {
    el.saveStatus.textContent = STATUS_TEXT[s] || s;
    el.saveStatus.dataset.state = s;
  });

  // 테마 셀렉트 초기값
  el.themeSelect.value = room.data.background?.value || DEFAULT_THEME;

  initCanvas({
    container: el.stage,
    onSelectionChange: onSelection,
  });

  await buildFromRoom();
  refreshEmptyHint();

  initImports({
    fileInput: el.fileInput,
    dropTarget: el.canvasWrap,
    addButton: el.btnAdd,
    onAdded: refreshEmptyHint,
  });

  wireToolbar();
  wireEditPanel();
  wireGlobalKeys();
  wireSystem();
  wireOverlay();
  wireSidebar();
  buildRoomTabs();
  setRoomChrome(room.activeId);

  // 종료 전 마지막 저장 (best effort)
  window.addEventListener("beforeunload", () => room.save());

  // 시작 시 조용히 업데이트 확인
  checkForUpdates({ silent: true });

  // 오버레이: 트레이/단축키 배선 + 마지막 모드 복원
  await initOverlay({ restore: settings, onModeChange: onOverlayModeChange });
}

// 떠있는 도구막대 위치: 편집 모드에 들어오면 마지막 위치 복원, 나가면 인라인 해제
// (창모드의 #sidebar는 position:relative라 인라인 left/top이 남으면 안 됨)
let floatPos = null; // { left, top }
function onOverlayModeChange(mode) {
  if (mode === "edit") {
    if (floatPos) applyFloatPos(floatPos);
  } else {
    el.sidebar.style.left = "";
    el.sidebar.style.top = "";
  }
}
function applyFloatPos({ left, top }) {
  el.sidebar.style.left = left + "px";
  el.sidebar.style.top = top + "px";
}

function wireOverlay() {
  el.btnOverlay.addEventListener("click", () => toggleEdit()); // 일반창→편집 오버레이로
  el.btnToDisplay.addEventListener("click", () => toggleEdit()); // 편집→전시
  el.btnExitOverlay.addEventListener("click", () => toggleOverlay()); // 오버레이→일반창

  // 커스텀 타이틀바 (창은 borderless)
  const win = getCurrentWindow();
  el.btnMin.addEventListener("click", () => win.minimize());
  el.btnClose.addEventListener("click", () => win.hide()); // 닫기 = 트레이로 (Ambient)
}

// ---------- 멀티룸: 방 탭 + 전환 ----------
function buildRoomTabs() {
  el.roomTabs.innerHTML = "";
  for (const r of ROOMS) {
    const btn = document.createElement("button");
    btn.className = "room-tab";
    btn.textContent = r.name;
    btn.dataset.room = r.id;
    btn.setAttribute("aria-current", String(r.id === room.activeId));
    btn.addEventListener("click", () => switchRoom(r.id));
    el.roomTabs.appendChild(btn);
  }
}

// 방 이름/탭 활성 표시 등 방 의존 크롬 갱신
function setRoomChrome(id) {
  if (el.roomTitle) el.roomTitle.textContent = room.data.name || id;
  el.roomTabs.querySelectorAll(".room-tab").forEach((b) => {
    b.setAttribute("aria-current", String(b.dataset.room === id));
  });
  el.themeSelect.value = room.data.background?.value || DEFAULT_THEME;
}

let switching = false;
async function switchRoom(id) {
  if (switching || id === room.activeId) return;
  switching = true;
  try {
    closeEditPanel();
    await room.save(); // 현재 방 저장
    await room.load(id); // 새 방 로드
    await rebuild(); // 캔버스 재구성
    setRoomChrome(id);
    refreshEmptyHint();
    saveSettings({ activeRoom: id });
  } catch (e) {
    console.error("방 전환 실패:", e);
  } finally {
    switching = false;
  }
}

// ---------- 사이드바: 접기/펼치기 + 떠있는 도구막대 드래그 ----------
function wireSidebar() {
  // 창모드 접기 토글 (상태 기억)
  el.sidebarToggle.addEventListener("click", () => {
    const collapsed = document.body.classList.toggle("sidebar-collapsed");
    saveSettings({ sidebarCollapsed: collapsed });
  });

  // 오버레이 편집모드: 그립을 끌어 도구막대 이동
  const grip = el.sidebarGrip;
  let drag = null; // { dx, dy }
  grip.addEventListener("pointerdown", (e) => {
    // 편집 오버레이에서만 (그 외엔 그립이 숨겨져 있음)
    const r = el.sidebar.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    grip.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  grip.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const w = el.sidebar.offsetWidth;
    const h = el.sidebar.offsetHeight;
    let left = e.clientX - drag.dx;
    let top = e.clientY - drag.dy;
    // 화면 안에 완전히 보이도록 클램프 (8px 여유)
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    floatPos = { left, top };
    applyFloatPos(floatPos);
  });
  const end = (e) => {
    if (!drag) return;
    drag = null;
    try {
      grip.releasePointerCapture(e.pointerId);
    } catch {}
  };
  grip.addEventListener("pointerup", end);
  grip.addEventListener("pointercancel", end);
}

function wireSystem() {
  initAutostartToggle(el.autostartToggle);
  el.btnUpdate.addEventListener("click", async () => {
    const prev = el.btnUpdate.textContent;
    el.btnUpdate.disabled = true;
    el.btnUpdate.textContent = "확인 중…";
    await checkForUpdates({
      silent: false,
      onStatus: (msg) => (el.btnUpdate.textContent = msg),
    });
    setTimeout(() => {
      el.btnUpdate.textContent = prev;
      el.btnUpdate.disabled = false;
    }, 2500);
  });
}

function onSelection(info) {
  current = info;
  const has = !!info;
  document
    .querySelectorAll("[data-needs-selection]")
    .forEach((b) => (b.disabled = !has));

  if (has) {
    el.btnLock.textContent = info.locked ? "잠금해제" : "잠금";
  } else {
    el.btnLock.textContent = "잠금";
    closeEditPanel();
  }

  // 편집 패널이 열려 있으면 슬라이더를 새 선택값으로 갱신
  if (has && !el.editPanel.hidden) syncSliders(info.filters);
}

function refreshEmptyHint() {
  el.emptyHint.hidden = objectCount() > 0;
}

// ---------- 툴바 ----------
function wireToolbar() {
  el.btnFront.addEventListener("click", bringForward);
  el.btnBack.addEventListener("click", sendBackward);
  el.btnLock.addEventListener("click", () => {
    const locked = toggleLockSelected();
    el.btnLock.textContent = locked ? "잠금해제" : "잠금";
  });
  el.btnDelete.addEventListener("click", doDelete);

  el.themeSelect.addEventListener("change", () => setTheme(el.themeSelect.value));
}

async function doDelete() {
  const src = deleteSelected();
  refreshEmptyHint();
  if (src) await deleteImageFile(src);
}

// ---------- 편집 패널 ----------
function wireEditPanel() {
  el.btnEdit.addEventListener("click", () => {
    if (!current) return;
    el.editPanel.hidden = false;
    syncSliders(current.filters);
    exitCropUI();
  });
  el.editClose.addEventListener("click", closeEditPanel);

  el.fBrightness.addEventListener("input", () =>
    setSelectedFilter("brightness", parseFloat(el.fBrightness.value))
  );
  el.fSaturation.addEventListener("input", () =>
    setSelectedFilter("saturation", parseFloat(el.fSaturation.value))
  );
  el.fHue.addEventListener("input", () =>
    setSelectedFilter("hue", parseFloat(el.fHue.value))
  );
  el.fContrast.addEventListener("input", () =>
    setSelectedFilter("contrast", parseFloat(el.fContrast.value))
  );

  el.btnReset.addEventListener("click", () => {
    const f = resetSelectedEdits();
    if (f) syncSliders(f);
  });

  // 크롭
  el.btnCrop.addEventListener("click", () => {
    if (enterCropMode()) showCropUI();
  });
  el.cropApply.addEventListener("click", () => {
    applyCrop();
    exitCropUI();
  });
  el.cropCancel.addEventListener("click", () => {
    cancelCrop();
    exitCropUI();
  });
}

function syncSliders(f) {
  if (!f) return;
  el.fBrightness.value = f.brightness ?? 0;
  el.fSaturation.value = f.saturation ?? 0;
  el.fHue.value = f.hue ?? 0;
  el.fContrast.value = f.contrast ?? 0;
}

function closeEditPanel() {
  if (isCropping()) cancelCrop();
  exitCropUI();
  el.editPanel.hidden = true;
}

function showCropUI() {
  el.cropControls.hidden = false;
  setFiltersDisabled(true);
}
function exitCropUI() {
  el.cropControls.hidden = true;
  setFiltersDisabled(false);
}
// 크롭 중엔 필터 슬라이더/버튼 잠금
function setFiltersDisabled(disabled) {
  [el.fBrightness, el.fSaturation, el.fHue, el.fContrast, el.btnCrop, el.btnReset].forEach(
    (n) => (n.disabled = disabled)
  );
}

// ---------- 단축키 ----------
function wireGlobalKeys() {
  window.addEventListener("keydown", (e) => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
      document.activeElement?.tagName
    );
    if (typing) return;
    if ((e.key === "Delete" || e.key === "Backspace") && current && !isCropping()) {
      e.preventDefault();
      doDelete();
    }
    if (e.key === "Escape" && isCropping()) {
      cancelCrop();
      exitCropUI();
    }
  });
}

boot().catch((e) => {
  console.error("부트 실패:", e);
  el.saveStatus.textContent = "초기화 오류";
});
