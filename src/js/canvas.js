// Konva 캔버스 엔진: 배경 레이어 + 오브젝트 레이어 + UI(트랜스포머) 레이어.
// 방의 모든 "방"이 공유하는 엔진. v1은 image 오브젝트만 다룬다.
import Konva from "konva";
import { room } from "./room.js";
import {
  THEMES,
  DEFAULT_THEME,
  TEXT_BG,
  TEXT_FRAME,
  DEFAULT_TEXT_STYLE,
  TEXT_PAD,
  BOOK,
  DEFAULT_BOOK_COLOR,
} from "./config.js";
import { readImageObjectURL } from "./storage.js";
import { loadImageEl } from "./imageProcessing.js";

let stage, bgLayer, objLayer, uiLayer, transformer;
let onSelectionChange = () => {};
let onBookOpen = () => {}; // 서재 책등 클릭 → 읽기
let onDiaryOpen = () => {}; // 서재 일기책 클릭 → 일기
let diaryNode = null; // 서재에 항상 꽂힌 일기 책(고정 비품)
let bgVisible = true; // 오버레이 전시에선 false (순수 떠다니는 이미지)

const nodeById = new Map(); // id -> Konva.Image
const urlById = new Map(); // id -> objectURL (해제용)

let cropState = null; // 크롭 모드 상태

// ---------- 초기화 ----------
export function initCanvas({
  container,
  onSelectionChange: cb,
  onBookOpen: bookCb,
  onDiaryOpen: diaryCb,
}) {
  onSelectionChange = cb || (() => {});
  onBookOpen = bookCb || (() => {});
  onDiaryOpen = diaryCb || (() => {});

  stage = new Konva.Stage({
    container,
    width: container.clientWidth,
    height: container.clientHeight,
  });

  bgLayer = new Konva.Layer({ listening: false });
  objLayer = new Konva.Layer();
  uiLayer = new Konva.Layer();
  stage.add(bgLayer, objLayer, uiLayer);

  transformer = new Konva.Transformer({
    rotateEnabled: true,
    keepRatio: false,
    borderStroke: "#7a5cff",
    anchorStroke: "#7a5cff",
    anchorFill: "#fff",
    anchorSize: 9,
  });
  uiLayer.add(transformer);

  // 빈 곳 클릭 → 선택 해제
  stage.on("mousedown touchstart", (e) => {
    if (cropState) return;
    if (e.target === stage || e.target.getLayer() === bgLayer) {
      selectById(null);
    }
  });

  // 반응형 크기
  const ro = new ResizeObserver(() => resize());
  ro.observe(container);

  renderBackground();
}

function resize() {
  const c = stage.container();
  stage.width(c.clientWidth);
  stage.height(c.clientHeight);
  renderBackground();
  if (room.data.kind === "study") arrangeBooks();
}

// ---------- 배경 / 테마 ----------
// 오버레이 전시 모드: 배경(벽/바닥/선반) 숨겨 이미지만 떠 있게.
export function setBackgroundVisible(visible) {
  bgVisible = visible;
  if (visible) {
    bgLayer.show();
    renderBackground();
  } else {
    bgLayer.hide();
    bgLayer.batchDraw();
  }
}

export function renderBackground() {
  if (!bgVisible) return;
  bgLayer.destroyChildren();
  const w = stage.width();
  const h = stage.height();
  const themeKey = room.data.background?.value || DEFAULT_THEME;
  const t = THEMES[themeKey] || THEMES[DEFAULT_THEME];

  if (room.data.kind === "study") renderStudyBg(w, h, t);
  else renderFreeformBg(w, h, t);

  bgLayer.batchDraw();
}

// 벽 그라데이션 헬퍼
function addWall(w, hWall, t) {
  bgLayer.add(
    new Konva.Rect({
      x: 0,
      y: 0,
      width: w,
      height: hWall,
      fillLinearGradientStartPoint: { x: 0, y: 0 },
      fillLinearGradientEndPoint: { x: 0, y: hWall },
      fillLinearGradientColorStops: [0, t.wallTop, 1, t.wallBottom],
    })
  );
}

// 거실: 벽 + 바닥 + 선반 한 줄 (스펙 6, v1 그대로)
function renderFreeformBg(w, h, t) {
  const floorY = Math.round(h * 0.74);
  addWall(w, floorY, t);
  bgLayer.add(
    new Konva.Rect({ x: 0, y: floorY, width: w, height: h - floorY, fill: t.floor })
  );
  const shelfY = Math.round(h * 0.5);
  bgLayer.add(
    new Konva.Rect({ x: 0, y: shelfY + 10, width: w, height: 14, fill: t.shelfShadow })
  );
  bgLayer.add(
    new Konva.Rect({ x: 0, y: shelfY, width: w, height: 10, fill: t.shelf })
  );
}

// 서재 기하: 선반판 y들 + 칸 높이. 배경과 책 배치가 공유한다.
function studyGeometry(w, h) {
  const deskY = Math.round(h * 0.82);
  const top = Math.round(h * 0.1);
  const rows = 4;
  const gap = (deskY - top) / rows;
  const margin = Math.round(Math.min(64, w * 0.05));
  const boards = []; // 각 선반판 윗면 y (책이 이 위에 섬)
  for (let i = 0; i < rows; i++) boards.push(Math.round(top + gap * (i + 1)) - 14);
  return { deskY, top, rows, gap, margin, boards };
}

// 서재: 책장 선반 여러 줄 + 책상. "구경하는 서재" 분위기 (가벼운 Rect만).
function renderStudyBg(w, h, t) {
  const g = studyGeometry(w, h);
  addWall(w, g.deskY, t);

  for (const y of g.boards) {
    bgLayer.add(
      new Konva.Rect({
        x: g.margin,
        y: y + 11,
        width: w - g.margin * 2,
        height: 14,
        fill: t.shelfShadow,
        cornerRadius: 3,
      })
    );
    bgLayer.add(
      new Konva.Rect({
        x: g.margin,
        y,
        width: w - g.margin * 2,
        height: 11,
        fill: t.shelf,
        cornerRadius: 3,
      })
    );
  }

  // 책상 (바닥 대신 따뜻한 나무 면)
  bgLayer.add(
    new Konva.Rect({ x: 0, y: g.deskY, width: w, height: h - g.deskY, fill: t.floor })
  );
  bgLayer.add(
    new Konva.Rect({ x: 0, y: g.deskY, width: w, height: 6, fill: t.shelfShadow })
  );
}

export function setTheme(themeKey) {
  if (!THEMES[themeKey]) return;
  room.setBackground({ type: "theme", value: themeKey });
  renderBackground();
}

// 방 전환: 기존 노드/URL 정리 후 활성 방(room.data)으로 재구성.
export async function rebuild() {
  selectById(null);
  if (cropState) cancelCrop();
  objLayer.destroyChildren();
  diaryNode = null;
  nodeById.clear();
  for (const url of urlById.values()) URL.revokeObjectURL(url);
  urlById.clear();
  renderBackground();
  await buildFromRoom();
}

// ---------- 오브젝트 생성/로드 ----------
// 방 데이터로부터 모든 오브젝트를 그린다 (zIndex 순).
export async function buildFromRoom() {
  const objs = [...room.data.objects].sort(
    (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
  );
  for (const obj of objs) {
    if (obj.type === "image") await mountImageNode(obj);
    else if (obj.type === "text") mountTextNode(obj);
  }
  if (room.data.kind === "study") {
    mountDiaryFixture();
    arrangeBooks();
  }
  objLayer.batchDraw();
}

// 평면 데이터(obj) → Konva.Image 노드 생성/배치
async function mountImageNode(obj) {
  let url = urlById.get(obj.id);
  if (!url) {
    url = await readImageObjectURL(obj.src);
    urlById.set(obj.id, url);
  }
  const img = await loadImageEl(url);

  const node = new Konva.Image({
    id: obj.id,
    image: img,
    x: obj.x,
    y: obj.y,
    width: obj.width,
    height: obj.height,
    rotation: obj.rotation || 0,
    scaleX: 1,
    scaleY: 1,
    draggable: !obj.locked,
    name: "room-object",
  });
  if (obj.crop) node.crop(obj.crop);

  wireNode(node, obj);
  objLayer.add(node);
  nodeById.set(obj.id, node);
  applyFilters(node, obj);
  return node;
}

function wireNode(node, obj) {
  node.on("click tap", (e) => {
    if (cropState) return;
    e.cancelBubble = true;
    selectById(obj.id);
  });

  node.on("dragend", () => {
    obj.x = node.x();
    obj.y = node.y();
    room.touch();
  });

  node.on("transformend", () => {
    // 스케일을 width/height로 흡수해 scaleX/scaleY는 1로 유지 (필터/크롭 안정)
    const newW = Math.max(8, node.width() * node.scaleX());
    const newH = Math.max(8, node.height() * node.scaleY());
    node.scale({ x: 1, y: 1 });
    node.width(newW);
    node.height(newH);
    obj.x = node.x();
    obj.y = node.y();
    obj.width = newW;
    obj.height = newH;
    obj.rotation = node.rotation();
    applyFilters(node, obj); // 크기 변경 → 필터 캐시 갱신
    room.touch();
  });
}

// 새 이미지 오브젝트 추가 (가져오기 후 호출). select=true면 바로 선택.
export async function addImageObject(obj, { select = true } = {}) {
  room.addObject(obj);
  const node = await mountImageNode(obj);
  objLayer.batchDraw();
  if (select) selectById(obj.id);
  return node;
}

// ---------- 문장 오브젝트 (text) ----------
// 서재(kind:study)에선 책등으로, 그 외(거실 등)에선 자유 카드로 렌더.
function mountTextNode(obj) {
  if (room.data.kind === "study") return mountBookSpine(obj);
  return mountTextCard(obj);
}

// 거실 등: 자유 배치 문장 카드 (레거시)
function mountTextCard(obj) {
  if (!obj.style) obj.style = { ...DEFAULT_TEXT_STYLE };
  const group = new Konva.Group({
    id: obj.id,
    x: obj.x,
    y: obj.y,
    rotation: obj.rotation || 0,
    draggable: !obj.locked,
    name: "room-object",
  });
  group.add(
    new Konva.Rect({ name: "text-bg" }),
    new Konva.Rect({ name: "text-frame", listening: false }),
    new Konva.Text({ name: "text-body", listening: false, wrap: "word" })
  );
  layoutTextNode(group, obj);
  wireTextNode(group, obj);
  objLayer.add(group);
  nodeById.set(obj.id, group);
  return group;
}

// obj 값(크기·스타일·텍스트)을 그룹 자식들에 반영
function layoutTextNode(group, obj) {
  const w = obj.width;
  const h = obj.height;
  const s = obj.style || DEFAULT_TEXT_STYLE;
  group.size({ width: w, height: h });

  const bgS = TEXT_BG[s.bg] || TEXT_BG.none;
  group.findOne(".text-bg").setAttrs({
    x: 0,
    y: 0,
    width: w,
    height: h,
    cornerRadius: bgS.radius,
    fill: bgS.fill || "rgba(0,0,0,0.001)", // 투명이어도 클릭 잡히게 거의-투명
    stroke: bgS.stroke,
    strokeWidth: bgS.strokeWidth,
    shadowColor: bgS.shadow ? "rgba(70,50,30,0.25)" : undefined,
    shadowBlur: bgS.shadow ? 12 : 0,
    shadowOffsetY: bgS.shadow ? 4 : 0,
    shadowOpacity: bgS.shadow ? 1 : 0,
  });

  const frS = TEXT_FRAME[s.frame] || TEXT_FRAME.none;
  group.findOne(".text-frame").setAttrs({
    x: frS.inset,
    y: frS.inset,
    width: Math.max(0, w - frS.inset * 2),
    height: Math.max(0, h - frS.inset * 2),
    cornerRadius: Math.max(0, (bgS.radius || 0) - frS.inset),
    stroke: frS.stroke,
    strokeWidth: frS.strokeWidth,
    dash: frS.dash || undefined,
    visible: frS.strokeWidth > 0,
  });

  group.findOne(".text-body").setAttrs({
    x: TEXT_PAD,
    y: TEXT_PAD,
    width: Math.max(8, w - TEXT_PAD * 2),
    text: obj.text || "",
    fontSize: s.fontSize,
    fontFamily: s.font,
    fill: s.color,
    align: s.align,
    lineHeight: 1.4,
  });
  group.getLayer()?.batchDraw();
}

function wireTextNode(group, obj) {
  group.on("click tap", (e) => {
    if (cropState) return;
    e.cancelBubble = true;
    selectById(obj.id);
  });
  group.on("dragend", () => {
    obj.x = group.x();
    obj.y = group.y();
    room.touch();
  });
  group.on("transformend", () => {
    // 스케일을 width/height로 흡수 후 재배치 (텍스트 재줄바꿈)
    const newW = Math.max(60, obj.width * group.scaleX());
    const newH = Math.max(40, obj.height * group.scaleY());
    group.scale({ x: 1, y: 1 });
    obj.width = newW;
    obj.height = newH;
    obj.x = group.x();
    obj.y = group.y();
    obj.rotation = group.rotation();
    layoutTextNode(group, obj);
    room.touch();
  });
}

// 새 문장 카드 추가
export async function addTextObject(obj, { select = true } = {}) {
  if (!obj.style) obj.style = { ...DEFAULT_TEXT_STYLE };
  room.addObject(obj);
  const node = mountTextNode(obj);
  objLayer.batchDraw();
  if (select) selectById(obj.id);
  return node;
}

// 스타일러 패널 → 선택된 문장 카드에 즉시 반영
export function setSelectedText(text) {
  if (!selectedId) return;
  const obj = room.getObject(selectedId);
  const node = nodeById.get(selectedId);
  if (!obj || obj.type !== "text" || !node) return;
  obj.text = text;
  layoutTextNode(node, obj);
  room.touch();
}

export function setSelectedTextStyle(key, value) {
  if (!selectedId) return;
  const obj = room.getObject(selectedId);
  const node = nodeById.get(selectedId);
  if (!obj || obj.type !== "text" || !node) return;
  if (!obj.style) obj.style = { ...DEFAULT_TEXT_STYLE };
  obj.style[key] = value;
  layoutTextNode(node, obj);
  selectById(selectedId); // 트랜스포머 박스 갱신
  room.touch();
}

// ---------- 서재 책장(책등) ----------
function firstLine(t) {
  return (t || "").split("\n")[0].trim().slice(0, 24);
}
function spineTextColor(hex) {
  // 밝기 추정 → 밝은 책등엔 어두운 글자, 어두운 책등엔 흰 글자
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#3a2f25" : "rgba(255,255,255,0.92)";
}

function mountBookSpine(obj) {
  const group = new Konva.Group({ id: obj.id, name: "book-spine" });
  group.add(
    new Konva.Rect({ name: "spine-body" }),
    new Konva.Rect({ name: "spine-band-top", listening: false }),
    new Konva.Rect({ name: "spine-band-bottom", listening: false }),
    new Konva.Text({ name: "spine-title", rotation: 90, listening: false })
  );
  group.on("mouseenter", () => {
    stage.container().style.cursor = "pointer";
    group.y(group.getAttr("baseY") - 7);
    objLayer.batchDraw();
  });
  group.on("mouseleave", () => {
    stage.container().style.cursor = "default";
    group.y(group.getAttr("baseY") ?? group.y());
    objLayer.batchDraw();
  });
  group.on("click tap", (e) => {
    e.cancelBubble = true;
    onBookOpen(obj.id);
  });
  objLayer.add(group);
  nodeById.set(obj.id, group);
  return group;
}

function layoutBookSpine(node, obj, wB, hB) {
  const color = obj.style?.color || DEFAULT_BOOK_COLOR;
  node.findOne(".spine-body").setAttrs({
    x: 0,
    y: 0,
    width: wB,
    height: hB,
    fill: color,
    cornerRadius: [4, 4, 2, 2],
    shadowColor: "rgba(40,25,10,0.4)",
    shadowBlur: 6,
    shadowOffsetX: 2,
    shadowOpacity: 0.55,
  });
  node.findOne(".spine-band-top").setAttrs({
    x: 0,
    y: Math.round(hB * 0.11),
    width: wB,
    height: 3,
    fill: "rgba(255,255,255,0.22)",
  });
  node.findOne(".spine-band-bottom").setAttrs({
    x: 0,
    y: Math.round(hB * 0.85),
    width: wB,
    height: 3,
    fill: "rgba(0,0,0,0.2)",
  });
  const title = (obj.title && obj.title.trim()) || firstLine(obj.text) || "제목 없음";
  node.findOne(".spine-title").setAttrs({
    x: Math.round(wB * 0.72),
    y: 9,
    width: Math.max(10, hB - 18),
    text: title,
    fontSize: Math.max(10, Math.min(14, Math.round(wB * 0.4))),
    fontFamily: '"Malgun Gothic","맑은 고딕",sans-serif',
    fill: spineTextColor(color),
    ellipsis: true,
    wrap: "none",
  });
}

// 일기책(고정) → 사용자 책들 순서로 선반에 좌→우, 넘치면 다음 선반.
function arrangeBooks() {
  const w = stage.width();
  const h = stage.height();
  const g = studyGeometry(w, h);
  const spineW = BOOK.spineW;
  const bookH = Math.round(g.gap * BOOK.heightRatio);
  const usableRight = w - g.margin;

  const slots = [];
  if (diaryNode) slots.push({ node: diaryNode, diary: true });
  for (const obj of room.data.objects
    .filter((o) => o.type === "text")
    .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))) {
    const node = nodeById.get(obj.id);
    if (node) slots.push({ node, obj });
  }

  let row = 0;
  let x = g.margin;
  for (const slot of slots) {
    if (x + spineW > usableRight && x > g.margin) {
      row++;
      x = g.margin;
    }
    if (row >= g.rows) {
      slot.node.visible(false); // 선반 초과분은 숨김 (후속: 페이지)
      continue;
    }
    slot.node.visible(true);
    const y = g.boards[row] - bookH;
    if (slot.diary) layoutDiarySpine(slot.node, spineW, bookH);
    else layoutBookSpine(slot.node, slot.obj, spineW, bookH);
    slot.node.position({ x, y });
    slot.node.setAttr("baseY", y);
    x += spineW + BOOK.gap;
  }
  objLayer.batchDraw();
}

// 일기책: 서재에 항상 꽂힌 고정 비품 (책갈피 리본으로 구분).
function mountDiaryFixture() {
  const group = new Konva.Group({ name: "diary-spine" });
  group.add(
    new Konva.Rect({ name: "spine-body" }),
    new Konva.Rect({ name: "diary-ribbon", listening: false }),
    new Konva.Text({ name: "spine-title", rotation: 90, listening: false })
  );
  group.on("mouseenter", () => {
    stage.container().style.cursor = "pointer";
    group.y(group.getAttr("baseY") - 7);
    objLayer.batchDraw();
  });
  group.on("mouseleave", () => {
    stage.container().style.cursor = "default";
    group.y(group.getAttr("baseY") ?? group.y());
    objLayer.batchDraw();
  });
  group.on("click tap", (e) => {
    e.cancelBubble = true;
    onDiaryOpen();
  });
  objLayer.add(group);
  diaryNode = group;
  return group;
}

function layoutDiarySpine(node, wB, hB) {
  const cover = "#8a5a3c"; // 가죽 다이어리 느낌
  node.findOne(".spine-body").setAttrs({
    x: 0,
    y: 0,
    width: wB,
    height: hB,
    fill: cover,
    cornerRadius: [4, 4, 2, 2],
    shadowColor: "rgba(40,25,10,0.4)",
    shadowBlur: 6,
    shadowOffsetX: 2,
    shadowOpacity: 0.55,
  });
  // 책갈피 리본 (위에서 아래로 살짝 내려옴)
  node.findOne(".diary-ribbon").setAttrs({
    x: Math.round(wB * 0.5 - 3),
    y: -6,
    width: 6,
    height: Math.round(hB * 0.34),
    fill: "#c2553f",
  });
  node.findOne(".spine-title").setAttrs({
    x: Math.round(wB * 0.72),
    y: 9,
    width: Math.max(10, hB - 18),
    text: "일기",
    fontSize: Math.max(11, Math.min(14, Math.round(wB * 0.42))),
    fontFamily: '"Malgun Gothic","맑은 고딕",sans-serif',
    fill: "rgba(255,255,255,0.95)",
    ellipsis: true,
    wrap: "none",
  });
}

// 새 책 추가 (서재)
export function addBook(obj) {
  if (!obj.style) obj.style = { color: DEFAULT_BOOK_COLOR };
  room.addObject(obj);
  mountBookSpine(obj);
  arrangeBooks();
}

// 읽기 패널 → 책 내용/색 갱신
export function updateBook(id, patch) {
  const obj = room.getObject(id);
  if (!obj) return;
  if (patch.title !== undefined) obj.title = patch.title;
  if (patch.text !== undefined) obj.text = patch.text;
  if (patch.color !== undefined) {
    obj.style = obj.style || {};
    obj.style.color = patch.color;
  }
  arrangeBooks();
  room.touch();
}

export function deleteBookById(id) {
  const node = nodeById.get(id);
  if (node) node.destroy();
  nodeById.delete(id);
  room.removeObject(id);
  arrangeBooks();
}

export function getBookData(id) {
  const obj = room.getObject(id);
  if (!obj) return null;
  return {
    id: obj.id,
    title: obj.title || "",
    text: obj.text || "",
    color: obj.style?.color || DEFAULT_BOOK_COLOR,
  };
}

// ---------- 선택 / 트랜스포머 ----------
let selectedId = null;

export function selectById(id) {
  selectedId = id;
  const node = id ? nodeById.get(id) : null;
  if (node && !node.draggable()) {
    // 잠긴 노드는 핸들 없이 선택만
    transformer.nodes([]);
  } else {
    transformer.nodes(node ? [node] : []);
  }
  uiLayer.batchDraw();
  onSelectionChange(getSelectedInfo());
}

export function getSelectedInfo() {
  if (!selectedId) return null;
  const obj = room.getObject(selectedId);
  if (!obj) return null;
  return {
    id: obj.id,
    type: obj.type,
    locked: !!obj.locked,
    filters: { ...obj.filters },
    hasCrop: !!obj.crop,
    style: obj.style ? { ...obj.style } : null,
    text: obj.text ?? "",
  };
}

// ---------- 편집 동작 ----------
export function deleteSelected() {
  if (!selectedId) return;
  const id = selectedId;
  const node = nodeById.get(id);
  if (node) node.destroy();
  nodeById.delete(id);
  const url = urlById.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlById.delete(id);
  }
  const obj = room.getObject(id);
  room.removeObject(id);
  selectById(null);
  objLayer.batchDraw();
  return obj?.src || null; // 호출측이 파일 삭제하도록 src 반환
}

export function bringForward() {
  const node = selectedId && nodeById.get(selectedId);
  if (!node) return;
  node.moveUp();
  syncZIndices();
}

export function sendBackward() {
  const node = selectedId && nodeById.get(selectedId);
  if (!node) return;
  node.moveDown();
  syncZIndices();
}

function syncZIndices() {
  // Konva의 현재 그리기 순서를 데이터 zIndex로 반영
  objLayer.getChildren().forEach((n) => {
    const obj = room.getObject(n.id());
    if (obj) obj.zIndex = n.zIndex();
  });
  objLayer.batchDraw();
  room.touch();
}

export function toggleLockSelected() {
  if (!selectedId) return;
  const obj = room.getObject(selectedId);
  const node = nodeById.get(selectedId);
  if (!obj || !node) return;
  obj.locked = !obj.locked;
  node.draggable(!obj.locked);
  selectById(selectedId); // 트랜스포머 상태 갱신
  room.touch();
  return obj.locked;
}

// ---------- 필터 (비파괴) ----------
function hasAnyFilter(f) {
  return (
    f.brightness !== 0 ||
    f.saturation !== 0 ||
    ((f.hue % 360) + 360) % 360 !== 0 ||
    f.contrast !== 0
  );
}

function applyFilters(node, obj) {
  const f = obj.filters || { brightness: 0, saturation: 0, hue: 0, contrast: 0 };
  if (hasAnyFilter(f)) {
    node.cache();
    node.filters([Konva.Filters.Brighten, Konva.Filters.HSL, Konva.Filters.Contrast]);
    node.brightness(f.brightness);
    node.hue((((f.hue % 360) + 360) % 360));
    node.saturation(f.saturation * 2); // 슬라이더 -1..1 → HSL -2..2
    node.contrast(f.contrast * 100); // 슬라이더 -1..1 → -100..100
  } else {
    node.filters([]);
    node.clearCache();
  }
  node.getLayer()?.batchDraw();
}

// 슬라이더 변경을 선택 오브젝트에 즉시 반영
export function setSelectedFilter(key, value) {
  if (!selectedId) return;
  const obj = room.getObject(selectedId);
  const node = nodeById.get(selectedId);
  if (!obj || !node) return;
  if (!obj.filters) obj.filters = { brightness: 0, saturation: 0, hue: 0, contrast: 0 };
  obj.filters[key] = value;
  applyFilters(node, obj);
  room.touch();
}

export function resetSelectedEdits() {
  if (!selectedId) return;
  const obj = room.getObject(selectedId);
  const node = nodeById.get(selectedId);
  if (!obj || !node) return;
  obj.filters = { brightness: 0, saturation: 0, hue: 0, contrast: 0 };
  if (obj.crop) {
    // 크롭 해제: 원본 비율 복원 (자연 픽셀 전체)
    const img = node.image();
    obj.crop = null;
    node.crop(null);
    // 폭 기준으로 높이 재계산해 자연 비율 회복
    const ratio = img.naturalHeight / img.naturalWidth;
    obj.height = obj.width * ratio;
    node.height(obj.height);
  }
  node.rotation(obj.rotation || 0);
  applyFilters(node, obj);
  selectById(selectedId);
  room.touch();
  return { ...obj.filters };
}

// ---------- 크롭 모드 ----------
export function enterCropMode() {
  if (!selectedId || cropState) return false;
  const node = nodeById.get(selectedId);
  const obj = room.getObject(selectedId);
  if (!node || !obj) return false;

  transformer.nodes([]); // 메인 트랜스포머 숨김

  // 노드 로컬 박스(0..w, 0..h)에 맞춘 크롭 사각형
  const w = node.width();
  const h = node.height();
  const rect = new Konva.Rect({
    x: node.x(),
    y: node.y(),
    width: w,
    height: h,
    rotation: node.rotation(),
    stroke: "#7a5cff",
    strokeWidth: 2,
    dash: [6, 4],
    fill: "rgba(122,92,255,0.08)",
    draggable: true,
    name: "crop-rect",
  });
  const cropTr = new Konva.Transformer({
    rotateEnabled: false,
    keepRatio: false,
    borderStroke: "#7a5cff",
    anchorStroke: "#7a5cff",
    anchorFill: "#fff",
  });
  uiLayer.add(rect);
  uiLayer.add(cropTr);
  cropTr.nodes([rect]);
  uiLayer.batchDraw();

  cropState = { node, obj, rect, cropTr };
  return true;
}

export function applyCrop() {
  if (!cropState) return;
  const { node, obj, rect, cropTr } = cropState;

  // rect의 스케일을 흡수
  const rw = rect.width() * rect.scaleX();
  const rh = rect.height() * rect.scaleY();
  rect.scale({ x: 1, y: 1 });
  rect.width(rw);
  rect.height(rh);

  const w = node.width();
  const h = node.height();

  // rect를 노드 로컬 좌표로 환산 (회전 고려)
  const rad = -(node.rotation() * Math.PI) / 180;
  const dx = rect.x() - node.x();
  const dy = rect.y() - node.y();
  let localX = dx * Math.cos(rad) - dy * Math.sin(rad);
  let localY = dx * Math.sin(rad) + dy * Math.cos(rad);

  // 프랙션 클램프 [0,1]
  let fx = Math.min(1, Math.max(0, localX / w));
  let fy = Math.min(1, Math.max(0, localY / h));
  let fw = Math.min(1 - fx, Math.max(0.02, rw / w));
  let fh = Math.min(1 - fy, Math.max(0.02, rh / h));

  // 현재 소스 영역 (기존 크롭 합성)
  const img = node.image();
  const src = obj.crop || {
    x: 0,
    y: 0,
    width: img.naturalWidth,
    height: img.naturalHeight,
  };
  const newCrop = {
    x: src.x + fx * src.width,
    y: src.y + fy * src.height,
    width: fw * src.width,
    height: fh * src.height,
  };

  // 새 노드 위치: 로컬 (fx*w, fy*h) 를 부모 좌표로 회전 적용
  const lr = (node.rotation() * Math.PI) / 180;
  const offX = fx * w;
  const offY = fy * h;
  const newX = node.x() + (offX * Math.cos(lr) - offY * Math.sin(lr));
  const newY = node.y() + (offX * Math.sin(lr) + offY * Math.cos(lr));

  obj.crop = newCrop;
  obj.x = newX;
  obj.y = newY;
  obj.width = fw * w;
  obj.height = fh * h;

  node.crop(newCrop);
  node.position({ x: newX, y: newY });
  node.size({ width: obj.width, height: obj.height });

  rect.destroy();
  cropTr.destroy();
  cropState = null;
  applyFilters(node, obj);
  selectById(obj.id);
  room.touch();
}

export function cancelCrop() {
  if (!cropState) return;
  cropState.rect.destroy();
  cropState.cropTr.destroy();
  const id = cropState.obj.id;
  cropState = null;
  selectById(id);
}

export function isCropping() {
  return !!cropState;
}

export function objectCount() {
  return room.data.objects.length;
}

export function getStageSize() {
  return { width: stage.width(), height: stage.height() };
}

// 클라이언트 좌표(드롭 지점)를 스테이지 좌표로 변환
export function clientToStage(clientX, clientY) {
  const box = stage.container().getBoundingClientRect();
  return { x: clientX - box.left, y: clientY - box.top };
}
