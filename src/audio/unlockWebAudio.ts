import { resumeIncomingBeepContext } from "@/chat/incomingMessageAlerts";

/**
 * Снимает ограничение автовоспроизведения: AudioContext и HTMLAudio после первого жеста пользователя.
 * Без этого входящие сообщения часто без звука, пока пользователь не кликнул по странице.
 */
let unlocked = false;

export function installWebAudioUnlockListeners(): void {
  if (typeof window === "undefined" || unlocked) return;

  const unlock = () => {
    if (unlocked) return;
    unlocked = true;

    resumeIncomingBeepContext();

    try {
      const a = new Audio(`${import.meta.env.BASE_URL}sounds/sentmessage.mp3`);
      a.volume = 0.001;
      void a.play().catch(() => {});
    } catch {
      /* */
    }

    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchend", unlock);
  };

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchend", unlock, { passive: true });
}
