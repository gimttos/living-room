// 이미지 가져오기: OS 드래그&드롭 + "이미지 추가" 버튼(파일 선택).
// Tauri 네이티브 드롭을 끈 상태(dragDropEnabled:false)라 웹뷰가 실제 File을 받는다.
import { room } from "./room.js";
import { isAcceptedImage, downscaleToWebp } from "./imageProcessing.js";
import { saveImageBytes } from "./storage.js";
import { addImageObject, getStageSize, clientToStage } from "./canvas.js";

const DEFAULT_DISPLAY_W = 360;

export function initImports({ fileInput, dropTarget, addButton, onAdded }) {
  addButton.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    await processFiles([...fileInput.files]);
    fileInput.value = "";
  });

  // 드래그&드롭
  dropTarget.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropTarget.classList.add("is-dragover");
  });
  dropTarget.addEventListener("dragleave", (e) => {
    if (e.target === dropTarget) dropTarget.classList.remove("is-dragover");
  });
  dropTarget.addEventListener("drop", async (e) => {
    e.preventDefault();
    dropTarget.classList.remove("is-dragover");
    const files = [...(e.dataTransfer?.files || [])];
    const at = clientToStage(e.clientX, e.clientY);
    await processFiles(files, at);
  });

  async function processFiles(files, dropPoint) {
    if (room.data.kind === "study") return; // 서재는 책만 (이미지 안 받음)
    const images = files.filter(isAcceptedImage);
    if (images.length === 0) return;
    let i = 0;
    for (const file of images) {
      try {
        await addOne(file, dropPoint, i++);
      } catch (err) {
        console.error("이미지 추가 실패:", file.name, err);
      }
    }
    onAdded?.();
  }

  async function addOne(file, dropPoint, indexInBatch) {
    const { bytes, width, height } = await downscaleToWebp(file);
    const uuid = crypto.randomUUID();
    const src = await saveImageBytes(uuid, bytes);

    const dispW = Math.min(width, DEFAULT_DISPLAY_W);
    const dispH = (dispW * height) / width;

    const { width: sw, height: sh } = getStageSize();
    const cascade = (room.data.objects.length + indexInBatch) * 24;
    let x, y;
    if (dropPoint) {
      x = dropPoint.x - dispW / 2 + indexInBatch * 24;
      y = dropPoint.y - dispH / 2 + indexInBatch * 24;
    } else {
      x = sw / 2 - dispW / 2 + (cascade % 160) - 80;
      y = sh / 2 - dispH / 2 + (cascade % 120) - 60;
    }

    const obj = {
      id: uuid,
      type: "image",
      src,
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(dispW),
      height: Math.round(dispH),
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      zIndex: room.nextZIndex(),
      crop: null,
      filters: { brightness: 0, saturation: 0, hue: 0, contrast: 0 },
      locked: false,
    };
    await addImageObject(obj, { select: true });
  }
}
