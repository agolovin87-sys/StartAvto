import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { UserProfile } from "@/types";
import { avatarHueFromUid, initialsFromFullName } from "@/admin/instructorAvatar";

function IconPlayVoice({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconPauseVoice({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function formatVoiceTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const PLAYBACK_RATES = [1, 1.5, 2] as const;

function formatPlaybackRateLabel(rate: number): string {
  if (rate === 1) return "1×";
  if (rate === 1.5) return "1,5×";
  if (rate === 2) return "2×";
  return `${String(rate).replace(".", ",")}×`;
}

type Props = {
  src: string;
  isMine: boolean;
  avatarProfile: Pick<UserProfile, "uid" | "displayName" | "avatarDataUrl">;
};

/** Плеер голосового в стиле мессенджера: круглая кнопка play, «волна», время. */
export function ChatVoiceMessagePlayer({ src, isMine, avatarProfile }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  /** После старта воспроизведения — слот скорости; после ended — снова аватар. */
  const [showSpeedInSlot, setShowSpeedInSlot] = useState(false);
  const [rateIndex, setRateIndex] = useState(0);

  const hue = avatarHueFromUid(avatarProfile.uid);
  const initials = initialsFromFullName(avatarProfile.displayName);
  const photoUrl =
    typeof avatarProfile.avatarDataUrl === "string" && avatarProfile.avatarDataUrl.length > 0
      ? avatarProfile.avatarDataUrl
      : null;

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    setDuration(0);
    setCurrent(0);
    setPlaying(false);
    setShowSpeedInSlot(false);
    setRateIndex(0);
    a.playbackRate = 1;
    const onMeta = () => setDuration(a.duration || 0);
    const onTime = () => setCurrent(a.currentTime);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
      setShowSpeedInSlot(false);
      setRateIndex(0);
      a.playbackRate = 1;
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => {
      setPlaying(true);
      setShowSpeedInSlot(true);
    };
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnded);
    a.addEventListener("pause", onPause);
    a.addEventListener("play", onPlay);
    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("play", onPlay);
    };
  }, [src]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
    } else {
      void a.play().catch(() => {});
    }
  };

  const cycleSpeed = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const a = audioRef.current;
    if (!a) return;
    const next = (rateIndex + 1) % PLAYBACK_RATES.length;
    setRateIndex(next);
    const rate = PLAYBACK_RATES[next];
    a.playbackRate = rate;
  };

  const showTime = playing ? current : duration;
  const bars = 20;
  const rate = PLAYBACK_RATES[rateIndex];

  const slot = (
    <div className="chat-voice-msg-slot">
      {showSpeedInSlot ? (
        <button
          type="button"
          className="chat-voice-msg-slot-speed"
          onClick={cycleSpeed}
          aria-label={`Скорость воспроизведения, ${formatPlaybackRateLabel(rate)}`}
        >
          {formatPlaybackRateLabel(rate)}
        </button>
      ) : photoUrl ? (
        <span className="chat-voice-msg-avatar-circle chat-voice-msg-avatar-circle--photo">
          <img src={photoUrl} alt="" className="chat-voice-msg-avatar-img" />
        </span>
      ) : (
        <span
          className="chat-voice-msg-avatar-circle"
          style={{ background: `hsl(${hue} 45% 35%)` }}
        >
          {initials}
        </span>
      )}
    </div>
  );

  const playBtn = (
    <button
      type="button"
      className="chat-voice-msg-play"
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      aria-label={playing ? "Пауза" : "Воспроизвести"}
    >
      {playing ? (
        <IconPauseVoice className="chat-voice-msg-play-ico" />
      ) : (
        <IconPlayVoice className="chat-voice-msg-play-ico" />
      )}
    </button>
  );

  const body = (
    <div className="chat-voice-msg-body">
      <div className="chat-voice-msg-wave" aria-hidden>
        {Array.from({ length: bars }, (_, i) => (
          <span
            key={i}
            className={`chat-voice-msg-wave-bar${playing ? " is-active" : ""}`}
            style={{ animationDelay: `${i * 35}ms` }}
          />
        ))}
      </div>
      <span className="chat-voice-msg-time">{formatVoiceTime(showTime)}</span>
    </div>
  );

  return (
    <div
      className={`chat-voice-msg${isMine ? " chat-voice-msg--mine" : " chat-voice-msg--theirs"}`}
      onClick={(e) => e.stopPropagation()}
    >
      <audio ref={audioRef} src={src} preload="metadata" playsInline />
      {isMine ? (
        <>
          {slot}
          {playBtn}
          {body}
        </>
      ) : (
        <>
          {playBtn}
          {body}
          {slot}
        </>
      )}
    </div>
  );
}
