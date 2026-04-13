import type { HapticSettings } from "@/types/haptics";

const STORAGE_KEY = "startavto_haptic_settings";
export const HAPTIC_SETTINGS_EVENT = "startavto:haptic-settings";

/** Импульсы не короче ~25–35 ms — на части Android короткие паттерны не ощущаются или отбрасываются. */
const ANDROID = {
  light: [35] as number[],
  medium: [55] as number[],
  heavy: [120] as number[],
  success: [50, 80, 50] as number[],
  error: [150, 70, 150] as number[],
  selection: [35] as number[],
} as const;

type IosOne = { frequency: number; duration: number; volume: number };

const IOS_LIGHT: IosOne = { frequency: 800, duration: 0.05, volume: 0.08 };
const IOS_MEDIUM: IosOne = { frequency: 800, duration: 0.1, volume: 0.1 };
const IOS_HEAVY: IosOne = { frequency: 600, duration: 0.15, volume: 0.12 };
const IOS_SELECTION: IosOne = { frequency: 1000, duration: 0.03, volume: 0.05 };

let audioCtx: AudioContext | null = null;

export function isVibrationSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return typeof navigator.vibrate === "function" && "vibrate" in navigator;
}

/** Синхронный вызов в обработчике касания; при отказе — один повтор с более длинным импульсом. */
function runAndroidVibrate(pattern: readonly number[]): void {
  if (!isVibrationSupported()) return;
  try {
    const seq = [...pattern];
    const ok = navigator.vibrate(seq);
    if (ok === false && seq.length > 0 && seq[0] < 80) {
      navigator.vibrate([90]);
    }
  } catch {
    /* тихо: старые WebView */
  }
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function loadHapticSettings(): HapticSettings {
  if (typeof localStorage === "undefined") {
    return { enabled: true, soundEnabled: true };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: true, soundEnabled: true };
    const p = JSON.parse(raw) as Partial<HapticSettings>;
    return {
      enabled: typeof p.enabled === "boolean" ? p.enabled : true,
      soundEnabled: typeof p.soundEnabled === "boolean" ? p.soundEnabled : true,
    };
  } catch {
    return { enabled: true, soundEnabled: true };
  }
}

export function saveHapticSettings(next: HapticSettings): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(HAPTIC_SETTINGS_EVENT));
  } catch {
    /* ignore */
  }
}

function ensureAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    return audioCtx;
  } catch (e) {
    console.warn("[haptics] AudioContext unavailable", e);
    return null;
  }
}

/**
 * Разбудить AudioContext (нужно для iOS после жеста пользователя).
 */
export async function activateHaptics(): Promise<void> {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
  } catch (e) {
    console.warn("[haptics] AudioContext.resume failed", e);
  }
}

function playIosTone(freq: number, durationSec: number, volume: number): void {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  void activateHaptics();
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  } catch (e) {
    console.warn("[haptics] playIosTone failed", e);
  }
}

type TriggerOpts = { masterEnabled: boolean; soundEnabled: boolean };

function base(opts: TriggerOpts): boolean {
  if (!opts.masterEnabled) return false;
  if (isIOS()) {
    return opts.soundEnabled;
  }
  return isVibrationSupported();
}

export function light(opts: TriggerOpts): void {
  if (!base(opts)) return;
  if (isIOS()) {
    playIosTone(IOS_LIGHT.frequency, IOS_LIGHT.duration, IOS_LIGHT.volume);
    return;
  }
  runAndroidVibrate(ANDROID.light);
}

export function medium(opts: TriggerOpts): void {
  if (!base(opts)) return;
  if (isIOS()) {
    playIosTone(IOS_MEDIUM.frequency, IOS_MEDIUM.duration, IOS_MEDIUM.volume);
    return;
  }
  runAndroidVibrate(ANDROID.medium);
}

export function heavy(opts: TriggerOpts): void {
  if (!base(opts)) return;
  if (isIOS()) {
    playIosTone(IOS_HEAVY.frequency, IOS_HEAVY.duration, IOS_HEAVY.volume);
    return;
  }
  runAndroidVibrate(ANDROID.heavy);
}

export function success(opts: TriggerOpts): void {
  if (!opts.masterEnabled) return;
  if (isIOS()) {
    if (!opts.soundEnabled) return;
    void activateHaptics();
    playIosTone(800, 0.08, 0.08);
    window.setTimeout(() => playIosTone(1000, 0.08, 0.08), 150);
    return;
  }
  runAndroidVibrate(ANDROID.success);
}

export function error(opts: TriggerOpts): void {
  if (!opts.masterEnabled) return;
  if (isIOS()) {
    if (!opts.soundEnabled) return;
    void activateHaptics();
    playIosTone(400, 0.2, 0.12);
    window.setTimeout(() => playIosTone(350, 0.15, 0.12), 300);
    return;
  }
  runAndroidVibrate(ANDROID.error);
}

export function selection(opts: TriggerOpts): void {
  if (!base(opts)) return;
  if (isIOS()) {
    playIosTone(IOS_SELECTION.frequency, IOS_SELECTION.duration, IOS_SELECTION.volume);
    return;
  }
  runAndroidVibrate(ANDROID.selection);
}

/** Вызов без React: читает настройки из localStorage */
export function hapticLight(): void {
  const s = loadHapticSettings();
  light({ masterEnabled: s.enabled, soundEnabled: s.soundEnabled });
}

export function hapticMedium(): void {
  const s = loadHapticSettings();
  medium({ masterEnabled: s.enabled, soundEnabled: s.soundEnabled });
}

export function hapticHeavy(): void {
  const s = loadHapticSettings();
  heavy({ masterEnabled: s.enabled, soundEnabled: s.soundEnabled });
}

export function hapticSuccess(): void {
  const s = loadHapticSettings();
  success({ masterEnabled: s.enabled, soundEnabled: s.soundEnabled });
}

export function hapticError(): void {
  const s = loadHapticSettings();
  error({ masterEnabled: s.enabled, soundEnabled: s.soundEnabled });
}

export function hapticSelection(): void {
  const s = loadHapticSettings();
  selection({ masterEnabled: s.enabled, soundEnabled: s.soundEnabled });
}
