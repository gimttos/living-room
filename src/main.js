// 리빙룸 v1 — 거실. 부트스트랩 + UI 배선.
import { room } from "./js/room.js";
import { ensureDirs, deleteImageFile } from "./js/storage.js";
import {
  DEFAULT_THEME,
  ROOMS,
  DEFAULT_ROOM,
  TEXT_FONTS,
  DEFAULT_TEXT_STYLE,
  TEXT_DEFAULT_SIZE,
  BOOK,
  DEFAULT_BOOK_COLOR,
  DIARY_STAMPS,
} from "./js/config.js";
import {
  loadDiary,
  getEntry,
  getEntryDates,
  setEntry,
  saveDiary,
} from "./js/diary.js";
import {
  initCanvas,
  buildFromRoom,
  rebuild,
  setTheme,
  addTextObject,
  setSelectedText,
  setSelectedTextStyle,
  getStageSize,
  addBook,
  updateBook,
  deleteBookById,
  getBookData,
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
  btnAddText: $("btn-add-text"),
  textPanel: $("text-panel"),
  textClose: $("text-close"),
  tText: $("t-text"),
  tFont: $("t-font"),
  tSize: $("t-size"),
  tColor: $("t-color"),
  tAlign: $("t-align"),
  tBg: $("t-bg"),
  tFrame: $("t-frame"),
  objTools: document.querySelector(".sidebar__group"),
  bookReader: $("book-reader"),
  readerBackdrop: $("reader-backdrop"),
  readerClose: $("reader-close"),
  readerDelete: $("reader-delete"),
  rTitle: $("r-title"),
  rText: $("r-text"),
  rColors: $("r-colors"),
  diary: $("diary"),
  diaryBackdrop: $("diary-backdrop"),
  diaryClose: $("diary-close"),
  diaryPrev: $("diary-prev"),
  diaryNext: $("diary-next"),
  diaryToday: $("diary-today"),
  diaryDate: $("diary-date"),
  diaryStamps: $("diary-stamps"),
  diaryText: $("diary-text"),
  diaryDots: $("diary-dots"),
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

  await loadDiary();

  initCanvas({
    container: el.stage,
    onSelectionChange: onSelection,
    onBookOpen: openBookReader,
    onDiaryOpen: () => openDiary(todayStr()),
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
  wireText();
  wireBookReader();
  wireDiary();
  wireGlobalKeys();
  wireSystem();
  wireOverlay();
  wireSidebar();
  buildRoomTabs();
  setRoomChrome(room.activeId);

  // 종료 전 마지막 저장 (best effort)
  window.addEventListener("beforeunload", () => {
    room.save();
    saveDiary();
  });

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

// 방 이름/탭 활성 표시 + 방별 도구 노출 (거실=이미지, 서재=책만)
function setRoomChrome(id) {
  if (el.roomTitle) el.roomTitle.textContent = room.data.name || id;
  el.roomTabs.querySelectorAll(".room-tab").forEach((b) => {
    b.setAttribute("aria-current", String(b.dataset.room === id));
  });
  el.themeSelect.value = room.data.background?.value || DEFAULT_THEME;

  const isStudy = room.data.kind === "study";
  el.btnAdd.style.display = isStudy ? "none" : ""; // ＋이미지: 거실만
  el.btnAddText.style.display = isStudy ? "" : "none"; // ＋문장(책): 서재만
  el.objTools.style.display = isStudy ? "none" : ""; // 편집/앞뒤/잠금/삭제: 자유 캔버스용
  el.emptyHint.textContent = isStudy
    ? "＋ 문장으로 책을 만들어 책장에 꽂아보세요"
    : "이미지를 끌어다 놓아 거실을 꾸며보세요";
}

let switching = false;
async function switchRoom(id) {
  if (switching || id === room.activeId) return;
  switching = true;
  try {
    closeEditPanel();
    closeTextPanel();
    closeBookReader();
    closeDiary();
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
    closeTextPanel();
  }

  // 열린 패널을 선택 타입에 맞춰 동기화하거나 닫기
  if (has && !el.editPanel.hidden) {
    if (info.type === "image") syncSliders(info.filters);
    else closeEditPanel();
  }
  if (has && !el.textPanel.hidden) {
    if (info.type === "text") syncTextPanel(info);
    else closeTextPanel();
  }
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
    if (current.type === "text") {
      openTextPanel();
      return;
    }
    el.textPanel.hidden = true;
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

// ---------- 문장 카드 (text) ----------
function wireText() {
  // 폰트 옵션 채우기
  for (const f of TEXT_FONTS) {
    const o = document.createElement("option");
    o.value = f.value;
    o.textContent = f.label;
    el.tFont.appendChild(o);
  }

  el.btnAddText.addEventListener("click", addNewTextCard);
  el.textClose.addEventListener("click", closeTextPanel);

  el.tText.addEventListener("input", () => setSelectedText(el.tText.value));
  el.tFont.addEventListener("change", () => setSelectedTextStyle("font", el.tFont.value));
  el.tSize.addEventListener("input", () =>
    setSelectedTextStyle("fontSize", parseInt(el.tSize.value, 10))
  );
  el.tColor.addEventListener("input", () => setSelectedTextStyle("color", el.tColor.value));
  el.tAlign.addEventListener("change", () => setSelectedTextStyle("align", el.tAlign.value));
  el.tBg.addEventListener("change", () => setSelectedTextStyle("bg", el.tBg.value));
  el.tFrame.addEventListener("change", () => setSelectedTextStyle("frame", el.tFrame.value));
}

async function addNewTextCard() {
  // 서재: 책으로 만들어 책장에 꽂고 바로 읽기 패널 오픈
  if (room.data.kind === "study") {
    const obj = {
      id: crypto.randomUUID(),
      type: "text",
      title: "",
      text: "",
      zIndex: room.nextZIndex(),
      style: { color: DEFAULT_BOOK_COLOR },
    };
    addBook(obj);
    refreshEmptyHint();
    openBookReader(obj.id);
    el.rText.focus();
    return;
  }
  // 그 외(레거시 freeform): 자유 문장 카드
  const { width: sw, height: sh } = getStageSize();
  const { width: w, height: h } = TEXT_DEFAULT_SIZE;
  const n = room.data.objects.length;
  const obj = {
    id: crypto.randomUUID(),
    type: "text",
    text: "",
    x: Math.round(sw / 2 - w / 2 + ((n * 24) % 160) - 80),
    y: Math.round(sh / 2 - h / 2 + ((n * 24) % 120) - 60),
    width: w,
    height: h,
    rotation: 0,
    zIndex: room.nextZIndex(),
    style: { ...DEFAULT_TEXT_STYLE },
    locked: false,
  };
  await addTextObject(obj, { select: true });
  refreshEmptyHint();
  openTextPanel();
  el.tText.focus();
}

// ---------- 책 읽기 모달 (서재) ----------
let readerBookId = null;
function wireBookReader() {
  // 색 스와치
  for (const c of BOOK.colors) {
    const b = document.createElement("button");
    b.className = "r-swatch";
    b.style.background = c;
    b.dataset.color = c;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => {
      if (!readerBookId) return;
      updateBook(readerBookId, { color: c });
      markActiveSwatch(c);
    });
    el.rColors.appendChild(b);
  }

  el.rTitle.addEventListener("input", () => {
    if (readerBookId) updateBook(readerBookId, { title: el.rTitle.value });
  });
  el.rText.addEventListener("input", () => {
    if (readerBookId) updateBook(readerBookId, { text: el.rText.value });
  });
  el.readerClose.addEventListener("click", closeBookReader);
  el.readerBackdrop.addEventListener("click", closeBookReader);
  el.bookReader.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeBookReader();
    }
  });
  el.readerDelete.addEventListener("click", () => {
    if (!readerBookId) return;
    deleteBookById(readerBookId);
    closeBookReader();
    refreshEmptyHint();
  });
}

function openBookReader(id) {
  const data = getBookData(id);
  if (!data) return;
  readerBookId = id;
  el.rTitle.value = data.title;
  el.rText.value = data.text;
  markActiveSwatch(data.color);
  el.bookReader.hidden = false;
}
function closeBookReader() {
  el.bookReader.hidden = true;
  readerBookId = null;
}
function markActiveSwatch(color) {
  el.rColors.querySelectorAll(".r-swatch").forEach((s) => {
    s.setAttribute("aria-pressed", String(s.dataset.color === color));
  });
}

// ---------- 일기장 (서재, 수집형·죄책감 0) ----------
let diaryDate = null; // 현재 보고 있는 날짜 "YYYY-MM-DD"

function pad2(n) {
  return String(n).padStart(2, "0");
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function shiftDate(str, delta) {
  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}
function formatDateLabel(str) {
  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const main = `${y}년 ${m}월 ${d}일 (${days[dt.getDay()]})`;
  return str === todayStr() ? `${main}<small>오늘</small>` : main;
}

function wireDiary() {
  // 기분 도장 버튼
  for (const s of DIARY_STAMPS) {
    const b = document.createElement("button");
    b.className = "diary-stamp";
    b.type = "button";
    b.textContent = s;
    b.dataset.stamp = s;
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => toggleStamp(s));
    el.diaryStamps.appendChild(b);
  }

  el.diaryText.addEventListener("input", () => {
    if (diaryDate) setEntry(diaryDate, { text: el.diaryText.value });
  });
  el.diaryPrev.addEventListener("click", () => openDiary(shiftDate(diaryDate, -1)));
  el.diaryNext.addEventListener("click", () => openDiary(shiftDate(diaryDate, 1)));
  el.diaryToday.addEventListener("click", () => openDiary(todayStr()));
  el.diaryClose.addEventListener("click", closeDiary);
  el.diaryBackdrop.addEventListener("click", closeDiary);
  el.diary.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeDiary();
    }
  });
}

function openDiary(date) {
  diaryDate = date;
  const entry = getEntry(date);
  el.diaryDate.innerHTML = formatDateLabel(date);
  el.diaryText.value = entry.text || "";
  el.diaryStamps.querySelectorAll(".diary-stamp").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.stamp === entry.moodStamp));
  });
  // 미래 날짜로는 안 넘어가게 '다음' 비활성
  el.diaryNext.disabled = date >= todayStr();
  renderDiaryDots();
  el.diary.hidden = false;
  el.diaryText.focus();
}

function closeDiary() {
  if (!el.diary.hidden) saveDiary(); // 즉시 영속화
  el.diary.hidden = true;
  diaryDate = null;
}

function toggleStamp(stamp) {
  if (!diaryDate) return;
  const cur = getEntry(diaryDate).moodStamp;
  const next = cur === stamp ? null : stamp; // 다시 누르면 해제
  setEntry(diaryDate, { moodStamp: next });
  el.diaryStamps.querySelectorAll(".diary-stamp").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.stamp === next));
  });
  renderDiaryDots();
}

// 기록한 날들 = "구경" 점프 칩
function renderDiaryDots() {
  el.diaryDots.innerHTML = "";
  for (const d of getEntryDates()) {
    const entry = getEntry(d);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "diary-dot";
    const [, m, day] = d.split("-");
    chip.textContent = `${entry.moodStamp ? entry.moodStamp + " " : ""}${Number(m)}/${Number(day)}`;
    chip.setAttribute("aria-current", String(d === diaryDate));
    chip.addEventListener("click", () => openDiary(d));
    el.diaryDots.appendChild(chip);
  }
}

function openTextPanel() {
  if (!current || current.type !== "text") return;
  el.editPanel.hidden = true;
  el.textPanel.hidden = false;
  syncTextPanel(current);
}
function closeTextPanel() {
  el.textPanel.hidden = true;
}
function syncTextPanel(info) {
  const s = info.style || DEFAULT_TEXT_STYLE;
  el.tText.value = info.text || "";
  el.tFont.value = s.font;
  el.tSize.value = s.fontSize;
  el.tColor.value = s.color;
  el.tAlign.value = s.align;
  el.tBg.value = s.bg;
  el.tFrame.value = s.frame;
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
