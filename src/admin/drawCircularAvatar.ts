/** Размер экспорта круглого аватара (JPEG), как у группового чата. */
export const AVATAR_EXPORT_SIZE = 256;

export function drawCircularAvatar(
  img: HTMLImageElement,
  scale: number,
  outSize: number
): string {
  const canvas = document.createElement("canvas");
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const minSide = Math.min(iw, ih);
  const clamped = Math.min(Math.max(scale, 1), 3);
  const viewSize = minSide / clamped;
  const sx = Math.max(0, (iw - viewSize) / 2);
  const sy = Math.max(0, (ih - viewSize) / 2);
  ctx.beginPath();
  ctx.arc(outSize / 2, outSize / 2, outSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, sx, sy, viewSize, viewSize, 0, 0, outSize, outSize);
  return canvas.toDataURL("image/jpeg", 0.88);
}
