// 이미지 가져오기 처리: 최대 변 1500px 자동 축소 후 webp로 인코딩 (성능 원칙 1).
import { MAX_EDGE, ACCEPTED_TYPES } from "./config.js";

export function isAcceptedImage(file) {
  return file && ACCEPTED_TYPES.includes(file.type);
}

// File -> { bytes: Uint8Array, width, height }
// 큰 이미지는 최대 변 MAX_EDGE 로 줄여서 webp로 인코딩한다.
export async function downscaleToWebp(file) {
  const bitmap = await createImageBitmap(file);
  const { width: ow, height: oh } = bitmap;

  const scale = Math.min(1, MAX_EDGE / Math.max(ow, oh));
  const w = Math.max(1, Math.round(ow * scale));
  const h = Math.max(1, Math.round(oh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9)
  );
  const buf = await blob.arrayBuffer();
  return { bytes: new Uint8Array(buf), width: w, height: h };
}

// blob URL -> HTMLImageElement (로드 완료된)
export function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
