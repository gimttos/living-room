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

  // 종료 전 마지막 저장 (best effort)
  window.addEventListener("beforeunload", () => room.save());
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
