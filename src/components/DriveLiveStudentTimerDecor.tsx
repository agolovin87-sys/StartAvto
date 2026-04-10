import { useEffect, useRef, useState } from "react";
import type { DriveSlot } from "@/types";
import { driveLiveEffectiveElapsedMs } from "@/lib/driveLiveElapsed";
import { DRIVE_LIVE_DURATION_MIN, DRIVE_LIVE_DURATION_MS } from "@/lib/driveSession";

/** Как у инструктора на циферблате: прошедшее время, мм:сс, не больше 90 мин. */
function formatElapsedMmSs(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const capped = Math.min(s, DRIVE_LIVE_DURATION_MIN * 60);
  const m = Math.floor(capped / 60);
  const r = capped % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

const ARC_R = 28;
/** Горизонталь хорды дуги (меньше y — дуга выше, больше воздуха над часами). */
const ARC_CHORD_Y = 39;
/** Длина верхней полуокружности (π·r). */
const ARC_LEN = Math.PI * ARC_R;
const ARC_LEFT_X = 36 - ARC_R;
const ARC_RIGHT_X = 36 + ARC_R;
const GLASS_PATH =
  "M 26 28.5 H 46 C 46 32 43 35 39.8 37.75 C 43 40.2 46 43.8 46 47.5 H 26 C 26 43.8 29 40.2 32.2 37.75 C 29 35 26 32 26 28.5 Z";

/**
 * Справа в карточке «График вождения»: полукруг шкалы 90 мин, песочные часы (переворот каждые 5 с),
 * цифры мм:сс — тот же расчёт, что у инструктора (`driveLiveEffectiveElapsedMs`).
 */
export function DriveLiveStudentTimerDecor({
  slot,
  nowMs,
  effectiveElapsedMs: effectiveElapsedMsProp,
}: {
  slot: DriveSlot;
  nowMs: number;
  /** Если задано (например у инструктора с учётом паузы) — вместо расчёта из слота и `nowMs`. */
  effectiveElapsedMs?: number;
}) {
  const [flip180, setFlip180] = useState(false);
  const [displayTimeLabel, setDisplayTimeLabel] = useState("00:00");
  const [prevTimeLabel, setPrevTimeLabel] = useState("00:00");
  /** Индексы символов `мм:сс`, у которых цифра изменилась и нужна анимация (двоеточие не входит). */
  const [flippingDigitIndices, setFlippingDigitIndices] = useState<Set<number>>(() => new Set());
  const digitsFlipRafRef = useRef<number | null>(null);
  const digitsFlipTimeoutRef = useRef<number | null>(null);
  /** Последнее отображённое время после завершения анимации (не менять в середине тика — иначе ломается flip). */
  const settledTimeLabelRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const id = window.setInterval(() => setFlip180((v) => !v), 5000);
    return () => window.clearInterval(id);
  }, []);

  const effectiveMs =
    effectiveElapsedMsProp !== undefined
      ? effectiveElapsedMsProp
      : driveLiveEffectiveElapsedMs(slot, nowMs);
  const elapsedMs = Math.min(Math.max(0, effectiveMs), DRIVE_LIVE_DURATION_MS);
  const progress = DRIVE_LIVE_DURATION_MS > 0 ? elapsedMs / DRIVE_LIVE_DURATION_MS : 0;
  const dashOffset = ARC_LEN * (1 - progress);

  const timeLabel = formatElapsedMmSs(elapsedMs / 1000);

  useEffect(() => {
    if (settledTimeLabelRef.current === null) {
      settledTimeLabelRef.current = timeLabel;
      setDisplayTimeLabel(timeLabel);
      setPrevTimeLabel(timeLabel);
      return;
    }
    if (timeLabel === settledTimeLabelRef.current) return;

    if (digitsFlipRafRef.current != null) {
      cancelAnimationFrame(digitsFlipRafRef.current);
      digitsFlipRafRef.current = null;
    }
    if (digitsFlipTimeoutRef.current != null) {
      window.clearTimeout(digitsFlipTimeoutRef.current);
      digitsFlipTimeoutRef.current = null;
    }

    const fromLabel = settledTimeLabelRef.current;
    const toLabel = timeLabel;
    const flipIndices = new Set<number>();
    const len = Math.max(fromLabel.length, toLabel.length);
    for (let i = 0; i < len; i++) {
      const a = fromLabel[i];
      const b = toLabel[i];
      if (a === ":" || b === ":") continue;
      if (a !== b) flipIndices.add(i);
    }

    setPrevTimeLabel(fromLabel);
    setDisplayTimeLabel(toLabel);
    setFlippingDigitIndices(new Set());

    if (flipIndices.size === 0) {
      settledTimeLabelRef.current = toLabel;
      setPrevTimeLabel(toLabel);
      return;
    }

    const raf1 = requestAnimationFrame(() => {
      digitsFlipRafRef.current = requestAnimationFrame(() => {
        digitsFlipRafRef.current = null;
        setFlippingDigitIndices(flipIndices);
      });
    });

    digitsFlipTimeoutRef.current = window.setTimeout(() => {
      digitsFlipTimeoutRef.current = null;
      settledTimeLabelRef.current = toLabel;
      setPrevTimeLabel(toLabel);
      setFlippingDigitIndices(new Set());
    }, 400);

    return () => {
      cancelAnimationFrame(raf1);
      if (digitsFlipRafRef.current != null) {
        cancelAnimationFrame(digitsFlipRafRef.current);
        digitsFlipRafRef.current = null;
      }
      if (digitsFlipTimeoutRef.current != null) {
        window.clearTimeout(digitsFlipTimeoutRef.current);
        digitsFlipTimeoutRef.current = null;
      }
    };
  }, [timeLabel]);

  return (
    <div
      className="drive-live-student-timer-decor"
      role="timer"
      aria-label={`Прошло времени вождения ${timeLabel}`}
    >
      <div className="drive-live-student-timer-decor__content">
      <svg className="drive-live-student-timer-decor__svg" viewBox="0 0 72 64" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="drive-live-student-arc-fg" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(134, 239, 172, 0.98)" />
            <stop offset="100%" stopColor="rgba(34, 197, 94, 0.78)" />
          </linearGradient>
          <linearGradient id="drive-live-student-glass-fill" x1="36" y1="27" x2="36" y2="49" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(74, 222, 128, 0.3)" />
            <stop offset="42%" stopColor="rgba(34, 197, 94, 0.14)" />
            <stop offset="58%" stopColor="rgba(34, 197, 94, 0.14)" />
            <stop offset="100%" stopColor="rgba(22, 163, 74, 0.28)" />
          </linearGradient>
        </defs>
        {/* Трек: верхняя полуокружность слева направо */}
        <path
          className="drive-live-student-timer-decor__arc-track"
          d={`M ${ARC_LEFT_X} ${ARC_CHORD_Y} A ${ARC_R} ${ARC_R} 0 0 1 ${ARC_RIGHT_X} ${ARC_CHORD_Y}`}
          fill="none"
          stroke="rgba(74, 222, 128, 0.36)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          className="drive-live-student-timer-decor__arc-fill"
          d={`M ${ARC_LEFT_X} ${ARC_CHORD_Y} A ${ARC_R} ${ARC_R} 0 0 1 ${ARC_RIGHT_X} ${ARC_CHORD_Y}`}
          fill="none"
          stroke="url(#drive-live-student-arc-fg)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${ARC_LEN}`}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.35s linear" }}
        />
        {/* Песочные часы, центр под дугой */}
        <g
          className="drive-live-student-timer-decor__glass"
          style={{
            transform: `rotate(${flip180 ? 180 : 0}deg)`,
            transformOrigin: "36px 37.75px",
            transition: "transform 0.45s ease-in-out",
          }}
        >
          <path
            className="drive-live-student-timer-decor__glass-shape"
            fill="url(#drive-live-student-glass-fill)"
            stroke="rgba(134, 239, 172, 0.95)"
            strokeWidth="1.45"
            strokeLinejoin="round"
            strokeLinecap="round"
            d={GLASS_PATH}
          />
          <line
            x1="32.4"
            y1="37.75"
            x2="39.6"
            y2="37.75"
            stroke="rgba(134, 239, 172, 0.42)"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </g>
      </svg>
      <span className="drive-live-student-timer-decor__digits" aria-live="off">
        <span className="drive-live-student-timer-decor__digits-track">
          {displayTimeLabel.split("").map((ch, i) => {
            const prevCh = prevTimeLabel[i] ?? ch;
            if (ch === ":") {
              return (
                <span key={`sep-${i}`} className="drive-live-student-timer-decor__digits-sep">
                  :
                </span>
              );
            }
            const cellFlip = flippingDigitIndices.has(i);
            return (
              <span
                key={`cell-${i}`}
                className={`drive-live-student-timer-decor__digit-cell${cellFlip ? " is-flipping" : ""}`}
              >
                <span className="drive-live-student-timer-decor__digits-face drive-live-student-timer-decor__digits-face--prev">
                  {prevCh}
                </span>
                <span className="drive-live-student-timer-decor__digits-face drive-live-student-timer-decor__digits-face--next">
                  {ch}
                </span>
              </span>
            );
          })}
        </span>
      </span>
      </div>
    </div>
  );
}
