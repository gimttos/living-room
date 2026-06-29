// Tauri fs 플러그인을 감싼 저장 계층.
// 이미지는 appDataDir/assets/images 에 실제 파일로, 방 상태는 rooms/living-room.json 으로.
// (성능 원칙 3: JSON엔 좌표만, 이미지는 파일로. base64 금지.)
import {
  writeFile,
  readFile,
  writeTextFile,
  readTextFile,
  mkdir,
  exists,
  remove,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";
import { ROOM_PATH, ROOMS_DIR, IMAGES_DIR } from "./config.js";

const APP = { baseDir: BaseDirectory.AppData };

// 시작 시 폴더 보장
export async function ensureDirs() {
  await mkdir(ROOMS_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
  await mkdir(IMAGES_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
}

// 축소된 webp 바이트를 저장하고 상대 경로(src)를 돌려준다.
export async function saveImageBytes(uuid, bytes) {
  const rel = `${IMAGES_DIR}/${uuid}.webp`;
  await writeFile(rel, bytes, APP);
  return rel;
}

// 저장된 이미지 파일을 blob URL로 읽어온다 (Konva/<img>에서 사용).
// 에셋 프로토콜 설정 없이 동작하도록 바이트→Blob 방식 사용.
export async function readImageObjectURL(src) {
  const bytes = await readFile(src, APP);
  const blob = new Blob([bytes], { type: "image/webp" });
  return URL.createObjectURL(blob);
}

export async function deleteImageFile(src) {
  try {
    if (await exists(src, APP)) await remove(src, APP);
  } catch (e) {
    console.warn("이미지 파일 삭제 실패:", src, e);
  }
}

export async function saveRoomJson(roomObj) {
  await writeTextFile(ROOM_PATH, JSON.stringify(roomObj, null, 2), APP);
}

export async function loadRoomJson() {
  if (!(await exists(ROOM_PATH, APP))) return null;
  try {
    const text = await readTextFile(ROOM_PATH, APP);
    return JSON.parse(text);
  } catch (e) {
    console.error("방 JSON 파싱 실패:", e);
    return null;
  }
}
