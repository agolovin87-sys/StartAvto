import { useEffect, useRef, useState } from "react";
import { DRIVE_LIVE_DURATION_MIN, DRIVE_LIVE_DURATION_MS } from "@/lib/driveSession";

const CX = 100;
const CY = 100;

/** Подписи шкалы: 0…45; с 60-й минуты — 60, 75, 90. */
function greenSweepDegFromElapsedMinutes(elapsedMin: number): number {
  const t = Math.min(Math.max(elapsedMin, 0), DRIVE_LIVE_DURATION_MIN);
  if (t <= 60) {
    if (t <= 45) {
      if (t <= 15) return (t / 15) * 90;
      if (t <= 30) return 90 + ((t - 15) / 15) * 90;
      return 180 + ((t - 30) / 15) * 90;
    }
    return 270 + ((t - 45) / 15) * 90;
  }
  const u = Math.min(t - 60, 30);
  if (u <= 15) return (u / 15) * 90;
  return 90 + ((u - 15) / 15) * 90;
}

function formatElapsedUp(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const capped = Math.min(s, DRIVE_LIVE_DURATION_MIN * 60);
  const m = Math.floor(capped / 60);
  const r = capped % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** Одна перекидная карточка: две половины цифры, шарниры, переворот верхней при смене. */
function FlipDigitCard({ digit, boot }: { digit: string; boot: boolean }) {
  return (
    <div className={boot ? "flip-card flip-card--boot" : "flip-card"}>
      <i className="flip-card__hinge flip-card__hinge--left" aria-hidden />
      <i className="flip-card__hinge flip-card__hinge--right" aria-hidden />
      <div className="flip-card__split" aria-hidden />
      <div className="flip-card__pane flip-card__pane--bottom">
        <span key={`b-${digit}`} className="flip-card__num">
          {digit}
        </span>
      </div>
      <div key={`t-${digit}`} className="flip-card__pane flip-card__pane--top">
        <span className="flip-card__num">{digit}</span>
      </div>
    </div>
  );
}

function DriveLiveFlipClock({ elapsedSec }: { elapsedSec: number }) {
  const [boot, setBoot] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setBoot(false), 120);
    return () => window.clearTimeout(t);
  }, []);

  const str = formatElapsedUp(elapsedSec);
  const [mm, ss] = str.split(":");

  return (
    <div className="drive-live-timer-flip-clock">
      <FlipDigitCard digit={mm[0]!} boot={boot} />
      <FlipDigitCard digit={mm[1]!} boot={boot} />
      <span className="drive-live-timer-flip-sep" aria-hidden>
        :
      </span>
      <FlipDigitCard digit={ss[0]!} boot={boot} />
      <FlipDigitCard digit={ss[1]!} boot={boot} />
    </div>
  );
}

/** Обод и минутная шкала: полный круг = 60 мин (каждая минута + усиленные 5 и 15). */
const DIAL_BEZEL_R = 99.35;
const SCALE_R_OUT = 99;
/** Внешний край зелёной полосы = конец засечек (совпадает с HTML-conic по радиусу). */
const GREEN_RING_OUTER_R = SCALE_R_OUT;
/**
 * Внутренний край зелёного кольца — как у `.drive-live-timer-conic-hole { width: calc(100% - 22px) }`
 * при ширине блока 164px (см. .drive-live-timer-chart).
 */
const GREEN_RING_INNER_R = SCALE_R_OUT * (164 - 22) / 164;
const SCALE_R_IN_MAJOR = 71;
/** Подписи на зелёной полосе. */
const SCALE_RING1_LABEL_R =
  GREEN_RING_INNER_R + (GREEN_RING_OUTER_R - GREEN_RING_INNER_R) * 0.52;
const SCALE_RING2_LABEL_R =
  GREEN_RING_INNER_R + (GREEN_RING_OUTER_R - GREEN_RING_INNER_R) * 0.62;
/** Ползунок на конце зелёной дуги — на полосе, ближе к внешнему краю. */
const GREEN_SWEEP_END_R =
  GREEN_RING_INNER_R + (GREEN_RING_OUTER_R - GREEN_RING_INNER_R) * 0.72;

function sweepEndKnob(sweepDeg: number): { x: number; y: number } {
  const rad = (sweepDeg / 360) * 2 * Math.PI;
  return {
    x: CX + GREEN_SWEEP_END_R * Math.sin(rad),
    y: CY - GREEN_SWEEP_END_R * Math.cos(rad),
  };
}

function minuteLabelPos(clockMinute: number, r: number): { x: number; y: number } {
  const a = (clockMinute / 60) * 2 * Math.PI;
  return {
    x: CX + r * Math.sin(a),
    y: CY - r * Math.cos(a),
  };
}
const SCALE_R_IN_MID = 87;
const SCALE_R_IN_MINOR = 94;

const CLOCK_MINUTE_INDICES = Array.from({ length: 60 }, (_, i) => i);

function tickLineCoordsClockMinute(clockMinute: number): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tier: "major" | "mid" | "minor";
} {
  const a = (clockMinute / 60) * 2 * Math.PI;
  const sx = Math.sin(a);
  const cy = Math.cos(a);
  let rIn: number;
  let tier: "major" | "mid" | "minor";
  if (clockMinute % 15 === 0) {
    rIn = SCALE_R_IN_MAJOR;
    tier = "major";
  } else if (clockMinute % 5 === 0) {
    rIn = SCALE_R_IN_MID;
    tier = "mid";
  } else {
    rIn = SCALE_R_IN_MINOR;
    tier = "minor";
  }
  return {
    x1: CX + rIn * sx,
    y1: CY - rIn * cy,
    x2: CX + SCALE_R_OUT * sx,
    y2: CY - SCALE_R_OUT * cy,
    tier,
  };
}

export function DriveLiveTimerDial({
  effectiveElapsedMs,
  isPaused,
  awaitingStudentAck,
  onComplete,
}: {
  /** Уже с учётом пауз. */
  effectiveElapsedMs: number;
  isPaused: boolean;
  /** Инструктор нажал «Начать», курсант ещё не подтвердил — таймер на 0. */
  awaitingStudentAck?: boolean;
  onComplete: () => void;
}) {
  const endedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const elapsedMs = Math.min(Math.max(0, effectiveElapsedMs), DRIVE_LIVE_DURATION_MS);
  const remainingMs = Math.max(0, DRIVE_LIVE_DURATION_MS - elapsedMs);
  const elapsedSec = elapsedMs / 1000;
  const elapsedMin = elapsedMs / 60000;

  useEffect(() => {
    if (isPaused || remainingMs > 0 || endedRef.current) return;
    endedRef.current = true;
    onCompleteRef.current();
  }, [isPaused, remainingMs, effectiveElapsedMs]);

  const sweepDeg = greenSweepDegFromElapsedMinutes(elapsedMin);
  const sweepKnob = sweepEndKnob(sweepDeg);

  const awaiting = awaitingStudentAck === true;
  return (
    <div
      className={`drive-live-timer${isPaused ? " drive-live-timer--paused" : ""}${
        awaiting ? " drive-live-timer--awaiting-ack" : ""
      }`}
    >
      <p className="drive-live-timer-title">
        Текущее вождение:{" "}
        <span className="drive-live-timer-title-status">
          {awaiting ? "ожидание подтверждения курсанта…" : isPaused ? "на паузе…" : "в процессе…"}
        </span>
      </p>
      <div className="drive-live-timer-chart">
        <div
          className="drive-live-timer-conic-ring"
          style={{
            background: `conic-gradient(from 0deg, #4ade80 0deg, #4ade80 ${sweepDeg}deg, rgba(255, 255, 255, 0.38) ${sweepDeg}deg, rgba(255, 255, 255, 0.38) 360deg)`,
          }}
        />
        <div className="drive-live-timer-conic-hole" />
        <svg
          className="drive-live-timer-svg drive-live-timer-svg--overlay"
          viewBox="-32 -32 264 264"
        >
          <circle
            className="drive-live-timer-dial-bezel"
            cx={CX}
            cy={CY}
            r={DIAL_BEZEL_R}
            fill="none"
          />
          <g className="drive-live-timer-scale" aria-hidden>
            {CLOCK_MINUTE_INDICES.map((m) => {
              const { x1, y1, x2, y2, tier } = tickLineCoordsClockMinute(m);
              return (
                <line
                  key={`tick-${m}`}
                  className={
                    tier === "major"
                      ? "drive-live-timer-scale-tick drive-live-timer-scale-tick--major"
                      : tier === "mid"
                        ? "drive-live-timer-scale-tick drive-live-timer-scale-tick--mid"
                        : "drive-live-timer-scale-tick drive-live-timer-scale-tick--minor"
                  }
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  strokeLinecap="round"
                />
              );
            })}
          </g>
          <g className="drive-live-timer-min-labels drive-live-timer-min-labels--ring1" aria-hidden>
            {(
              [
                [0, "0"],
                [15, "15"],
                [30, "30"],
                [45, "45"],
              ] as const
            ).map(([clockMinute, label]) => {
              const { x, y } = minuteLabelPos(clockMinute, SCALE_RING1_LABEL_R);
              return (
                <text
                  key={`r1-${clockMinute}`}
                  className="drive-live-timer-min-label drive-live-timer-min-label--ring1"
                  x={x}
                  y={y}
                  fontSize={17}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {label}
                </text>
              );
            })}
          </g>
          {elapsedMin >= 60 ? (
            <g className="drive-live-timer-min-labels drive-live-timer-min-labels--ring2" aria-hidden>
              {(
                [
                  [0, "60"],
                  [15, "75"],
                  [30, "90"],
                ] as const
              ).map(([clockMinute, label]) => {
                const { x, y } = minuteLabelPos(clockMinute, SCALE_RING2_LABEL_R);
                return (
                  <text
                    key={`r2-${label}`}
                    className="drive-live-timer-min-label drive-live-timer-min-label--ring2"
                    x={x}
                    y={y}
                    fontSize={17}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {label}
                  </text>
                );
              })}
            </g>
          ) : null}
          <g
            className="drive-live-timer-sweep-end-knob"
            transform={`translate(${sweepKnob.x}, ${sweepKnob.y}) rotate(${sweepDeg})`}
            aria-hidden
          >
            <path
              className="drive-live-timer-sweep-end-arrow"
              d="M 0 -12 L -7 4 L 7 4 Z"
            />
          </g>
        </svg>
        <div className="drive-live-timer-flip-clock-wrap">
          <DriveLiveFlipClock elapsedSec={elapsedSec} />
        </div>
      </div>
    </div>
  );
}
