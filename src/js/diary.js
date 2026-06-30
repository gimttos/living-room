// 일기 저장 (diary.json @ AppData). 날짜별 페이지.
// 설계 철학: 트래커 아님 — 연속일/알림/미작성 표시 없음. 안 쓴 날은 빈 페이지일 뿐.
import { readTextFile, writeTextFile, exists, BaseDirectory } from "@tauri-apps/plugin-fs";
import { DIARY_PATH } from "./config.js";

const APP = { baseDir: BaseDirectory.AppData };

// entries: { "YYYY-MM-DD": { text, moodStamp } }
let entries = {};
let saveTimer = null;

export async function loadDiary() {
  try {
    if (await exists(DIARY_PATH, APP)) {
      const obj = JSON.parse(await readTextFile(DIARY_PATH, APP));
      if (obj && typeof obj === "object") entries = obj;
    }
  } catch (e) {
    console.warn("일기 로드 실패, 빈 일기로 시작:", e);
    entries = {};
  }
  return entries;
}

export function getEntry(date) {
  return entries[date] || { text: "", moodStamp: null };
}

// 내용이 있는 날짜들(오름차순) — "구경" 네비게이션용
export function getEntryDates() {
  return Object.keys(entries)
    .filter((d) => entries[d]?.text?.trim() || entries[d]?.moodStamp)
    .sort();
}

export function setEntry(date, patch) {
  const cur = entries[date] || { text: "", moodStamp: null };
  const next = { ...cur, ...patch };
  if (!next.text?.trim() && !next.moodStamp) {
    delete entries[date]; // 빈 항목은 보관 안 함 (죄책감 흔적 0)
  } else {
    entries[date] = next;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDiary, 500);
}

export async function saveDiary() {
  clearTimeout(saveTimer);
  try {
    await writeTextFile(DIARY_PATH, JSON.stringify(entries, null, 2), APP);
  } catch (e) {
    console.error("일기 저장 실패:", e);
  }
}
