import {
  getNotificationSettings,
  isInDoNotDisturbPeriod,
  isLikelyMobileVibrationDevice,
} from "@/admin/notificationSettings";
import type { ChatMessage } from "@/types";

/** Один раз на сообщение: глобальная лента + открытый чат не дублируют звук. */
const dedupeIncomingAlertMessageIds = new Set<string>();
const DEDUPE_INCOMING_ALERT_CAP = 8000;

let audioCtx: AudioContext | null = null;

/** Кэш HTMLAudio под выбранный пользователем data URL */
let cachedIncomingFile: { url: string; audio: HTMLAudioElement } | null = null;

/**
 * Пресеты хранятся как `/sounds/incoming/…` (от корня сайта). Для деплоя с `base` в Vite
 * нужно тот же префикс, что у `outgoingChatSound` (`import.meta.env.BASE_URL`).
 */
function resolveIncomingSoundUrlForPlayback(raw: string): string {
  const u = raw.trim();
  if (!u) return "";
  if (u.startsWith("data:") || u.startsWith("blob:")) return u;
  if (u.startsWith("/") && typeof window !== "undefined") {
    const path = u.replace(/^\/+/, "");
    return new URL(path, `${window.location.origin}${import.meta.env.BASE_URL}`).href;
  }
  return u;
}

/** Вызов после жеста пользователя — снимает блокировку Web Audio для запасного бипа. */
export function resumeIncomingBeepContext(): void {
  const ctx = getBeepContext();
  if (ctx) void ctx.resume().catch(() => {});
}

function getBeepContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx || audioCtx.state === "closed") audioCtx = new Ctor();
  return audioCtx;
}

function playIncomingBeep(volume01: number): void {
  const v = Math.max(0, Math.min(1, volume01));
  if (v <= 0) return;
  try {
    const ctx = getBeepContext();
    if (!ctx) return;
    void ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.12 * v, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.1);
  } catch {
    /* автозапуск / ограничения */
  }
}

/**
 * Звук входящего сообщения: свой файл (data URL), пресет из `public/sounds/incoming/` или короткий сигнал.
 */
export function playIncomingMessageSound(
  volume01: number,
  customDataUrl?: string | null,
  presetAssetPath?: string | null
): void {
  const v = Math.max(0, Math.min(1, volume01));
  if (v <= 0) return;
  void resumeIncomingBeepContext();
  const data = customDataUrl?.trim() ?? "";
  const asset = presetAssetPath?.trim() ?? "";
  const rawUrl = data.length > 0 ? data : asset.length > 0 ? asset : "";
  if (!rawUrl) {
    cachedIncomingFile = null;
    playIncomingBeep(v);
    return;
  }
  if (typeof window === "undefined") return;
  const url = resolveIncomingSoundUrlForPlayback(rawUrl);
  try {
    if (!cachedIncomingFile || cachedIncomingFile.url !== url) {
      cachedIncomingFile = { url, audio: new Audio(url) };
      cachedIncomingFile.audio.preload = "auto";
    }
    const a = cachedIncomingFile.audio;
    a.volume = v;
    a.currentTime = 0;
    void a.play().catch(() => {
      playIncomingBeep(v);
    });
  } catch {
    playIncomingBeep(v);
  }
}

function formatMessagePreview(m: ChatMessage): string {
  if (m.type === "text") {
    const t = (m.text ?? "").trim().replace(/\s+/g, " ");
    return t.length > 160 ? `${t.slice(0, 157)}…` : t || "Сообщение";
  }
  if (m.type === "image") return "Фото";
  if (m.type === "voice") return "Голосовое сообщение";
  if (m.type === "file") return m.fileName ? `Файл: ${m.fileName}` : "Файл";
  return "Сообщение";
}

export function runIncomingMessageAlerts(
  uid: string,
  params: {
    message: ChatMessage;
    senderLabel: string;
    chatTitle: string;
    documentHidden: boolean;
  }
): void {
  if (!uid) return;
  const mid = params.message.id;
  if (dedupeIncomingAlertMessageIds.has(mid)) return;
  dedupeIncomingAlertMessageIds.add(mid);
  if (dedupeIncomingAlertMessageIds.size > DEDUPE_INCOMING_ALERT_CAP) {
    dedupeIncomingAlertMessageIds.clear();
    dedupeIncomingAlertMessageIds.add(mid);
  }

  const s = getNotificationSettings(uid);
  if (isInDoNotDisturbPeriod(s)) return;

  if (s.soundIncomingEnabled) {
    playIncomingMessageSound(
      s.chatSoundVolume,
      s.incomingMessageSoundDataUrl,
      s.incomingMessageSoundAssetPath
    );
  }

  if (s.vibrationIncomingEnabled && isLikelyMobileVibrationDevice()) {
    try {
      navigator.vibrate([100, 45, 120]);
    } catch {
      /* */
    }
  }

  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (s.browserNotifyOnlyWhenBackground && !params.documentHidden) return;

  const title = `Новое сообщение от ${params.senderLabel}`;
  const body = s.browserNotifyShowMessagePreview
    ? formatMessagePreview(params.message)
    : `Чат: ${params.chatTitle}`;

  try {
    new Notification(title, { body, tag: params.message.chatId, silent: true });
  } catch {
    /* */
  }
}
