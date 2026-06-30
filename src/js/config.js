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

// ---------- 문장 카드(text 오브젝트, 서재) ----------
// 폰트: v2는 OS 내장 한글 폰트로(번들 없음). 예쁜 OFL 폰트는 폴리시(G5).
export const TEXT_FONTS = [
  { label: "고딕", value: '"Malgun Gothic","맑은 고딕",sans-serif' },
  { label: "명조", value: 'Batang,"바탕",serif' },
  { label: "세리프", value: "Georgia,serif" },
  { label: "손글씨", value: '"Comic Sans MS",cursive' },
];

// 배경지: 카드 뒤 종이 느낌. fill=null 이면 투명.
export const TEXT_BG = {
  none: { fill: null, stroke: null, strokeWidth: 0, radius: 0, shadow: false },
  paper: { fill: "#f6efe0", stroke: "#e2d4ba", strokeWidth: 1, radius: 8, shadow: true },
  card: { fill: "#ffffff", stroke: "#eadfce", strokeWidth: 1, radius: 12, shadow: true },
  neon: { fill: "#201b36", stroke: "#7a5cff", strokeWidth: 1.5, radius: 12, shadow: true },
};

// 장식 프레임 (배경지 위 테두리 선)
export const TEXT_FRAME = {
  none: { strokeWidth: 0, stroke: null, inset: 0, dash: null },
  line: { strokeWidth: 1.5, stroke: "#b89a76", inset: 8, dash: null },
  dashed: { strokeWidth: 1.5, stroke: "#b89a76", inset: 8, dash: [6, 4] },
};

export const DEFAULT_TEXT_STYLE = {
  font: TEXT_FONTS[0].value,
  fontSize: 22,
  color: "#3a3128",
  align: "left",
  bg: "paper",
  frame: "none",
};

// 새 문장 카드 기본 크기 (거실 등 freeform의 레거시 자유 카드)
export const TEXT_DEFAULT_SIZE = { width: 280, height: 160 };
export const TEXT_PAD = 16;

// ---------- 서재 책장(책등) ----------
export const BOOK = {
  spineW: 38, // 책등 폭
  heightRatio: 0.74, // 책 높이 = 선반 칸 높이 * 비율
  gap: 7, // 책 사이 간격
  colors: ["#c2553f", "#7a5cff", "#3f8f6b", "#c89b3c", "#4a6fa5", "#9a5ba6", "#5b6470"],
};
export const DEFAULT_BOOK_COLOR = BOOK.colors[0];

// 일기 "오늘의 기분 도장" — 수집형 체크(강제·통계 없음, 내키면 찍는 장식)
export const DIARY_STAMPS = ["☀️", "🌧️", "🌙", "✨", "💪", "☕", "🌸", "😴"];
