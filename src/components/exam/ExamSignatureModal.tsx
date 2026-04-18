import { useCallback, useEffect, useRef, useState } from "react";

type ExamSignatureModalProps = {
  open: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
};

/** Уменьшает PNG для хранения и вставки в лист (не раздувает документ). */
async function shrinkSignaturePng(dataUrl: string, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Изображение подписи"));
    img.src = dataUrl;
  });
}

function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return true;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (r < 248 || g < 248 || b < 248) return false;
  }
  return true;
}

/**
 * Поле подписи пальцем/мышью: Отмена, Обновить (очистить), Подпись.
 */
export function ExamSignatureModal({ open, title, onCancel, onConfirm }: ExamSignatureModalProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const fitCanvas = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = wrap.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    if (w < 2 || h < 2) return;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2.25;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    const t = window.setTimeout(() => fitCanvas(), 0);
    return () => window.clearTimeout(t);
  }, [open, fitCanvas]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => fitCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, fitCanvas]);

  const pointerToLocal = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }, []);

  const drawLine = useCallback((from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      const p = pointerToLocal(e);
      lastRef.current = p;
    },
    [pointerToLocal]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current || !lastRef.current) return;
      e.preventDefault();
      const p = pointerToLocal(e);
      drawLine(lastRef.current, p);
      lastRef.current = p;
    },
    [drawLine, pointerToLocal]
  );

  const endStroke = useCallback(() => {
    drawingRef.current = false;
    lastRef.current = null;
  }, []);

  const handleClear = useCallback(() => {
    setErr(null);
    fitCanvas();
  }, [fitCanvas]);

  const handleConfirm = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (isCanvasBlank(canvas)) {
      setErr("Поставьте подпись в поле выше");
      return;
    }
    setErr(null);
    try {
      const raw = canvas.toDataURL("image/png");
      const small = await shrinkSignaturePng(raw, 220, 72);
      onConfirm(small);
    } catch {
      setErr("Не удалось сохранить подпись");
    }
  }, [onConfirm]);

  if (!open) return null;

  return (
    <div className="exam-signature-modal-backdrop" role="presentation">
      <div
        className="exam-signature-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-signature-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="exam-signature-title" className="exam-signature-modal__title">
          {title}
        </h3>
        <p className="exam-signature-modal__hint">Проведите пальцем или пером по полю ниже</p>
        <div ref={wrapRef} className="exam-signature-modal__pad-wrap">
          <canvas
            ref={canvasRef}
            className="exam-signature-modal__pad"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
            onPointerLeave={() => {
              if (drawingRef.current) endStroke();
            }}
          />
        </div>
        {err ? (
          <p className="form-error exam-signature-modal__err" role="alert">
            {err}
          </p>
        ) : null}
        <div className="exam-signature-modal__actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={handleClear}>
            Обновить
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleConfirm()}>
            Подпись
          </button>
        </div>
      </div>
    </div>
  );
}
