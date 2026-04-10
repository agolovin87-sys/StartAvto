/** Запись голосовых для чата (MediaRecorder). Учёт iOS Safari / Android Chrome. */

export const MIN_VOICE_RECORD_MS = 450;
export const MAX_VOICE_RECORD_MS = 120_000;

type LegacyGUM = (
  c: MediaStreamConstraints,
  ok: (s: MediaStream) => void,
  err: (e: Error) => void
) => void;

/**
 * Safari (в т.ч. старые): `navigator.mediaDevices` может быть без `getUserMedia`.
 * Без этого первый тап не вызывает запрос разрешения так, как ожидается.
 */
export function ensureMediaDevicesPolyfill(): void {
  if (typeof navigator === "undefined" || typeof window === "undefined") return;

  const nav = navigator as Navigator & {
    mediaDevices?: MediaDevices;
    webkitGetUserMedia?: LegacyGUM;
    mozGetUserMedia?: LegacyGUM;
  };

  if (nav.mediaDevices === undefined) {
    nav.mediaDevices = {} as MediaDevices;
  }

  const md = nav.mediaDevices;
  if (typeof md.getUserMedia === "function") return;

  const legacy =
    nav.webkitGetUserMedia ?? nav.mozGetUserMedia ?? (nav as Navigator & { getUserMedia?: LegacyGUM }).getUserMedia;

  if (typeof legacy !== "function") return;

  md.getUserMedia = function (constraints: MediaStreamConstraints): Promise<MediaStream> {
    return new Promise((resolve, reject) => {
      legacy.call(navigator, constraints, resolve, reject);
    });
  };
}

if (typeof window !== "undefined") {
  ensureMediaDevicesPolyfill();
}

/** iPadOS 13+ часто маскируется под Mac. */
export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isAndroidDevice(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

/**
 * Для iOS: getUserMedia должен вызываться синхронно из tap — без await до вызова.
 * Сначала минимальные constraints (iOS часто падает на лишние поля).
 */
export function getAudioStreamSafe(): Promise<MediaStream> {
  const simple: MediaStreamConstraints = { audio: true };
  const rich: MediaStreamConstraints = {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
    },
  };

  const tryGet = (c: MediaStreamConstraints) => legacyGetUserMedia(c);

  if (isIOSDevice() || isAndroidDevice()) {
    return tryGet(simple).catch(() => tryGet(rich));
  }
  return tryGet(rich).catch(() => tryGet(simple));
}

/** Совместимость со старым webkit (редко на актуальном iOS). */
function legacyGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  ensureMediaDevicesPolyfill();
  if (navigator.mediaDevices?.getUserMedia) {
    return navigator.mediaDevices.getUserMedia(constraints);
  }
  const n = navigator as Navigator & {
    webkitGetUserMedia?: LegacyGUM;
    mozGetUserMedia?: LegacyGUM;
    getUserMedia?: LegacyGUM;
  };
  const legacy = n.webkitGetUserMedia ?? n.mozGetUserMedia ?? n.getUserMedia;
  if (!legacy) {
    return Promise.reject(new Error("Микрофон недоступен в этом браузере"));
  }
  return new Promise((resolve, reject) => {
    legacy.call(navigator, constraints, resolve, reject);
  });
}

export function pickVoiceMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const iosFirst = [
    "audio/mp4",
    "audio/aac",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/webm",
    "audio/webm;codecs=opus",
  ];
  const defaultFirst = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  const candidates = isIOSDevice() ? iosFirst : defaultFirst;
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

/**
 * Создать MediaRecorder: сначала без mime (Safari сам выберет), затем с типами.
 */
function createMediaRecorder(stream: MediaStream): MediaRecorder {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Запись звука не поддерживается");
  }
  try {
    return new MediaRecorder(stream);
  } catch {
    /* */
  }
  const mime = pickVoiceMimeType();
  if (mime) {
    try {
      return new MediaRecorder(stream, { mimeType: mime });
    } catch {
      /* */
    }
  }
  return new MediaRecorder(stream);
}

function startRecordingWithTimeslice(mr: MediaRecorder): void {
  /**
   * iOS: сначала timeslice — куски копятся во время записи; иначе stop/stop+пустой chunks
   * и голосовое не собирается. При неудаче — без slice, как раньше.
   */
  if (isIOSDevice()) {
    try {
      mr.start(250);
      return;
    } catch {
      try {
        mr.start(1000);
        return;
      } catch {
        try {
          mr.start();
        } catch {
          /* */
        }
      }
    }
  }
  try {
    mr.start(120);
  } catch {
    try {
      mr.start(250);
    } catch {
      mr.start();
    }
  }
}

export type VoiceRecorderSession = {
  pause: () => void;
  resume: () => void;
  getRecorderState: () => RecordingState;
  finish: (cancel: boolean) => Promise<{ blob: Blob; mime: string } | null>;
};

/**
 * Продолжить после getUserMedia: создать запись. stream закрывается в finish().
 */
export function attachVoiceRecorder(stream: MediaStream): VoiceRecorderSession {
  const mr = createMediaRecorder(stream);
  const chunks: Blob[] = [];
  const onData = (e: BlobEvent) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  mr.addEventListener("dataavailable", onData);
  startRecordingWithTimeslice(mr);

  return {
    pause: () => {
      if (mr.state !== "recording") return;
      try {
        mr.pause();
      } catch {
        /* */
      }
    },
    resume: () => {
      if (mr.state !== "paused") return;
      try {
        mr.resume();
      } catch {
        /* */
      }
    },
    getRecorderState: () => mr.state,
    finish: (cancel: boolean) =>
      new Promise((resolve) => {
        let settled = false;
        const safeResolve = (v: { blob: Blob; mime: string } | null) => {
          if (settled) return;
          settled = true;
          resolve(v);
        };

        mr.onstop = () => {
          mr.removeEventListener("dataavailable", onData);
          stream.getTracks().forEach((t) => t.stop());
          if (cancel) {
            safeResolve(null);
            return;
          }

          const mimeType = pickVoiceMimeType();
          const type = mr.mimeType || mimeType || "audio/webm";

          const buildFromChunks = (): void => {
            if (chunks.length === 0) {
              safeResolve(null);
              return;
            }
            safeResolve({ blob: new Blob(chunks, { type }), mime: type });
          };

          /**
           * iOS Safari / WebKit: последний `dataavailable` часто приходит после `stop`,
           * поэтому сборка Blob сразу в onstop даёт пустой chunks и сообщение не уходит в чат.
           */
          let attempts = 0;
          const maxAttempts = 22;
          const tryAfterData = () => {
            if (chunks.length > 0) {
              buildFromChunks();
              return;
            }
            attempts += 1;
            if (attempts >= maxAttempts) {
              buildFromChunks();
              return;
            }
            const delay = attempts <= 5 ? 0 : isIOSDevice() ? 120 : 90;
            setTimeout(tryAfterData, delay);
          };
          if (isIOSDevice()) {
            requestAnimationFrame(() => tryAfterData());
          } else {
            tryAfterData();
          }
        };
        try {
          if (mr.state === "recording" || mr.state === "paused") {
            try {
              mr.requestData();
            } catch {
              /* */
            }
          }
          mr.stop();
        } catch {
          stream.getTracks().forEach((t) => t.stop());
          safeResolve(null);
        }
      }),
  };
}

/**
 * Текст ошибки после отказа getUserMedia: небезопасный контекст vs отказ в разрешении.
 */
export function getMicrophoneFailureMessage(err: unknown): string {
  const e = err instanceof Error ? err : null;
  const msg = e?.message ?? "";
  const insecureByMessage =
    /only secure|secure origin|insecure context|небезопасн|not supported.*secure/i.test(msg);
  const insecure =
    typeof window !== "undefined" &&
    (!window.isSecureContext || e?.name === "SecurityError" || insecureByMessage);
  if (insecure) {
    return "Для доступа к микрофону откройте сайт по HTTPS.";
  }
  if (!e) return "Не удалось получить доступ к микрофону";
  if (e.name === "NotAllowedError" || /permission/i.test(msg)) {
    return "Разрешите доступ к микрофону: Safari → «aA» слева от адреса → Настройки веб-сайта → Микрофон → Разрешить.";
  }
  return e.message || "Не удалось получить доступ к микрофону";
}

/**
 * Можно ли запросить микрофон (кнопка активна).
 * Разрешение запрашивается при первом нажатии через getUserMedia — не требуем MediaRecorder заранее
 * (иначе в Safari кнопка могла оставаться неактивной).
 */
export function isVoiceRecordingSupported(): boolean {
  if (typeof window === "undefined") return false;
  ensureMediaDevicesPolyfill();
  const nav = navigator as Navigator & { webkitGetUserMedia?: unknown; mozGetUserMedia?: unknown };
  return !!(
    typeof navigator.mediaDevices?.getUserMedia === "function" ||
    nav.webkitGetUserMedia ||
    nav.mozGetUserMedia
  );
}

export function extensionForVoiceMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("ogg")) return "ogg";
  return "m4a";
}
