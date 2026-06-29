// 리빙룸 v1 — 거실. 부트스트랩 + UI 배선.
import { room } from "./js/room.js";
import { ensureDirs, deleteImageFile } from "./js/storage.js";
import { DEFAULT_THEME } from "./js/config.js";
import {
  initCanvas,
  buildFromRoom,
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
import { loadSettings } from "./js/settings.js";
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
  await room.load();

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

  // 종료 전 마지막 저장 (best effort)
  window.addEventListener("beforeunload", () => room.save());

  // 시작 시 조용히 업데이트 확인
  checkForUpdates({ silent: true });

  // 오버레이: 트레이/단축키 배선 + 마지막 모드 복원
  await initOverlay({ restore: settings, onModeChange: () => {} });
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
