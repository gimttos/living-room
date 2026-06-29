// Konva 캔버스 엔진: 배경 레이어 + 오브젝트 레이어 + UI(트랜스포머) 레이어.
// 방의 모든 "방"이 공유하는 엔진. v1은 image 오브젝트만 다룬다.
import Konva from "konva";
import { room } from "./room.js";
import { THEMES, DEFAULT_THEME } from "./config.js";
import { readImageObjectURL } from "./storage.js";
import { loadImageEl } from "./imageProcessing.js";

let stage, bgLayer, objLayer, uiLayer, transformer;
let onSelectionChange = () => {};
let bgVisible = true; // 오버레이 전시에선 false (순수 떠다니는 이미지)

const nodeById = new Map(); // id -> Konva.Image
const urlById = new Map(); // id -> objectURL (해제용)

let cropState = null; // 크롭 모드 상태

// ---------- 초기화 ----------
export function initCanvas({ container, onSelectionChange: cb }) {
  onSelectionChange = cb || (() => {});

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

  const floorY = Math.round(h * 0.74);

  // 벽 (세로 그라데이션)
  bgLayer.add(
    new Konva.Rect({
      x: 0,
      y: 0,
      width: w,
      height: floorY,
      fillLinearGradientStartPoint: { x: 0, y: 0 },
      fillLinearGradientEndPoint: { x: 0, y: floorY },
      fillLinearGradientColorStops: [0, t.wallTop, 1, t.wallBottom],
    })
  );
  // 바닥
  bgLayer.add(
    new Konva.Rect({ x: 0, y: floorY, width: w, height: h - floorY, fill: t.floor })
  );
  // 선반 한 줄 + 옅은 그림자
  const shelfY = Math.round(h * 0.5);
  bgLayer.add(
    new Konva.Rect({ x: 0, y: shelfY + 10, width: w, height: 14, fill: t.shelfShadow })
  );
  bgLayer.add(
    new Konva.Rect({ x: 0, y: shelfY, width: w, height: 10, fill: t.shelf })
  );

  bgLayer.batchDraw();
}

export function setTheme(themeKey) {
  if (!THEMES[themeKey]) return;
  room.setBackground({ type: "theme", value: themeKey });
  renderBackground();
}

// ---------- 오브젝트 생성/로드 ----------
// 방 데이터로부터 모든 오브젝트를 그린다 (zIndex 순).
export async function buildFromRoom() {
  const objs = [...room.data.objects].sort(
    (a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)
  );
  for (const obj of objs) {
    if (obj.type === "image") await mountImageNode(obj);
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
  return { id: obj.id, locked: !!obj.locked, filters: { ...obj.filters }, hasCrop: !!obj.crop };
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
