// 방 상태 저장소: 직렬화 가능한 평면 데이터(스키마 5-2)를 보관하고,
// 변경 시 디바운스 자동 저장을 한다. Konva 노드는 캔버스가 이 데이터와 동기화한다.
import { SCHEMA_VERSION, AUTOSAVE_DELAY, DEFAULT_THEME } from "./config.js";
import { saveRoomJson, loadRoomJson } from "./storage.js";

function defaultRoom() {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "living-room",
    name: "거실",
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

  async load() {
    const loaded = await loadRoomJson();
    if (loaded && typeof loaded === "object") {
      // 스키마 버전 확인 (v1은 1만 지원; 다르면 일단 그대로 읽되 경고)
      if (loaded.schemaVersion !== SCHEMA_VERSION) {
        console.warn(
          `방 스키마 버전 불일치(파일 ${loaded.schemaVersion} ≠ 앱 ${SCHEMA_VERSION}). 그대로 로드 시도.`
        );
      }
      this.data = { ...defaultRoom(), ...loaded };
      if (!Array.isArray(this.data.objects)) this.data.objects = [];
      if (!this.data.background) this.data.background = { type: "theme", value: DEFAULT_THEME };
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
