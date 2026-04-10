/** Полноэкранная загрузка: спидометр со шкалой 10–100 и стрелкой по прогрессу 0–100%. */

import { useEffect, useState } from "react";

const SCALE_MIN = 10;
const SCALE_MAX = 100;
const CX = 50;
const CY = 50;
const ARC_R = 36;
const LABEL_R = 44;
const TICK_OUT = ARC_R;
const TICK_IN = 31;

const SCALE_MARKS = [10, 40, 60, 80, 100] as const;

type PageLoadingProps = {
  label?: string;
  /** 0–100. Если не передан — плавная имитация до 100 и удержание (пока экран загрузки на экране). */
  progress?: number;
};

function valueToTheta(value: number): number {
  const t = (value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN);
  return Math.PI * (1 - Math.max(0, Math.min(1, t)));
}

/** Поворот стрелки только по верхней дуге: 180° (10) → 270° (середина) → 360°/0° (100), без прохода через 90° (вниз). */
function needleRotationDeg(progressPercent: number): number {
  const p = Math.max(0, Math.min(100, progressPercent));
  return 180 + 180 * (p / 100);
}

function useSimulatedProgress(extern?: number): number {
  const [sim, setSim] = useState(0);

  useEffect(() => {
    if (extern !== undefined) return;
    let start = performance.now();
    const durationMs = 2000;
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 2.4;
      setSim(eased * 100);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [extern]);

  return extern !== undefined ? extern : sim;
}

export function PageLoading({ label = "Загрузка…", progress: progressProp }: PageLoadingProps) {
  const raw = useSimulatedProgress(progressProp);
  const progress = Math.max(
    0,
    Math.min(100, progressProp !== undefined ? progressProp : raw)
  );
  const needleDeg = needleRotationDeg(progress);

  return (
    <div className="page-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="page-loading-inner">
        <div
          className="page-loading-speedo"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <svg
            className="page-loading-speedo-svg"
            viewBox="-6 -2 112 64"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              className="page-loading-speedo-arc"
              d={`M ${CX - ARC_R} ${CY} A ${ARC_R} ${ARC_R} 0 0 1 ${CX + ARC_R} ${CY}`}
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <g className="page-loading-speedo-ticks" stroke="currentColor">
              {SCALE_MARKS.map((v) => {
                const th = valueToTheta(v);
                const c = Math.cos(th);
                const s = Math.sin(th);
                const xo = CX + TICK_OUT * c;
                const yo = CY - TICK_OUT * s;
                const xi = CX + TICK_IN * c;
                const yi = CY - TICK_IN * s;
                return (
                  <line
                    key={v}
                    x1={xo}
                    y1={yo}
                    x2={xi}
                    y2={yi}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
            <g className="page-loading-speedo-scale-labels" fill="currentColor">
              {SCALE_MARKS.map((v) => {
                const th = valueToTheta(v);
                const c = Math.cos(th);
                const s = Math.sin(th);
                const lx = CX + LABEL_R * c;
                const ly = CY - LABEL_R * s;
                let anchor: "start" | "middle" | "end" = "middle";
                if (c < -0.35) anchor = "end";
                else if (c > 0.35) anchor = "start";
                return (
                  <text
                    key={v}
                    x={lx}
                    y={ly}
                    textAnchor={anchor}
                    dominantBaseline="middle"
                    className="page-loading-speedo-scale-text"
                  >
                    {v}
                  </text>
                );
              })}
            </g>
            <g transform={`translate(${CX} ${CY})`}>
              <g
                className="page-loading-speedo-needle"
                fill="currentColor"
                stroke="currentColor"
                style={{ transform: `rotate(${needleDeg}deg)` }}
              >
                <line x1="0" y1="0" x2="30" y2="0" strokeWidth="2.5" strokeLinecap="round" />
                <circle className="page-loading-speedo-hub" cx="0" cy="0" r="3.5" />
              </g>
            </g>
          </svg>
        </div>
        <span className="page-loading-label">{label}</span>
      </div>
    </div>
  );
}
