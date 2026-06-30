// 방 상태 저장소: 직렬화 가능한 평면 데이터(스키마 5-2)를 보관하고,
// 변경 시 디바운스 자동 저장을 한다. Konva 노드는 캔버스가 이 데이터와 동기화한다.
import {
  SCHEMA_VERSION,
  AUTOSAVE_DELAY,
  DEFAULT_THEME,
  DEFAULT_ROOM,
  ROOMS,
} from "./config.js";
import { saveRoomJson, loadRoomJson } from "./storage.js";

function roomMeta(id) {
  return ROOMS.find((r) => r.id === id) || { id, name: id, kind: "freeform" };
}

function defaultRoom(id = DEFAULT_ROOM) {
  const meta = roomMeta(id);
  return {
    schemaVersion: SCHEMA_VERSION,
    id: meta.id,
    name: meta.name,
    kind: meta.kind,
    background: { type: "theme", value: DEFAULT_THEME },
    objects: [],
  };
}

export const room = {
  data: defaultRoom(),
  _timer: null,
  _statusCb: null,

  onStatus(cb) {
    this._statusCb = cb;
  },
  _setStatus(s) {
    this._statusCb?.(s);
  },

  // 활성 방 id
  activeId: DEFAULT_ROOM,

  async load(id = DEFAULT_ROOM) {
    this.activeId = id;
    const meta = roomMeta(id);
    const loaded = await loadRoomJson(id);
    if (loaded && typeof loaded === "object") {
      // 마이그레이션(v1→v2는 가산적): 누락 필드 보정 후 현재 버전으로 승격
      this.data = { ...defaultRoom(id), ...loaded };
      this.data.id = id;
      this.data.name = loaded.name || meta.name;
      if (!this.data.kind) this.data.kind = meta.kind;
      if (!Array.isArray(this.data.objects)) this.data.objects = [];
      if (!this.data.background)
        this.data.background = { type: "theme", value: DEFAULT_THEME };
      this.data.schemaVersion = SCHEMA_VERSION;
    } else {
      this.data = defaultRoom(id);
    }
    this._setStatus("saved");
    return this.data;
  },

  // 변경됨 표시 + 디바운스 저장 예약
  touch() {
    this._setStatus("dirty");
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.save(), AUTOSAVE_DELAY);
  },

  async save() {
    clearTimeout(this._timer);
    this._setStatus("saving");
    try {
      await saveRoomJson(this.data);
      this._setStatus("saved");
    } catch (e) {
      console.error("방 저장 실패:", e);
      this._setStatus("error");
    }
  },

  // --- 객체 헬퍼 ---
  addObject(obj) {
    this.data.objects.push(obj);
    this.touch();
  },
  removeObject(id) {
    this.data.objects = this.data.objects.filter((o) => o.id !== id);
    this.touch();
  },
  getObject(id) {
    return this.data.objects.find((o) => o.id === id);
  },
  nextZIndex() {
    return this.data.objects.reduce((m, o) => Math.max(m, o.zIndex ?? 0), 0) + 1;
  },
  setBackground(bg) {
    this.data.background = bg;
    this.touch();
  },
};
