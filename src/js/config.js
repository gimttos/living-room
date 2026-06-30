// 전역 상수 & 테마 정의

// 성능 원칙: 올릴 때 최대 변 1500px로 축소
export const MAX_EDGE = 1500;

// 저장 디바운스 (ms)
export const AUTOSAVE_DELAY = 600;

// 방 JSON 스키마 버전 (v2: 멀티룸 + text 오브젝트)
export const SCHEMA_VERSION = 2;

// 앱 데이터 폴더 내 경로 (BaseDirectory.AppData 기준 상대경로)
export const ROOMS_DIR = "rooms";
export const IMAGES_DIR = "assets/images";
export const SETTINGS_PATH = "settings.json";
export const DIARY_PATH = "diary.json";

// 방별 상태 파일 경로
export const roomPath = (id) => `${ROOMS_DIR}/${id}.json`;

// 방 레지스트리: "엔진 하나, 방은 인스턴스" (스펙 3장).
// kind = 배경/허용 어포던스 분기 키. 새 방은 여기에 한 줄 추가하면 됨.
export const ROOMS = [
  { id: "living-room", name: "거실", kind: "freeform" },
  { id: "study", name: "서재", kind: "study" },
];
export const DEFAULT_ROOM = "living-room";

// 허용 이미지 타입 (정적만)
export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

// 배경 테마: Konva 배경 레이어가 이 값으로 벽/바닥/선반을 그린다.
export const THEMES = {
  warm: {
    name: "따뜻한 낮",
    wallTop: "#f7efe4",
    wallBottom: "#efe1d0",
    floor: "#d8c1a6",
    shelf: "#b89a76",
    shelfShadow: "rgba(120, 90, 60, 0.18)",
  },
  night: {
    name: "고요한 밤",
    wallTop: "#2a2620",
    wallBottom: "#201c17",
    floor: "#15110d",
    shelf: "#3a322a",
    shelfShadow: "rgba(0, 0, 0, 0.35)",
  },
};

export const DEFAULT_THEME = "warm";
