import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/context/AuthContext";
import { useChatUnread } from "@/context/ChatUnreadContext";
import type {
  ChatMessage,
  ChatMessageType,
  ChatRoom,
  TrainingGroup,
  UserProfile,
} from "@/types";
import { formatShortFio } from "@/admin/formatShortFio";
import { groupChatMessagesByDay } from "@/utils/chatDateUtils";
import { CreateGroupChatModal } from "@/pages/dashboards/admin/CreateGroupChatModal";
import { EditGroupChatModal } from "@/pages/dashboards/admin/EditGroupChatModal";
import {
  backfillManualGroupParticipantEmails,
  chatIdPair,
  clearChatTypingIndicator,
  ensurePairChatExists,
  findLatestPairRoomWherePeerNotInSet,
  deleteChatMessageForAll,
  deleteChatMessageForMe,
  editChatTextMessage,
  ensureSelfInLinkedGroupChatsForProfile,
  forwardChatMessagesToRecipients,
  pulseChatTypingIndicator,
  sendChatAttachmentMessage,
  sendChatTextMessage,
  subscribeManualGroupChatsForUser,
  subscribeChatRoomsForUser,
  subscribeChatTypingPeers,
  subscribeLatestMessageForChat,
  subscribeMessagesForChat,
  previewLineFromChatMessage,
  clearUserReactionOnMessage,
  toggleReaction,
  fetchPeerUidsWithExistingPairChatsForUser,
} from "@/firebase/chat";
import { ChatVoiceMessagePlayer } from "@/chat/ChatVoiceMessagePlayer";
import {
  attachVoiceRecorder,
  extensionForVoiceMime,
  getAudioStreamSafe,
  getMicrophoneFailureMessage,
  MAX_VOICE_RECORD_MS,
  MIN_VOICE_RECORD_MS,
  type VoiceRecorderSession,
} from "@/chat/voiceRecorder";
import { collection, onSnapshot } from "firebase/firestore";
import { getFirebase } from "@/firebase/config";
import { subscribeUsersByIds } from "@/firebase/instructorData";
import { subscribePrimaryAdministratorContact } from "@/firebase/primaryAdminContact";
import { subscribeTrainingGroups } from "@/firebase/admin";
import { subscribeStudentChatContacts } from "@/firebase/studentChatContacts";
import { normalizeUserProfile } from "@/firebase/users";
import {
  DEFAULT_CHAT_PRIVACY_SETTINGS,
  getChatPrivacySettings,
  subscribeChatPrivacySettings,
  type ChatPrivacySettings,
} from "@/admin/adminChatPrivacySettings";
import { isPresenceEffectivelyOnline } from "@/utils/presence";
import { playOutgoingChatSound } from "@/audio/outgoingChatSound";
import {
  DEFAULT_CHAT_LAST_SEEN_VISIBILITY_SETTINGS,
  subscribeChatLastSeenVisibilitySettings,
  type ChatLastSeenVisibilitySettings,
} from "@/firebase/chatLastSeenVisibilitySettings";

function isFirestorePermissionDenied(e: unknown): boolean {
  if (!e || typeof e !== "object" || !("code" in e)) return false;
  const code = String((e as { code?: string }).code ?? "");
  return code === "permission-denied" || code.endsWith("/permission-denied");
}

const roleLabel: Record<UserProfile["role"], string> = {
  admin: "Администратор",
  instructor: "Инструктор",
  student: "Курсант",
};

/** Длительность анимации удаления (пыль + пузырь); совпадает с `--chat-delete-anim-duration` в index.css */
const DELETE_ANIM_MS = 1100;

/** Редактирование своего текста: не-админы — только в течение этого окна (от последнего createdAt/editedAt). Админ — без лимита по времени. */
const MESSAGE_EDIT_WINDOW_MS = 5 * 60 * 1000;

const CHAT_TYPING_PULSE_MS = 2200;
const CHAT_TYPING_IDLE_MS = 4500;

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function readCssEnvPx(varName: string): number {
  if (typeof document === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function getChatSafeInsets(): { top: number; right: number; bottom: number; left: number } {
  return {
    left: readCssEnvPx("--chat-safe-left"),
    right: readCssEnvPx("--chat-safe-right"),
    top: readCssEnvPx("--chat-safe-top"),
    bottom: readCssEnvPx("--chat-safe-bottom"),
  };
}

const REACTIONS_QUICK: string[] = ["👍", "❤️", "😂", "😮", "😢", "👎"];

const REACTIONS_MORE: string[] = [
  "🔥",
  "🎉",
  "👏",
  "🙏",
  "💯",
  "✨",
  "🤔",
  "😍",
  "🥰",
  "😭",
  "🤣",
  "😊",
  "🙌",
  "💪",
  "⭐",
  "👀",
  "💔",
  "🤝",
  "😎",
  "🤷",
  "🤦",
  "👌",
  "✅",
  "❌",
  "🙈",
  "💀",
  "😡",
  "🥳",
  "🤗",
  "☺️",
].filter((e) => !REACTIONS_QUICK.includes(e));

/** 5 разных эмодзи для анимации при постановке реакции (как в Telegram). */
function pickFiveBurstEmojis(primary: string): string[] {
  const pool = [...REACTIONS_QUICK, ...REACTIONS_MORE];
  const out: string[] = [primary];
  const rest = pool.filter((e) => e !== primary);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = rest[i]!;
    rest[i] = rest[j]!;
    rest[j] = t;
  }
  for (const e of rest) {
    if (out.length >= 5) break;
    if (!out.includes(e)) out.push(e);
  }
  while (out.length < 5) {
    out.push(pool[out.length % pool.length]!);
  }
  return out.slice(0, 5);
}

type ReactionBurstState = {
  id: number;
  messageId: string;
  /** Реакция, по которой тапнули — всплеск центрируем на её чипе */
  primaryEmoji: string;
  items: { emoji: string; dx: number; dy: number; delay: number; rot: number }[];
};

type DeleteParticleItem = {
  /** смещение точки вылета от центра пузыря */
  ox: string;
  oy: string;
  dx: string;
  dy: string;
  rot: string;
  delay: string;
  sz: string;
  bg: string;
};

const DELETE_PARTICLE_BG_MINE = [
  "rgba(125, 211, 252, 0.92)",
  "rgba(56, 189, 248, 0.85)",
  "rgba(226, 232, 240, 0.75)",
  "rgba(34, 211, 238, 0.7)",
  "rgba(165, 243, 252, 0.65)",
];
const DELETE_PARTICLE_BG_OTHER = [
  "rgba(148, 163, 184, 0.88)",
  "rgba(203, 213, 225, 0.8)",
  "rgba(125, 211, 252, 0.55)",
  "rgba(100, 116, 139, 0.75)",
  "rgba(226, 232, 240, 0.65)",
];

function serializeReactions(r: ChatMessage["reactions"]): string {
  if (!r || typeof r !== "object") return "{}";
  const raw = r as Record<string, string[]>;
  const keys = Object.keys(raw).sort();
  const o: Record<string, string[]> = {};
  for (const k of keys) {
    const u = raw[k];
    o[k] = Array.isArray(u) ? [...u].sort() : [];
  }
  return JSON.stringify(o);
}

function buildDeleteParticles(mine: boolean): DeleteParticleItem[] {
  const pool = mine ? DELETE_PARTICLE_BG_MINE : DELETE_PARTICLE_BG_OTHER;
  const n = 72;
  const out: DeleteParticleItem[] = [];
  for (let i = 0; i < n; i++) {
    const fine = Math.random() < 0.42;
    out.push({
      ox: `${(Math.random() - 0.5) * 92}px`,
      oy: `${(Math.random() - 0.5) * 88}px`,
      dx: `${(Math.random() - 0.5) * 240}px`,
      dy: `${(Math.random() - 0.5) * 280 - 36}px`,
      rot: `${Math.random() * 900 - 450}deg`,
      delay: `${Math.random() * 150}ms`,
      sz: fine ? `${1 + Math.random() * 2.5}px` : `${2.5 + Math.random() * 8}px`,
      bg: pool[Math.floor(Math.random() * pool.length)]!,
    });
  }
  return out;
}

function startOfLocalDayMs(ms: number): number {
  // Старт календарного дня в локальной TZ браузера.
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatRuTime(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function formatRuDate(ms: number): string {
  const d = new Date(ms);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const CHAT_DRAFTS_KEY_PREFIX = "startavto.chatDrafts.";
const ADMIN_CHAT_GROUP_COLLAPSE_KEY_PREFIX = "startavto.adminChatGroupsCollapsed.";

function readDraftMap(userId: string): Record<string, string> {
  if (!userId || typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(CHAT_DRAFTS_KEY_PREFIX + userId);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeDraftMap(userId: string, map: Record<string, string>) {
  if (!userId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CHAT_DRAFTS_KEY_PREFIX + userId, JSON.stringify(map));
  } catch {
    // ignore quota
  }
}

function readAdminChatGroupsCollapsedMap(userId: string): Record<string, boolean> {
  if (!userId || typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(ADMIN_CHAT_GROUP_COLLAPSE_KEY_PREFIX + userId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      out[k] = v === true;
    }
    return out;
  } catch {
    return {};
  }
}

function writeAdminChatGroupsCollapsedMap(userId: string, map: Record<string, boolean>) {
  if (!userId || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(ADMIN_CHAT_GROUP_COLLAPSE_KEY_PREFIX + userId, JSON.stringify(map));
  } catch {
    // ignore quota
  }
}

function truncatePreviewLine(s: string, max = 72): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function formatVoiceRecClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function formatPreviewDateTime(lastMs: number): string {
  const now = Date.now();
  const startToday = startOfLocalDayMs(now);
  const startMsgDay = startOfLocalDayMs(lastMs);
  const diffDays = Math.round((startMsgDay - startToday) / 86_400_000);
  if (diffDays === 0) return formatRuTime(lastMs);
  if (diffDays === -1) return `${formatRuDate(lastMs)} ${formatRuTime(lastMs)}`;
  return `${formatRuDate(lastMs)} ${formatRuTime(lastMs)}`;
}

/**
 * Метка времени для «не в сети» у админа: сначала lastSeenAt (уход/приватность),
 * иначе heartbeat — когда в Firestore ещё «online», но UI уже считает офлайн по stale heartbeat
 * (закрытие вкладки без beforeunload и т.п.).
 */
function adminContactOfflinePresenceMs(
  p: UserProfile["presence"] | undefined
): number | null {
  if (!p) return null;
  if (typeof p.lastSeenAt === "number" && p.lastSeenAt > 0) return p.lastSeenAt;
  if (typeof p.heartbeatAt === "number" && p.heartbeatAt > 0) return p.heartbeatAt;
  return null;
}

/** Только текст в скобках после «не в сети»: сегодня — время; иначе — «22.04. 10:00». */
function formatAdminContactLastSeenWhenOffline(lastSeenMs: number): string | null {
  if (!Number.isFinite(lastSeenMs) || lastSeenMs <= 0) return null;
  const now = Date.now();
  const startToday = startOfLocalDayMs(now);
  const startDay = startOfLocalDayMs(lastSeenMs);
  if (startDay === startToday) {
    return formatRuTime(lastSeenMs);
  }
  const d = new Date(lastSeenMs);
  const dd = pad2(d.getDate());
  const mm = pad2(d.getMonth() + 1);
  const yy = d.getFullYear();
  const nowY = new Date(now).getFullYear();
  const datePart = yy === nowY ? `${dd}.${mm}.` : `${dd}.${mm}.${yy}.`;
  return `${datePart} ${formatRuTime(lastSeenMs)}`;
}

function effectiveContactOnline(
  p: UserProfile["presence"] | undefined,
  privacy: ChatPrivacySettings
): boolean {
  return isPresenceEffectivelyOnline(p, {
    ignoreHeartbeatStale: !privacy.treatStaleHeartbeatAsOffline,
  });
}

/**
 * «В сети» показываем сразу; «не в сети» — только после паузы, если сырой статус так и
 * остался offline (отсекает краткие провалы из‑за снимков users и границы stale heartbeat).
 */
function useDebouncedPresenceOnline(
  presence: UserProfile["presence"] | undefined,
  privacy: ChatPrivacySettings,
  resetKey: string
): boolean {
  const raw = effectiveContactOnline(presence, privacy);
  const [stable, setStable] = useState(raw);

  useEffect(() => {
    setStable(raw);
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (raw) {
      setStable(true);
      return;
    }
    const t = window.setTimeout(() => setStable(false), 3200);
    return () => window.clearTimeout(t);
  }, [raw, resetKey]);

  return stable;
}

function canShowInChatContacts(u: UserProfile): boolean {
  if (u.accountStatus === "rejected") return false;
  if (u.role === "student" || u.role === "instructor") {
    return u.accountStatus === "active" || u.accountStatus === "pending";
  }
  return u.accountStatus === "active";
}

/** Превью «печатает» в списке контактов (та же анимация, что в шапке открытого чата). */
function ContactTypingPreview({
  peerIds,
  displayNameForUid,
}: {
  peerIds: string[];
  displayNameForUid: (uid: string) => string;
}) {
  const ordered = useMemo(() => [...peerIds].sort(), [peerIds]);
  const listKey = useMemo(() => ordered.join(","), [ordered]);
  const [rotateIdx, setRotateIdx] = useState(0);

  useEffect(() => {
    setRotateIdx(0);
  }, [listKey]);

  useEffect(() => {
    if (ordered.length <= 1) return;
    const id = window.setInterval(() => {
      setRotateIdx((i) => {
        const len = ordered.length;
        if (len <= 1) return 0;
        return (i + 1) % len;
      });
    }, 2000);
    return () => window.clearInterval(id);
  }, [listKey, ordered.length]);

  if (ordered.length === 0) return null;
  const idx =
    ordered.length === 1 ? 0 : rotateIdx % ordered.length;
  const peerId = ordered[idx];
  if (!peerId) return null;
  const name = displayNameForUid(peerId);

  return (
    <div
      className="chat-room-user-typing chat-contact-typing-preview"
      role="status"
      aria-live="polite"
    >
      <span className="chat-room-user-typing-keys" aria-hidden>
        <span className="chat-room-user-typing-key" />
        <span className="chat-room-user-typing-key" />
        <span className="chat-room-user-typing-key" />
      </span>
      <span className="chat-room-user-typing-text">
        {name} печатает
      </span>
    </div>
  );
}

type ChatDmContactListItemProps = {
  c: UserProfile;
  room: { lastMs: number | null; lastText: string } | undefined;
  draft: string;
  previewText: string;
  hasLastMsg: boolean;
  isActive: boolean;
  chatPrivacy: ChatPrivacySettings;
  unreadCount: number;
  typingPeerIds: string[];
  displayNameForUid: (uid: string) => string;
  onSelect: () => void;
  onAvatarPhotoClick: () => void;
  /** Только админ: в списке контактов после «не в сети» — последний визит в скобках. */
  showLastSeenByRole: ChatLastSeenVisibilitySettings;
  currentUserRole: UserProfile["role"];
};

function ChatDmContactListItem({
  c,
  room,
  draft,
  previewText,
  hasLastMsg,
  isActive,
  chatPrivacy,
  unreadCount,
  typingPeerIds,
  displayNameForUid,
  onSelect,
  onAvatarPhotoClick,
  showLastSeenByRole,
  currentUserRole,
}: ChatDmContactListItemProps) {
  const presenceOnline = useDebouncedPresenceOnline(c.presence, chatPrivacy, c.uid);
  const canShowLastSeenByRole =
    c.role === "admin"
      ? currentUserRole === "admin"
        ? true
        : currentUserRole === "instructor"
          ? showLastSeenByRole.showInstructorLastSeen
          : showLastSeenByRole.showStudentLastSeen
      : c.role === "instructor"
        ? showLastSeenByRole.showInstructorLastSeen
        : showLastSeenByRole.showStudentLastSeen;
  const offlinePresenceMs =
    canShowLastSeenByRole && !presenceOnline
      ? adminContactOfflinePresenceMs(c.presence)
      : null;
  const offlineLastSeenLabel =
    canShowLastSeenByRole &&
    chatPrivacy.showPresenceInChatUi &&
    !presenceOnline &&
    offlinePresenceMs != null
      ? formatAdminContactLastSeenWhenOffline(offlinePresenceMs)
      : null;

  return (
    <li>
      <button
        type="button"
        className={isActive ? "chat-contact-item is-active" : "chat-contact-item"}
        onClick={onSelect}
      >
        <span className="chat-contact-avatar-wrap">
          <UserChatAvatar
            profile={c}
            size="list"
            onPhotoClick={c.avatarDataUrl ? onAvatarPhotoClick : undefined}
          />
          {chatPrivacy.showPresenceInChatUi ? (
            <span
              className={
                presenceOnline
                  ? "chat-contact-status-dot chat-contact-status-dot--online"
                  : "chat-contact-status-dot chat-contact-status-dot--offline"
              }
              aria-hidden
            />
          ) : null}
        </span>
        <span className="chat-contact-body">
          <span className="chat-contact-top">
            <span className="chat-contact-name">{formatShortFio(c.displayName)}</span>
            {unreadCount > 0 ? (
              <span
                className="chat-contact-unread-badge"
                aria-label={`Непрочитано: ${unreadCount}`}
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </span>
          <span className="chat-contact-role-row">
            <span className="chat-contact-role">{roleLabel[c.role]}</span>
            {chatPrivacy.showPresenceInChatUi ? (
              <>
                <span className="chat-contact-role-sep" aria-hidden />
                <span
                  className={
                    presenceOnline ? "chat-presence chat-presence--online" : "chat-presence"
                  }
                >
                  {presenceOnline
                    ? "в сети"
                    : offlineLastSeenLabel
                      ? `не в сети (${offlineLastSeenLabel})`
                      : "не в сети"}
                </span>
              </>
            ) : null}
          </span>
          <span className="chat-contact-preview-row">
            {draft ? (
              <span className="chat-contact-preview chat-contact-preview--draft">
                {previewText}
              </span>
            ) : typingPeerIds.length > 0 ? (
              <ContactTypingPreview
                peerIds={typingPeerIds}
                displayNameForUid={displayNameForUid}
              />
            ) : (
              <span className="chat-contact-preview">{previewText}</span>
            )}
            {hasLastMsg && room?.lastMs != null && !draft && typingPeerIds.length === 0 ? (
              <span className="chat-contact-preview-meta">
                <span className="chat-contact-ticks" aria-hidden>
                  ✓✓
                </span>
                <span className="chat-contact-meta">{formatPreviewDateTime(room.lastMs)}</span>
              </span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );
}

function avatarHueFromUid(uid: string): number {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return h % 360;
}

function initialsFromFullName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const a = (parts[0][0] ?? "?").toUpperCase();
  if (parts.length >= 2) {
    return `${a}${(parts[1][0] ?? "?").toUpperCase()}`;
  }
  return `${a}${(parts[0][1] ?? "?").toUpperCase()}`;
}

function UserChatAvatar({
  profile,
  size,
  onPhotoClick,
}: {
  profile: Pick<UserProfile, "uid" | "displayName" | "avatarDataUrl">;
  size: "list" | "header";
  onPhotoClick?: () => void;
}) {
  const hue = avatarHueFromUid(profile.uid);
  const initials = initialsFromFullName(profile.displayName);
  const url =
    typeof profile.avatarDataUrl === "string" && profile.avatarDataUrl.length > 0
      ? profile.avatarDataUrl
      : null;
  const lg = size === "header" ? " chat-contact-avatar-lg" : "";
  const circle = url ? (
    <span className={`chat-contact-avatar${lg} chat-contact-avatar--user-photo`}>
      <img src={url} alt="" className="chat-contact-avatar-img" />
    </span>
  ) : (
    <span
      className={`chat-contact-avatar${lg}`}
      style={{ background: `hsl(${hue} 45% 35%)` }}
    >
      {initials}
    </span>
  );
  if (url && onPhotoClick) {
    return (
      <span
        className="chat-contact-avatar-hit"
        onClick={(e) => {
          e.stopPropagation();
          onPhotoClick();
        }}
        role="presentation"
        title="Открыть фото"
      >
        {circle}
      </span>
    );
  }
  return circle;
}

/** Аватар + «Фамилия И.О.» только для входящих в групповом чате. */
function ChatMessageBubbleChrome({
  mine,
  incomingSender,
  onAvatarPhotoClick,
  showIncomingSenderChrome,
  children,
}: {
  mine: boolean;
  incomingSender: Pick<UserProfile, "uid" | "displayName" | "avatarDataUrl"> | null;
  onAvatarPhotoClick?: () => void;
  /** Только группа; в личке — обычный пузырь без аватарки/имени. */
  showIncomingSenderChrome: boolean;
  children: ReactNode;
}) {
  if (mine) {
    return <div className="chat-msg-bubble-wrap">{children}</div>;
  }
  if (!showIncomingSenderChrome || !incomingSender) {
    return <div className="chat-msg-bubble-wrap">{children}</div>;
  }
  return (
    <div className="chat-msg-incoming-row">
      <div className="chat-msg-incoming-avatar-wrap">
        <UserChatAvatar
          profile={incomingSender}
          size="list"
          onPhotoClick={onAvatarPhotoClick}
        />
      </div>
      <div className="chat-msg-bubble-wrap chat-msg-bubble-wrap--group-incoming">{children}</div>
    </div>
  );
}

function IconChat({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
      />
    </svg>
  );
}

function IconRefresh({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M17.65 6.35A7.95 7.95 0 0 0 12 4V1L7 6l5 5V7c1.66 0 3.16.69 4.24 1.76A5.98 5.98 0 0 1 18 12a6 6 0 0 1-6 6 6 6 0 0 1-5.65-4H4.26C4.91 18.27 8.14 21 12 21a9 9 0 0 0 9-9c0-1.89-.68-3.63-1.35-5.65z"
      />
    </svg>
  );
}

function IconGroup({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zM8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
      />
    </svg>
  );
}

/** Иконка «переписка» (два перекрывающихся диалога) — просмотр чужой переписки. */
function IconCorrespondence({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6H7V3c0-.55.45-1 1-1h12c.55 0 1 .45 1 1v11z"
      />
    </svg>
  );
}

function IconArrowBack({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
      />
    </svg>
  );
}

function IconPaperclip({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S5 2.79 5 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"
      />
    </svg>
  );
}

function IconSend({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"
      />
    </svg>
  );
}

function IconMic({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"
      />
    </svg>
  );
}

function IconVoicePause({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function IconVoicePlay({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  );
}

/** Предпрослушивание (динамик), чтобы не путать с «Продолжить» (треугольник). */
function IconVoicePreview({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
      />
    </svg>
  );
}

function IconArrowDown({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z"
      />
    </svg>
  );
}

function IconMenuReply({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"
      />
    </svg>
  );
}

function IconMenuCopy({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
      />
    </svg>
  );
}

function IconMenuForward({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M12 8V4l8 8-8 8v-4H4V8h8zm-2 2H6v4h4v2.17L16.17 12 10 5.83V10z"
      />
    </svg>
  );
}

function IconMenuSelect({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
      />
    </svg>
  );
}

function IconMenuEdit({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
      />
    </svg>
  );
}

function IconMenuTrash({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  );
}

function IconMenuDownload({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="currentColor"
        d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"
      />
    </svg>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Ошибка чтения файла"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

/** Строка data: в Firestore — запас под остальные поля в лимите документа 1 MiB. */
const MAX_CHAT_PAYLOAD_CHARS = 1_000_000;
/** Сырой файл до base64: data URL ≈ длина префикса + ⌈4·размер/3⌉. */
const MAX_CHAT_FILE_BYTES = Math.floor(((MAX_CHAT_PAYLOAD_CHARS - 48) * 3) / 4);
const CHAT_FILE_MAX_KB_HINT = Math.round(MAX_CHAT_FILE_BYTES / 1024);

/** Уменьшает фото под лимит Firestore; иначе типичное фото с телефона даёт ошибку по размеру. */
async function compressImageFileForChat(file: File): Promise<{ file: File; previewUrl: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Не удалось открыть изображение"));
      i.src = objectUrl;
    });
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    if (!sw || !sh) throw new Error("Пустое или повреждённое изображение");

    const tryExport = (maxSide: number, q: number): Promise<Blob | null> => {
      let tw = sw;
      let th = sh;
      if (tw > maxSide || th > maxSide) {
        if (tw >= th) {
          th = Math.round((th * maxSide) / tw);
          tw = maxSide;
        } else {
          tw = Math.round((tw * maxSide) / th);
          th = maxSide;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = tw;
      canvas.height = th;
      const c = canvas.getContext("2d");
      if (!c) return Promise.resolve(null);
      c.drawImage(img, 0, 0, tw, th);
      return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
    };

    const cap = MAX_CHAT_FILE_BYTES;
    const stepHi = Math.floor(cap * 0.95);
    let blob: Blob | null = await tryExport(1920, 0.82);
    if (!blob) throw new Error("Не удалось сжать фото");
    if (blob.size > stepHi) blob = await tryExport(1920, 0.65);
    if (!blob || blob.size > stepHi) blob = await tryExport(1280, 0.72);
    if (!blob || blob.size > stepHi) blob = await tryExport(960, 0.65);
    if (!blob || blob.size > cap) {
      throw new Error("Фото слишком большое. Выберите другое изображение.");
    }

    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    const outFile = new File([blob], `${base}.jpg`, { type: "image/jpeg" });
    const previewUrl = URL.createObjectURL(blob);
    return { file: outFile, previewUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

type PendingChatAttachment =
  | { kind: "image"; previewUrl: string; file: File }
  | { kind: "pdf"; previewUrl: string; file: File };

function isPdfFile(file: File): boolean {
  const t = file.type.toLowerCase();
  if (t === "application/pdf" || t.includes("pdf")) return true;
  return file.name.toLowerCase().endsWith(".pdf");
}

type ChatFilePreviewKind = "pdf" | "image" | "video" | "other";

function chatFilePreviewKind(m: ChatMessage): ChatFilePreviewKind {
  if (m.type !== "file" || !m.payloadDataUrl) return "other";
  const mt = (m.mimeType ?? "").toLowerCase();
  const name = (m.fileName ?? "").toLowerCase();
  if (mt.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (mt.startsWith("image/")) return "image";
  if (mt.startsWith("video/")) return "video";
  return "other";
}

/** Голосовое: до ветки «текст», иначе при type=text + payload получался пустой пузырь (iOS / snapshot). */
function isVoiceChatMessage(m: ChatMessage): boolean {
  if (!m.payloadDataUrl) return false;
  if (m.type === "voice") return true;
  if (m.type === "file" || m.type === "image") return false;
  const mt = (m.mimeType ?? "").toLowerCase();
  if (mt.startsWith("audio/")) return true;
  return (m.fileName ?? "").toLowerCase().startsWith("voice-");
}

function chatFileExtensionLabel(fileName: string | null | undefined): string {
  const n = fileName ?? "";
  const i = n.lastIndexOf(".");
  if (i < 0 || i >= n.length - 1) return "";
  return n.slice(i + 1).toUpperCase().slice(0, 8);
}

function downloadChatImagePayload(m: ChatMessage): void {
  if (!m.payloadDataUrl || m.type !== "image") return;
  const rawName = (m.fileName ?? `photo-${m.id}`).replace(/[/\\?%*:|"<>]/g, "_");
  const hasExt = /\.[a-z0-9]{2,8}$/i.test(rawName);
  const extFromMime = m.mimeType?.split("/")[1]?.replace(/[^a-z0-9]/gi, "") ?? "jpg";
  const name = hasExt ? rawName : `${rawName}.${extFromMime}`;
  const a = document.createElement("a");
  a.href = m.payloadDataUrl;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadChatFilePayload(m: ChatMessage): void {
  if (!m.payloadDataUrl || m.type !== "file") return;
  const rawName = (m.fileName ?? `file-${m.id}`).replace(/[/\\?%*:|"<>]/g, "_");
  const a = document.createElement("a");
  a.href = m.payloadDataUrl;
  a.download = rawName || "file";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const BLOB_URL_OPEN_TTL_MS = 120_000;

function isIosLikeDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  return false;
}

/** Полноэкранный просмотр внутри страницы — на iOS Safari новая вкладка с blob: часто пустая или блокируется. */
function openChatFileViewerOverlay(blobUrl: string, mime: string, title: string): void {
  const backdrop = document.createElement("div");
  backdrop.className = "chat-file-viewer-overlay";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-label", title);

  const cleanup = () => {
    URL.revokeObjectURL(blobUrl);
    backdrop.remove();
    document.body.style.overflow = "";
    window.removeEventListener("keydown", onKeyDown);
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") cleanup();
  };

  document.body.style.overflow = "hidden";
  window.addEventListener("keydown", onKeyDown);

  const topBar = document.createElement("div");
  topBar.className = "chat-file-viewer-overlay-bar";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "chat-file-viewer-overlay-close";
  closeBtn.textContent = "Закрыть";

  const titleEl = document.createElement("span");
  titleEl.className = "chat-file-viewer-overlay-title";
  titleEl.textContent = title;

  const body = document.createElement("div");
  body.className = "chat-file-viewer-overlay-body";

  const mt = mime.toLowerCase();
  if (mt.startsWith("video/")) {
    const v = document.createElement("video");
    v.className = "chat-file-viewer-overlay-video";
    v.src = blobUrl;
    v.controls = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    body.appendChild(v);
  } else if (mt.startsWith("image/")) {
    const im = document.createElement("img");
    im.className = "chat-file-viewer-overlay-img";
    im.src = blobUrl;
    im.alt = title;
    body.appendChild(im);
  } else {
    const iframe = document.createElement("iframe");
    iframe.className = "chat-file-viewer-overlay-frame";
    iframe.src = blobUrl;
    iframe.title = title;
    body.appendChild(iframe);
  }

  closeBtn.addEventListener("click", cleanup);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) cleanup();
  });

  topBar.appendChild(closeBtn);
  topBar.appendChild(titleEl);
  backdrop.appendChild(topBar);
  backdrop.appendChild(body);
  document.body.appendChild(backdrop);
}

function openChatFileViewerOverlayDataUrl(dataUrl: string, mime: string, title: string): void {
  const backdrop = document.createElement("div");
  backdrop.className = "chat-file-viewer-overlay";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");

  const cleanup = () => {
    backdrop.remove();
    document.body.style.overflow = "";
    window.removeEventListener("keydown", onKeyDown);
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") cleanup();
  };

  document.body.style.overflow = "hidden";
  window.addEventListener("keydown", onKeyDown);

  const topBar = document.createElement("div");
  topBar.className = "chat-file-viewer-overlay-bar";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "chat-file-viewer-overlay-close";
  closeBtn.textContent = "Закрыть";
  const titleEl = document.createElement("span");
  titleEl.className = "chat-file-viewer-overlay-title";
  titleEl.textContent = title;
  const body = document.createElement("div");
  body.className = "chat-file-viewer-overlay-body";

  const mt = mime.toLowerCase();
  if (mt.startsWith("video/")) {
    const v = document.createElement("video");
    v.className = "chat-file-viewer-overlay-video";
    v.src = dataUrl;
    v.controls = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    body.appendChild(v);
  } else if (mt.startsWith("image/")) {
    const im = document.createElement("img");
    im.className = "chat-file-viewer-overlay-img";
    im.src = dataUrl;
    im.alt = title;
    body.appendChild(im);
  } else {
    const iframe = document.createElement("iframe");
    iframe.className = "chat-file-viewer-overlay-frame";
    iframe.src = dataUrl;
    iframe.title = title;
    body.appendChild(iframe);
  }

  closeBtn.addEventListener("click", cleanup);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) cleanup();
  });
  topBar.appendChild(closeBtn);
  topBar.appendChild(titleEl);
  backdrop.appendChild(topBar);
  backdrop.appendChild(body);
  document.body.appendChild(backdrop);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || !dataUrl.startsWith("data:")) {
    throw new Error("Invalid data URL");
  }
  const header = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  const isBase64 = /;base64/i.test(header);
  const mimeMatch = /^data:([^;,]+)/.exec(header);
  const mime =
    (mimeMatch?.[1] ?? "application/octet-stream").trim() || "application/octet-stream";

  if (isBase64) {
    const binary = atob(payload.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  try {
    return new Blob([decodeURIComponent(payload.replace(/\+/g, " "))], { type: mime });
  } catch {
    return new Blob([payload], { type: mime });
  }
}

/** Открыть вложение: на iOS — полноэкранный просмотр; иначе новая вкладка через blob: (без noopener в open — иначе Chrome возвращает null). */
function openChatPayloadInNewWindow(m: ChatMessage): void {
  if (!m.payloadDataUrl) return;
  const dataUrl = m.payloadDataUrl;
  const title = m.fileName ?? "Файл";
  const mime = (m.mimeType ?? "application/octet-stream").trim();

  const scheduleRevoke = (blobUrl: string) => {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), BLOB_URL_OPEN_TTL_MS);
  };

  let blobUrl: string;
  try {
    blobUrl = URL.createObjectURL(dataUrlToBlob(dataUrl));
  } catch {
    if (isIosLikeDevice()) {
      openChatFileViewerOverlayDataUrl(dataUrl, mime, title);
    } else {
      const a = document.createElement("a");
      a.href = dataUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    return;
  }

  if (isIosLikeDevice()) {
    openChatFileViewerOverlay(blobUrl, mime, title);
    return;
  }

  const w1 = window.open(blobUrl, "_blank");
  if (w1) {
    try {
      w1.opener = null;
    } catch {
      /* ignore */
    }
    scheduleRevoke(blobUrl);
    return;
  }

  const w2 = window.open("about:blank", "_blank");
  if (w2) {
    try {
      w2.opener = null;
    } catch {
      /* ignore */
    }
    try {
      w2.location.href = blobUrl;
      scheduleRevoke(blobUrl);
      return;
    } catch {
      try {
        w2.close();
      } catch {
        /* ignore */
      }
    }
  }

  try {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    scheduleRevoke(blobUrl);
    return;
  } catch {
    /* ниже — оверлей, blob отзывается при закрытии */
  }

  openChatFileViewerOverlay(blobUrl, mime, title);
}

export type AdminChatTabProps = {
  /** true — открыта переписка с контактом (скрыть нижнюю панель админки). */
  onThreadModeChange?: (inThread: boolean) => void;
  /** Открыть личный чат (например из карточки инструктора/курсанта). */
  pendingOpenUserId?: string | null;
  onPendingOpenConsumed?: () => void;
  /** Список контактов: все активные, закреплённые курсанты (инструктор) или только группы (курсант). */
  contactsScope?: "allActiveUsers" | "instructorAttached" | "none" | "studentChat";
  /**
   * default — «Обновить» для всех; «Переписка» и «Добавить группу» только у администратора.
   * refreshOnly — только «Обновить контакты» (узкая шапка).
   */
  chatHeaderMode?: "default" | "refreshOnly";
};

export function AdminChatTab({
  onThreadModeChange,
  pendingOpenUserId,
  onPendingOpenConsumed,
  contactsScope,
  chatHeaderMode = "default",
}: AdminChatTabProps) {
  const { profile, user, loading: authLoading } = useAuth();
  const authUid = (user?.uid ?? "").trim();
  /** Для UI/сравнений; подписка на чаты берёт uid только из Firebase Auth (см. subscribeChatRoomsForUser). */
  const currentUserId = authUid || (profile?.uid ?? "").trim();
  /** Для фильтра «удалено для меня», печати и pair_* — совпадать с токеном Auth, иначе лента пустая. */
  const selfId = authUid || currentUserId;
  const isAdmin = profile?.role === "admin";
  const currentUserRole = profile?.role ?? "student";

  useEffect(() => {
    if (!isAdmin) {
      setTrainingGroups([]);
      return;
    }
    // Один раз дотягиваем email-метки участников у старых ручных групп,
    // чтобы отмеченные админом пользователи стабильно видели чат.
    void backfillManualGroupParticipantEmails();
    return subscribeTrainingGroups(setTrainingGroups, (e) => {
      if (import.meta.env.DEV) {
        console.warn("[subscribeTrainingGroups]", e.message);
      }
    });
  }, [isAdmin]);

  const contactsMode = useMemo((): "allActiveUsers" | "instructorAttached" | "none" | "studentChat" => {
    if (contactsScope === "none") return "none";
    if (contactsScope === "studentChat") return "studentChat";
    if (contactsScope === "instructorAttached" || contactsScope === "allActiveUsers") {
      return contactsScope;
    }
    return profile?.role === "instructor" ? "instructorAttached" : "allActiveUsers";
  }, [contactsScope, profile?.role]);

  const instructorAttachedKey = useMemo(
    () =>
      [...(profile?.attachedStudentIds ?? [])]
        .filter((x): x is string => typeof x === "string" && x.length > 0)
        .sort()
        .join(","),
    [profile?.attachedStudentIds]
  );

  /** Self-join в чат-группу по привязке учебной группы (см. firestore.rules). */
  useEffect(() => {
    if (authLoading || !authUid || !profile) return;
    if (profile.role !== "student" && profile.role !== "instructor") return;
    void ensureSelfInLinkedGroupChatsForProfile({
      uid: authUid,
      role: profile.role,
      email: profile.email ?? "",
      groupId: profile.groupId ?? "",
      attachedStudentIds: profile.attachedStudentIds ?? [],
    });
  }, [authLoading, authUid, profile?.role, profile?.groupId, instructorAttachedKey]);

  /** Закреплённый контакт «Администратор» для инструктора и курсанта (не для админа в режиме полного списка). */
  const needsPinnedAdministrator = useMemo(
    () =>
      !isAdmin &&
      contactsMode !== "none" &&
      contactsMode !== "allActiveUsers",
    [isAdmin, contactsMode]
  );

  const [chatPrivacyVersion, setChatPrivacyVersion] = useState(0);
  useEffect(() => {
    if (!currentUserId) return;
    return subscribeChatPrivacySettings(() => setChatPrivacyVersion((v) => v + 1));
  }, [currentUserId]);

  const chatPrivacy = useMemo(
    () =>
      currentUserId ? getChatPrivacySettings(currentUserId) : DEFAULT_CHAT_PRIVACY_SETTINGS,
    [currentUserId, chatPrivacyVersion]
  );
  const [showLastSeenByRole, setShowLastSeenByRole] = useState<ChatLastSeenVisibilitySettings>(
    DEFAULT_CHAT_LAST_SEEN_VISIBILITY_SETTINGS
  );
  useEffect(
    () =>
      subscribeChatLastSeenVisibilitySettings(
        (v) => setShowLastSeenByRole(v),
        () => setShowLastSeenByRole(DEFAULT_CHAT_LAST_SEEN_VISIBILITY_SETTINGS)
      ),
    []
  );

  const batchShowDeleteForMe = !isAdmin || chatPrivacy.allowDeleteForMeInMenu;
  const batchShowDeleteForAll = isAdmin && chatPrivacy.allowDeleteForAllInMenu;
  const batchToolbarHasDelete = !isAdmin || batchShowDeleteForMe || batchShowDeleteForAll;

  const [contacts, setContacts] = useState<UserProfile[]>([]);
  /** Профили участников открытой группы — для аватарок в ленте. */
  const [groupParticipantProfiles, setGroupParticipantProfiles] = useState<UserProfile[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [primaryAdminRow, setPrimaryAdminRow] = useState<UserProfile | null>(null);
  const [primaryAdminTried, setPrimaryAdminTried] = useState(false);
  const [rooms, setRooms] = useState<Record<string, { chatId: string; lastMs: number | null; lastText: string }>>(
    {}
  );
  const [queryRooms, setQueryRooms] = useState<ChatRoom[]>([]);
  const [manualRooms, setManualRooms] = useState<ChatRoom[]>([]);
  const allRooms = useMemo(() => {
    const byId = new Map<string, ChatRoom>();
    for (const r of queryRooms) byId.set(r.id, r);
    for (const r of manualRooms) byId.set(r.id, r);
    return [...byId.values()].sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
  }, [queryRooms, manualRooms]);

  /** Не затирать превью в списке, если снапшот комнаты временно без lastMessageText (как было в чате). */
  const [stickyDmPreviewByPeer, setStickyDmPreviewByPeer] = useState<
    Record<string, { chatId: string; lastMs: number | null; lastText: string }>
  >({});
  const [stickyGroupPreviewByChatId, setStickyGroupPreviewByChatId] = useState<
    Record<string, { lastMs: number | null; lastText: string }>
  >({});
  const [extraChatContacts, setExtraChatContacts] = useState<UserProfile[]>([]);
  /** Превью и время из подписки на последнее сообщение (если в документе чата пустой lastMessageText). */
  const [previewFromMessagesByChatId, setPreviewFromMessagesByChatId] = useState<
    Record<string, { text: string; at: number }>
  >({});

  useEffect(() => {
    setStickyDmPreviewByPeer((prev) => {
      const next = { ...prev };
      for (const peer of Object.keys(prev)) {
        if (!rooms[peer]) delete next[peer];
      }
      for (const [peer, meta] of Object.entries(rooms)) {
        const text = (meta.lastText ?? "").trim();
        if (text) {
          next[peer] = {
            chatId: meta.chatId,
            lastMs: meta.lastMs,
            lastText: meta.lastText,
          };
        }
      }
      return next;
    });
  }, [rooms]);

  useEffect(() => {
    setStickyGroupPreviewByChatId((prev) => {
      const next = { ...prev };
      const groupIds = new Set(
        allRooms
          .filter((r) => r.kind === "group" || r.id.startsWith("group_"))
          .map((r) => r.id)
      );
      for (const id of Object.keys(next)) {
        if (!groupIds.has(id)) delete next[id];
      }
      for (const r of allRooms) {
        if (r.kind !== "group" && !r.id.startsWith("group_")) continue;
        const t = (r.lastMessageText ?? "").trim();
        if (t) {
          next[r.id] = { lastMs: r.lastMessageAt, lastText: r.lastMessageText };
        }
      }
      return next;
    });
  }, [allRooms]);

  const allChatIdsForPreviewKey = useMemo(() => {
    const s = new Set<string>();
    for (const m of Object.values(rooms)) {
      if (m.chatId) s.add(m.chatId);
    }
    for (const r of allRooms) {
      if (r.kind === "group" || r.id.startsWith("group_")) s.add(r.id);
    }
    return [...s].sort().join(",");
  }, [rooms, allRooms]);

  useEffect(() => {
    const ids = allChatIdsForPreviewKey.split(",").filter(Boolean);
    if (ids.length === 0) {
      setPreviewFromMessagesByChatId({});
      return;
    }
    const unsubs = ids.map((chatId) =>
      subscribeLatestMessageForChat(
        chatId,
        (msg) => {
          if (!msg) {
            setPreviewFromMessagesByChatId((prev) => {
              const next = { ...prev };
              delete next[chatId];
              return next;
            });
            return;
          }
          setPreviewFromMessagesByChatId((prev) => ({
            ...prev,
            [chatId]: {
              text: previewLineFromChatMessage(msg),
              at: msg.createdAt,
            },
          }));
        },
        () => {}
      )
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [allChatIdsForPreviewKey]);

  const [trainingGroups, setTrainingGroups] = useState<TrainingGroup[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedGroupChatId, setSelectedGroupChatId] = useState<string | null>(null);
  /** Пока allRooms обновляется, не показывать вечную «Загрузка группы…». */
  const [pickedGroupSnapshot, setPickedGroupSnapshot] = useState<ChatRoom | null>(null);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editGroupModalOpen, setEditGroupModalOpen] = useState(false);
  const selectedChatId = useMemo(() => {
    if (selectedGroupChatId) return selectedGroupChatId;
    if (!selectedContactId) return null;
    /** Без uid пара строится как pair__other — сообщения уходят «не в тот» чат; подписка потом на другой id. */
    const me = selfId.trim();
    const peer = selectedContactId.trim();
    if (!me || !peer) return null;
    return chatIdPair(me, peer);
  }, [selectedGroupChatId, selectedContactId, selfId]);

  const { reportFocusedChatId, clearUnreadForChat, unreadByChatId } = useChatUnread();

  useEffect(() => {
    reportFocusedChatId(selectedChatId);
    return () => reportFocusedChatId(null);
  }, [selectedChatId, reportFocusedChatId]);

  useEffect(() => {
    if (!selectedChatId) return;
    clearUnreadForChat(selectedChatId);
  }, [selectedChatId, clearUnreadForChat]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [composerSending, setComposerSending] = useState(false);

  const [menu, setMenu] = useState<{
    open: boolean;
    messageId: string | null;
    x: number;
    y: number;
  }>({ open: false, messageId: null, x: 0, y: 0 });
  /** После layout — координаты, чтобы меню не выходило за края экрана */
  const [menuAdjusted, setMenuAdjusted] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [menuDeleteSubOpen, setMenuDeleteSubOpen] = useState(false);
  const [menuEmojiMoreOpen, setMenuEmojiMoreOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [forwardOverlayOpen, setForwardOverlayOpen] = useState(false);
  const [correspondenceModalOpen, setCorrespondenceModalOpen] = useState(false);
  /** 1 — первый участник, 2 — второй (с кем была переписка), 3 — просмотр ленты. */
  const [correspondenceWizardStep, setCorrespondenceWizardStep] = useState<1 | 2 | 3>(1);
  const [correspondenceViewerU1, setCorrespondenceViewerU1] = useState<UserProfile | null>(null);
  /** Второй участник pair-чата (только uid — может не быть в списке контактов админа). */
  const [correspondenceViewerU2Uid, setCorrespondenceViewerU2Uid] = useState<string | null>(null);
  const [correspondenceSecondPeerUids, setCorrespondenceSecondPeerUids] = useState<string[]>([]);
  const [correspondenceSecondPeersLoading, setCorrespondenceSecondPeersLoading] = useState(false);
  const [correspondenceViewChatId, setCorrespondenceViewChatId] = useState<string | null>(null);
  const [correspondenceViewMessages, setCorrespondenceViewMessages] = useState<ChatMessage[]>([]);
  const [correspondenceViewErr, setCorrespondenceViewErr] = useState<string | null>(null);
  const [forwardMessageIds, setForwardMessageIds] = useState<string[]>([]);
  const [forwardRecipientIds, setForwardRecipientIds] = useState<string[]>([]);
  const [batchDeleteSubOpen, setBatchDeleteSubOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const reactionBurstIdRef = useRef(0);
  /** Несколько всплесков одновременно (разные сообщения / участники), иначе последний перезаписывал бы предыдущий */
  const [reactionBursts, setReactionBursts] = useState<ReactionBurstState[]>([]);
  /** Предотвращает дубль: локальный тап ставит ref до await, эффект по snapshot не дублирует всплеск */
  const recentSelfReactionBurstRef = useRef<string | null>(null);
  const deleteParticlesCacheRef = useRef<Map<string, DeleteParticleItem[]>>(new Map());
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const deletingMessageIdRef = useRef<string | null>(null);
  /** Удаление с другой стороны: показываем ту же анимацию по кэшу сообщения */
  const [remoteDeletingIds, setRemoteDeletingIds] = useState<string[]>([]);
  const remoteDeletedMessageCacheRef = useRef<Map<string, ChatMessage>>(new Map());
  const reactionPrevSerializedRef = useRef<Map<string, string>>(new Map());
  const reactionBaselineReadyRef = useRef(false);
  const prevMessagesSnapshotRef = useRef<Map<string, ChatMessage>>(new Map());

  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
  /** Подсветка сообщения при переходе по цитате (ответу) */
  const [quoteHighlightMessageId, setQuoteHighlightMessageId] = useState<string | null>(null);
  /** Редактирование текста в нижнем композере (как «Ответить»); черновик — в `composerText` */
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const composerBackupBeforeEditRef = useRef<string>("");
  /** Подгружать черновик из localStorage только при смене чата, иначе после отправки поле могло снова заполняться. */
  const prevChatDraftKeyRef = useRef<string | null>(null);

  const [composerText, setComposerText] = useState("");
  /** Фото или PDF до отправки (превью в композере); остальные типы — сразу. */
  const [pendingAttachment, setPendingAttachment] = useState<PendingChatAttachment | null>(null);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [voiceRecordingMs, setVoiceRecordingMs] = useState(0);
  const [voiceRecordPaused, setVoiceRecordPaused] = useState(false);
  const voiceStartingRef = useRef(false);
  const voiceSessionRef = useRef<VoiceRecorderSession | null>(null);
  const voiceRecordStartMsRef = useRef(0);
  const voicePausedTotalMsRef = useRef(0);
  const voicePauseStartMsRef = useRef<number | null>(null);
  const voiceMaxTimerRef = useRef<number | null>(null);
  const voiceTickTimerRef = useRef<number | null>(null);
  /** Локальный предпросмотр перед отправкой (после «Прослушать»). */
  const [voicePreview, setVoicePreview] = useState<{
    blob: Blob;
    mime: string;
    url: string;
    durationMs: number;
  } | null>(null);
  const [lightbox, setLightbox] = useState<{ src: string; fileName: string | null } | null>(null);
  const [avatarLightbox, setAvatarLightbox] = useState<{ src: string; name: string } | null>(null);
  const [groupParticipantsViewerOpen, setGroupParticipantsViewerOpen] = useState(false);
  const [draftsMap, setDraftsMap] = useState<Record<string, string>>({});
  const [adminChatGroupCollapsedMap, setAdminChatGroupCollapsedMap] = useState<
    Record<string, boolean>
  >({});
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [typingPeerIds, setTypingPeerIds] = useState<string[]>([]);
  /** Показ ФИО по очереди при нескольких печатающих (шапка группы). */
  const [typingPeerRotateIndex, setTypingPeerRotateIndex] = useState(0);
  /** Печатающие в других чатах (список контактов / групп в боковой колонке). */
  const [typingPeersByChatId, setTypingPeersByChatId] = useState<Record<string, string[]>>(
    {}
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastMessageRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!quoteHighlightMessageId) return;
    const t = window.setTimeout(() => setQuoteHighlightMessageId(null), 2400);
    return () => window.clearTimeout(t);
  }, [quoteHighlightMessageId]);

  const focusQuotedMessage = useCallback((messageId: string) => {
    if (!messageId) return;
    requestAnimationFrame(() => {
      const safe =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(messageId)
          : messageId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const el = document.querySelector<HTMLElement>(`[data-chat-msg-id="${safe}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setQuoteHighlightMessageId(messageId);
    });
  }, []);
  const composerBarRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const typingIdleTimerRef = useRef<number | null>(null);
  const lastTypingPulseAtRef = useRef(0);
  const sendInFlightRef = useRef(false);
  /** Секция диалога: резерв под fixed-композер (--chat-thread-composer-reserve), иначе лента уезжает под композер */
  const chatRoomSectionRef = useRef<HTMLElement | null>(null);
  const chatThreadHeaderFixedRef = useRef<HTMLDivElement | null>(null);

  const adjustComposerHeight = useCallback((target?: HTMLTextAreaElement | null) => {
    const ta = target ?? composerRef.current;
    if (!ta) return;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const maxHeight = Math.max(120, Math.floor(viewportHeight * 0.5));
    ta.style.height = "auto";
    const next = Math.max(44, Math.min(ta.scrollHeight, maxHeight));
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  const [contactsReloadKey, setContactsReloadKey] = useState(0);

  const threadOpen = Boolean(selectedContactId || selectedGroupChatId);

  useEffect(() => {
    onThreadModeChange?.(threadOpen);
  }, [threadOpen, onThreadModeChange]);

  useEffect(() => {
    if (!currentUserId) return;
    setDraftsMap(readDraftMap(currentUserId));
  }, [currentUserId]);

  useEffect(() => {
    if (!isAdmin || !currentUserId) {
      setAdminChatGroupCollapsedMap({});
      return;
    }
    setAdminChatGroupCollapsedMap(readAdminChatGroupsCollapsedMap(currentUserId));
  }, [isAdmin, currentUserId]);

  useEffect(() => {
    if (!isAdmin || !currentUserId) return;
    writeAdminChatGroupsCollapsedMap(currentUserId, adminChatGroupCollapsedMap);
  }, [isAdmin, currentUserId, adminChatGroupCollapsedMap]);

  // Контакты: все активные пользователи (админ) или закреплённые курсанты (инструктор).
  useEffect(() => {
    if (contactsMode === "none") {
      setContacts([]);
      setContactsLoading(false);
      setErr(null);
      return;
    }

    if (contactsMode === "studentChat") {
      if (!authUid) {
        setContacts([]);
        setContactsLoading(false);
        return;
      }
      setContactsLoading(true);
      setErr(null);
      return subscribeStudentChatContacts(
        authUid,
        (users) => {
          setContacts(users);
          setContactsLoading(false);
        },
        (e) => {
          setErr(e.message);
          setContactsLoading(false);
        }
      );
    }

    if (!currentUserId) return;
    setContactsLoading(true);
    setErr(null);

    if (contactsMode === "allActiveUsers") {
      const { db } = getFirebase();
      const unsub = onSnapshot(
        collection(db, "users"),
        (snap) => {
          const list: UserProfile[] = [];
          for (const d of snap.docs) {
            const u = normalizeUserProfile(
              d.data() as Record<string, unknown>,
              d.id
            );
            if (u.uid === currentUserId) continue;
            /** Курсант и инструктор: active или pending (в т.ч. в чат-группу). Прочие роли — только active. */
            const peerInstructorOrStudent =
              u.role === "student" || u.role === "instructor";
            const allowInChatList =
              (peerInstructorOrStudent &&
                (u.accountStatus === "active" || u.accountStatus === "pending")) ||
              (!peerInstructorOrStudent && u.accountStatus === "active");
            if (!allowInChatList) continue;
            list.push(u);
          }
          list.sort((a, b) =>
            a.displayName.localeCompare(b.displayName, "ru")
          );
          setContacts(list);
          setContactsLoading(false);
        },
        (e) => {
          setErr(e.message);
          setContactsLoading(false);
        }
      );
      return () => unsub();
    }

    const ids = instructorAttachedKey
      ? instructorAttachedKey.split(",").filter(Boolean)
      : [];
    if (ids.length === 0) {
      setContacts([]);
      setContactsLoading(false);
      return;
    }

    return subscribeUsersByIds(ids, (users) => {
      const list = users
        .filter(
          (u) =>
            u.accountStatus === "active" ||
            (u.role === "student" && u.accountStatus === "pending")
        )
        .slice()
        .sort((a, b) => a.displayName.localeCompare(b.displayName, "ru"));
      setContacts(list);
      setContactsLoading(false);
    });
  }, [
    authUid,
    currentUserId,
    contactsReloadKey,
    contactsMode,
    instructorAttachedKey,
  ]);

  useEffect(() => {
    if (!currentUserId) return;
    if (!needsPinnedAdministrator) {
      setPrimaryAdminRow(null);
      setPrimaryAdminTried(true);
      return;
    }
    setPrimaryAdminTried(false);
    return subscribePrimaryAdministratorContact(
      (p) => {
        setPrimaryAdminRow(p);
        setPrimaryAdminTried(true);
      },
      (e) => {
        setPrimaryAdminTried(true);
        if (isFirestorePermissionDenied(e)) {
          if (import.meta.env.DEV) {
            console.warn("[subscribePrimaryAdministratorContact]", e.message);
          }
          return;
        }
        setErr(e.message);
      }
    );
  }, [currentUserId, needsPinnedAdministrator]);

  useEffect(() => {
    if (!pendingOpenUserId) return;
    setSelectedGroupChatId(null);
    setPickedGroupSnapshot(null);
    setSelectedContactId(pendingOpenUserId);
    onPendingOpenConsumed?.();
  }, [pendingOpenUserId, onPendingOpenConsumed]);

  // Комнаты/последние сообщения (группа только если uid в participantIds).
  useEffect(() => {
    const viewerUid = (authUid || currentUserId).trim();
    if (!viewerUid) return;
    const unsub = subscribeChatRoomsForUser(
      viewerUid,
      (roomsList) => {
        setQueryRooms(roomsList);
        const map: Record<
          string,
          { chatId: string; lastMs: number | null; lastText: string }
        > = {};
        for (const r of roomsList) {
          if (r.kind === "group") continue;
          const ids = [
            ...new Set(
              r.participantIds
                .map((x) => (typeof x === "string" ? x.trim() : ""))
                .filter(Boolean)
            ),
          ];
          if (ids.length !== 2 || !ids.includes(viewerUid)) continue;
          const other = ids.find((x) => x !== viewerUid);
          if (!other) continue;
          const at = r.lastMessageAt ?? 0;
          const prev = map[other];
          const prevAt = prev?.lastMs ?? 0;
          const text = (r.lastMessageText ?? "").trim();
          const prevText = (prev?.lastText ?? "").trim();
          const take =
            !prev ||
            at > prevAt ||
            (at === prevAt &&
              (text.length > prevText.length ||
                (text.length > 0 && prevText.length === 0)));
          if (take) {
            map[other] = {
              chatId: r.id,
              lastMs: r.lastMessageAt,
              lastText: r.lastMessageText,
            };
          }
        }
        setRooms(map);
      },
      (e) => {
        if (isFirestorePermissionDenied(e)) {
          if (import.meta.env.DEV) {
            console.warn("[subscribeChatRoomsForUser]", e.message);
          }
          return;
        }
        setErr(e.message);
      }
    );
    return () => unsub();
  }, [authUid, currentUserId]);

  useEffect(() => {
    const viewerUid = (authUid || currentUserId).trim();
    if (!viewerUid) {
      setManualRooms([]);
      return;
    }
    return subscribeManualGroupChatsForUser(
      viewerUid,
      (roomsList) => setManualRooms(roomsList),
      () => {}
    );
  }, [authUid, currentUserId]);

  // Сообщения (личный pair_*: без документа чата правила messages требуют exists(parent) — иначе permission-denied)
  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    let unsubMessages: (() => void) | null = null;
    let permissionRetries = 0;
    const MAX_PAIR_PERM_RETRIES = 5;

    const attachMessagesListener = () => {
      if (cancelled) return;
      unsubMessages?.();
      unsubMessages = subscribeMessagesForChat(
        selectedChatId,
        (list) => setMessages(list),
        (e) => {
          const me = selfId.trim();
          const peer = selectedContactId?.trim() ?? "";
          const isPairDm =
            selectedChatId.startsWith("pair_") &&
            !selectedGroupChatId &&
            Boolean(me && peer);
          if (
            isPairDm &&
            isFirestorePermissionDenied(e) &&
            permissionRetries < MAX_PAIR_PERM_RETRIES
          ) {
            permissionRetries += 1;
            void ensurePairChatExists(me, peer)
              .catch(() => {})
              .finally(() => {
                if (!cancelled) {
                  window.setTimeout(
                    () => attachMessagesListener(),
                    150 * permissionRetries
                  );
                }
              });
            return;
          }
          setErr(e.message);
        }
      );
    };

    void (async () => {
      const me = selfId.trim();
      const peer = selectedContactId?.trim() ?? "";
      const isPairDm =
        selectedChatId.startsWith("pair_") &&
        !selectedGroupChatId &&
        Boolean(me && peer);
      if (isPairDm) {
        try {
          await ensurePairChatExists(me, peer);
        } catch (err: unknown) {
          if (!cancelled) {
            setErr(
              err instanceof Error
                ? err.message
                : "Не удалось открыть личный чат. Проверьте соединение."
            );
          }
          return;
        }
      }
      if (cancelled) return;
      attachMessagesListener();
    })();

    return () => {
      cancelled = true;
      unsubMessages?.();
      unsubMessages = null;
    };
  }, [selectedChatId, selectedGroupChatId, selectedContactId, selfId]);

  useEffect(() => {
    if (!selectedChatId) {
      reactionBaselineReadyRef.current = false;
      reactionPrevSerializedRef.current.clear();
      prevMessagesSnapshotRef.current.clear();
      setRemoteDeletingIds([]);
      remoteDeletedMessageCacheRef.current.clear();
      setReactionBursts([]);
      recentSelfReactionBurstRef.current = null;
    }
  }, [selectedChatId]);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedMessageIds([]);
    setForwardOverlayOpen(false);
    setForwardRecipientIds([]);
    setForwardMessageIds([]);
    setBatchDeleteSubOpen(false);
  }, [selectedChatId]);

  const messagesFiltered = useMemo(() => {
    const me = selfId.trim();
    if (!me) return [];
    return messages.filter((m) => {
      if (m.deletedForAll) return false;
      const arr = m.deletedForMeBy ?? [];
      return !arr.includes(me);
    });
  }, [messages, selfId]);

  const messageById = useMemo(() => {
    const m = new Map<string, ChatMessage>();
    for (const msg of messagesFiltered) m.set(msg.id, msg);
    return m;
  }, [messagesFiltered]);

  const messagesForDisplay = useMemo(() => {
    const base = [...messagesFiltered];
    const seen = new Set(base.map((x) => x.id));
    for (const id of remoteDeletingIds) {
      if (seen.has(id)) continue;
      const msg = remoteDeletedMessageCacheRef.current.get(id);
      if (msg) {
        base.push(msg);
        seen.add(id);
      }
    }
    return base.sort((a, b) => a.createdAt - b.createdAt);
  }, [messagesFiltered, remoteDeletingIds]);

  const messageByIdForRender = useMemo(() => {
    const m = new Map<string, ChatMessage>();
    for (const msg of messagesForDisplay) m.set(msg.id, msg);
    return m;
  }, [messagesForDisplay]);

  const lastMsgId = messagesForDisplay[messagesForDisplay.length - 1]?.id ?? null;

  const messageTimeline = useMemo(
    () => groupChatMessagesByDay(messagesForDisplay),
    [messagesForDisplay]
  );

  const correspondenceTimeline = useMemo(
    () => groupChatMessagesByDay(correspondenceViewMessages),
    [correspondenceViewMessages]
  );

  useEffect(() => {
    deletingMessageIdRef.current = deletingMessageId;
  }, [deletingMessageId]);

  const scrollChatToBottom = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    root.scrollTop = Math.max(0, root.scrollHeight - root.clientHeight);
  }, []);

  const updateScrollToBottomVisibility = useCallback(() => {
    const root = scrollRef.current;
    if (!root) {
      setShowScrollToBottom(false);
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = root;
    const distFromBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollToBottom(distFromBottom > 72);
  }, []);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const onScroll = () => updateScrollToBottomVisibility();
    onScroll();
    root.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(root);
    return () => {
      root.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [selectedChatId, messagesForDisplay.length, updateScrollToBottomVisibility]);

  useLayoutEffect(() => {
    if (messagesForDisplay.length === 0) return;
    scrollChatToBottom();
    requestAnimationFrame(() => {
      scrollChatToBottom();
      updateScrollToBottomVisibility();
    });
  }, [
    messagesForDisplay.length,
    lastMsgId,
    selectedChatId,
    scrollChatToBottom,
    updateScrollToBottomVisibility,
  ]);

  const contactsForUi = useMemo(() => {
    if (!needsPinnedAdministrator || !primaryAdminRow) {
      return contacts;
    }
    const tail = contacts.filter((c) => c.uid !== primaryAdminRow.uid);
    return [primaryAdminRow, ...tail];
  }, [contacts, needsPinnedAdministrator, primaryAdminRow]);

  const viewerUidForPeers = (authUid || currentUserId).trim();

  const peerUidsFromPairRooms = useMemo(() => {
    const me = viewerUidForPeers;
    if (!me) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of allRooms) {
      if (r.kind === "group") continue;
      if (r.id.startsWith("group_")) continue;
      const ids = [
        ...new Set(
          r.participantIds
            .map((x) => (typeof x === "string" ? x.trim() : ""))
            .filter(Boolean)
        ),
      ];
      if (ids.length !== 2 || !ids.includes(me)) continue;
      const other = ids.find((x) => x !== me);
      if (other && !seen.has(other)) {
        seen.add(other);
        out.push(other);
      }
    }
    return out;
  }, [allRooms, viewerUidForPeers]);

  const missingPeerUids = useMemo(() => {
    const known = new Set(
      contactsForUi.map((c) => c.uid.trim()).filter(Boolean)
    );
    return peerUidsFromPairRooms.filter((uid) => uid && !known.has(uid));
  }, [contactsForUi, peerUidsFromPairRooms]);

  const missingPeerUidsKey = missingPeerUids.slice().sort().join(",");

  useEffect(() => {
    if (missingPeerUids.length === 0) {
      setExtraChatContacts([]);
      return;
    }
    return subscribeUsersByIds(missingPeerUids, setExtraChatContacts);
  }, [missingPeerUidsKey]);

  const contactsForChatList = useMemo(() => {
    const byUid = new Map<string, UserProfile>();
    for (const c of contactsForUi) {
      if (!canShowInChatContacts(c)) continue;
      byUid.set(c.uid.trim(), c);
    }
    for (const c of extraChatContacts) {
      if (!canShowInChatContacts(c)) continue;
      const id = c.uid.trim();
      if (id && !byUid.has(id)) byUid.set(id, c);
    }
    return Array.from(byUid.values());
  }, [contactsForUi, extraChatContacts]);

  useEffect(() => {
    if (!selectedContactId) return;
    const exists = contactsForChatList.some((c) => c.uid === selectedContactId);
    if (exists) return;
    setSelectedContactId(null);
  }, [selectedContactId, contactsForChatList]);

  const profileByUidForChat = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const c of contactsForChatList) {
      const id = c.uid.trim();
      if (id) map.set(id, c);
    }
    if (primaryAdminRow) {
      const id = primaryAdminRow.uid.trim();
      if (id) map.set(id, primaryAdminRow);
    }
    for (const p of groupParticipantProfiles) {
      const id = p.uid.trim();
      if (id) map.set(id, p);
    }
    return map;
  }, [contactsForChatList, primaryAdminRow, groupParticipantProfiles]);

  const getProfileForMessageSender = useCallback(
    (
      senderId: string
    ): Pick<UserProfile, "uid" | "displayName" | "avatarDataUrl"> & {
      role: UserProfile["role"] | null;
    } => {
      const uid = senderId.trim();
      const hit = profileByUidForChat.get(uid);
      if (hit) {
        return {
          uid: hit.uid,
          displayName: hit.displayName,
          avatarDataUrl: hit.avatarDataUrl ?? null,
          role: hit.role,
        };
      }
      return {
        uid: senderId,
        displayName: "Участник",
        avatarDataUrl: null,
        role: null,
      };
    },
    [profileByUidForChat]
  );

  const correspondenceViewMessageById = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const m of correspondenceViewMessages) map.set(m.id, m);
    return map;
  }, [correspondenceViewMessages]);

  const studentContactUidSet = useMemo(
    () =>
      new Set(
        contactsForUi
          .filter((c) => c.role === "student")
          .map((c) => c.uid.trim())
          .filter(Boolean)
      ),
    [contactsForUi]
  );

  /** Превью в списке: trim uid + fallback для «Администратор» у инструктора. */
  const roomMetaByContactUid = useMemo(() => {
    const next: Record<
      string,
      { chatId: string; lastMs: number | null; lastText: string }
    > = { ...rooms };
    const me = currentUserId.trim();
    const adminUid = primaryAdminRow?.uid.trim();
    if (
      profile?.role === "instructor" &&
      adminUid &&
      me &&
      !next[adminUid]
    ) {
      const hit = findLatestPairRoomWherePeerNotInSet(
        allRooms,
        me,
        studentContactUidSet
      );
      if (hit) {
        next[adminUid] = {
          chatId: hit.id,
          lastMs: hit.lastMessageAt,
          lastText: hit.lastMessageText,
        };
      }
    }
    for (const peer of Object.keys(next)) {
      const meta = next[peer];
      const text = (meta.lastText ?? "").trim();
      if (!text && stickyDmPreviewByPeer[peer]) {
        const s = stickyDmPreviewByPeer[peer];
        if (s.chatId === meta.chatId) {
          next[peer] = {
            ...meta,
            lastText: s.lastText,
            lastMs: meta.lastMs ?? s.lastMs,
          };
        }
      }
    }
    for (const peer of Object.keys(next)) {
      const meta = next[peer];
      const fromMsg = previewFromMessagesByChatId[meta.chatId];
      if (fromMsg) {
        const fsAt = meta.lastMs ?? 0;
        const textFs = (meta.lastText ?? "").trim();
        if (!textFs || fromMsg.at >= fsAt) {
          next[peer] = {
            ...meta,
            lastText: fromMsg.text,
            lastMs: Math.max(fsAt, fromMsg.at),
          };
        }
      }
    }
    return next;
  }, [
    rooms,
    allRooms,
    currentUserId,
    profile?.role,
    primaryAdminRow?.uid,
    studentContactUidSet,
    stickyDmPreviewByPeer,
    previewFromMessagesByChatId,
  ]);

  const selectedContact = useMemo(() => {
    if (!selectedContactId) return null;
    return contactsForChatList.find((c) => c.uid === selectedContactId) ?? null;
  }, [contactsForChatList, selectedContactId]);

  const groupRooms = useMemo(() => {
    return allRooms
      .filter((r) => r.kind === "group" || r.id.startsWith("group_"))
      .sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
  }, [allRooms]);

  const sidebarTypingChatIdsKey = useMemo(() => {
    const me = selfId.trim();
    if (!me) return "";
    const ids = new Set<string>();
    for (const c of contactsForChatList) {
      const peer = c.uid.trim();
      if (peer) ids.add(chatIdPair(me, peer));
    }
    for (const g of groupRooms) {
      ids.add(g.id);
    }
    return [...ids].sort().join(",");
  }, [selfId, contactsForChatList, groupRooms]);

  useEffect(() => {
    const me = selfId.trim();
    if (!me) {
      setTypingPeersByChatId({});
      return;
    }
    const chatIds = sidebarTypingChatIdsKey.split(",").filter(Boolean);
    if (chatIds.length === 0) {
      setTypingPeersByChatId({});
      return;
    }
    setTypingPeersByChatId({});
    const unsubs = chatIds.map((chatId) =>
      subscribeChatTypingPeers(
        chatId,
        me,
        (peers) => {
          setTypingPeersByChatId((prev) => {
            const merged = { ...prev };
            if (peers.length === 0) delete merged[chatId];
            else merged[chatId] = peers;
            return merged;
          });
        },
        () => {
          setTypingPeersByChatId((prev) => {
            if (!(chatId in prev)) return prev;
            const merged = { ...prev };
            delete merged[chatId];
            return merged;
          });
        }
      )
    );
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [sidebarTypingChatIdsKey, selfId]);

  /** Личные чаты: «Администратор» закреплён сверху, остальные — по последней активности и имени. */
  const contactsOrdered = useMemo(() => {
    const byActivity = (a: UserProfile, b: UserProfile) => {
      const ta = roomMetaByContactUid[a.uid.trim()]?.lastMs ?? 0;
      const tb = roomMetaByContactUid[b.uid.trim()]?.lastMs ?? 0;
      if (tb !== ta) return tb - ta;
      return a.displayName.localeCompare(b.displayName, "ru");
    };
    if (!primaryAdminRow) {
      return [...contactsForChatList].sort(byActivity);
    }
    const rest = contactsForChatList.filter((c) => c.uid !== primaryAdminRow.uid);
    rest.sort(byActivity);
    return [primaryAdminRow, ...rest];
  }, [contactsForChatList, primaryAdminRow, roomMetaByContactUid]);

  const contactsListLoading =
    contactsLoading || (needsPinnedAdministrator && !primaryAdminTried);

  const trainingGroupNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of trainingGroups) {
      const id = g.id.trim();
      if (!id) continue;
      map.set(id, g.name.trim() || "Без названия");
    }
    return map;
  }, [trainingGroups]);

  const adminInstructorContacts = useMemo(
    () => contactsOrdered.filter((c) => c.role === "instructor"),
    [contactsOrdered]
  );

  const adminStudentGroupContacts = useMemo(() => {
    const buckets = new Map<string, { title: string; students: UserProfile[] }>();
    for (const c of contactsOrdered) {
      if (c.role !== "student") continue;
      const gid = c.groupId?.trim() || "__no_group__";
      const title =
        gid === "__no_group__"
          ? "Без группы"
          : trainingGroupNameById.get(gid) || "Группа";
      if (!buckets.has(gid)) {
        buckets.set(gid, { title, students: [] });
      }
      buckets.get(gid)?.students.push(c);
    }
    const groups = [...buckets.entries()].map(([id, payload]) => ({
      id,
      title: payload.title,
      students: payload.students.sort((a, b) =>
        a.displayName.localeCompare(b.displayName, "ru")
      ),
    }));
    groups.sort((a, b) => a.title.localeCompare(b.title, "ru"));
    return groups;
  }, [contactsOrdered, trainingGroupNameById]);

  const toggleAdminStudentGroupCollapsed = useCallback((groupId: string) => {
    setAdminChatGroupCollapsedMap((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  }, []);

  const selectedGroupRoom = useMemo(() => {
    const id = selectedGroupChatId;
    if (!id) return null;
    const fromAll = allRooms.find((r) => r.id === id) ?? null;
    if (fromAll) return fromAll;
    if (pickedGroupSnapshot?.id === id) return pickedGroupSnapshot;
    return null;
  }, [allRooms, selectedGroupChatId, pickedGroupSnapshot]);

  const groupParticipantIdsKey = useMemo(() => {
    if (!selectedGroupRoom?.participantIds?.length) return "";
    return [...selectedGroupRoom.participantIds]
      .map((x) => (typeof x === "string" ? x.trim() : String(x)))
      .filter(Boolean)
      .sort()
      .join(",");
  }, [selectedGroupRoom?.participantIds]);

  useEffect(() => {
    if (!selectedGroupChatId || !groupParticipantIdsKey) {
      setGroupParticipantProfiles([]);
      return;
    }
    const ids = groupParticipantIdsKey.split(",").filter(Boolean);
    return subscribeUsersByIds(ids, (users) => {
      setGroupParticipantProfiles(users.filter((u) => u.accountStatus !== "rejected"));
    });
  }, [selectedGroupChatId, groupParticipantIdsKey]);

  const displayNameForUid = useCallback(
    (uid: string) => {
      if (uid === currentUserId) return "Вы";
      const hit = profileByUidForChat.get(uid.trim());
      return hit ? formatShortFio(hit.displayName) : "Участник";
    },
    [profileByUidForChat, currentUserId]
  );

  /** iOS Safari: при клавиатуре layout viewport и видимая область расходятся — поднимаем композер к низу visualViewport.
   *  Плюс резерв высоты под fixed-композер, чтобы карточка ленты не уходила под него (скругления и последнее сообщение). */
  useLayoutEffect(() => {
    if (!selectedContactId && !selectedGroupChatId) return;
    const bar = composerBarRef.current;
    const room = chatRoomSectionRef.current;
    if (!bar || !room) return;

    const syncVisualViewport = () => {
      const vv = window.visualViewport;
      if (!vv) {
        bar.style.removeProperty("bottom");
        return;
      }
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      bar.style.bottom = `${gap}px`;
    };

    const touchCoarse =
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    /** На iOS Safari getBoundingClientRect/visualViewport иногда дают +1–3px «воздуха» */
    const shrinkHeaderPx = touchCoarse ? 2 : 0;
    const shrinkReservePx = touchCoarse ? 3 : 0;

    const syncHeaderOffset = () => {
      const header = chatThreadHeaderFixedRef.current;
      if (!header) return;
      const h = header.getBoundingClientRect().height;
      room.style.setProperty(
        "--chat-thread-header-offset",
        `${Math.max(0, h - shrinkHeaderPx)}px`
      );
    };

    const syncComposerReserve = () => {
      const r = bar.getBoundingClientRect();
      const vv = window.visualViewport;
      const ih = window.innerHeight;
      let bottomEdge = ih;
      if (vv != null) {
        const vvBottom = vv.offsetTop + vv.height;
        bottomEdge = Math.min(ih, Math.max(vvBottom, 0));
      }
      const reserve = Math.max(0, bottomEdge - r.top - shrinkReservePx);
      room.style.setProperty("--chat-thread-composer-reserve", `${reserve}px`);
    };

    const syncAll = () => {
      syncVisualViewport();
      syncHeaderOffset();
      syncComposerReserve();
    };

    const ro = new ResizeObserver(() => {
      syncAll();
    });
    ro.observe(bar);
    const header = chatThreadHeaderFixedRef.current;
    if (header) ro.observe(header);

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", syncAll);
      vv.addEventListener("scroll", syncAll);
    }
    window.addEventListener("resize", syncAll);
    syncAll();
    queueMicrotask(syncAll);

    return () => {
      ro.disconnect();
      if (vv) {
        vv.removeEventListener("resize", syncAll);
        vv.removeEventListener("scroll", syncAll);
      }
      window.removeEventListener("resize", syncAll);
      bar.style.removeProperty("bottom");
      room.style.removeProperty("--chat-thread-composer-reserve");
      room.style.removeProperty("--chat-thread-header-offset");
    };
  }, [selectedContactId, selectedGroupChatId, replyToMessageId, editingMessageId, selectionMode]);

  const selectedContactName = selectedContact
    ? formatShortFio(selectedContact.displayName)
    : "Контакт";

  const debouncedDmPeerPresenceOnline = useDebouncedPresenceOnline(
    selectedGroupChatId ? undefined : selectedContact?.presence,
    chatPrivacy,
    selectedGroupChatId ? "__group__" : selectedContactId ?? ""
  );

  const dmPeerShowsOnline =
    !selectedGroupChatId &&
    selectedContact != null &&
    chatPrivacy.showPresenceInChatUi &&
    debouncedDmPeerPresenceOnline;

  const dmChatHeaderSubtitle = useMemo(() => {
    if (!selectedContact) return null;
    if (!chatPrivacy.showPresenceInChatUi) return null;
    const canShowLastSeenByRole =
      selectedContact.role === "admin"
        ? currentUserRole === "admin"
          ? true
          : currentUserRole === "instructor"
            ? showLastSeenByRole.showInstructorLastSeen
            : showLastSeenByRole.showStudentLastSeen
        : selectedContact.role === "instructor"
          ? showLastSeenByRole.showInstructorLastSeen
          : showLastSeenByRole.showStudentLastSeen;
    const ms =
      canShowLastSeenByRole && !debouncedDmPeerPresenceOnline
        ? adminContactOfflinePresenceMs(selectedContact.presence)
        : null;
    const offlineLabel =
      ms != null ? formatAdminContactLastSeenWhenOffline(ms) : null;
    const offlineText =
      debouncedDmPeerPresenceOnline
        ? "в сети"
        : offlineLabel
          ? `не в сети (${offlineLabel})`
          : "не в сети";
    return (
      <span
        className={
          debouncedDmPeerPresenceOnline
            ? "chat-room-presence chat-room-presence--online"
            : "chat-room-presence"
        }
      >
        {offlineText}
      </span>
    );
  }, [
    selectedContact,
    chatPrivacy.showPresenceInChatUi,
    debouncedDmPeerPresenceOnline,
    showLastSeenByRole.showInstructorLastSeen,
    showLastSeenByRole.showStudentLastSeen,
    currentUserRole,
  ]);

  const typingPeerIdsOrdered = useMemo(
    () => [...typingPeerIds].sort(),
    [typingPeerIds]
  );

  const typingPeerListKey = useMemo(
    () => typingPeerIdsOrdered.join(","),
    [typingPeerIdsOrdered]
  );

  useEffect(() => {
    setTypingPeerRotateIndex(0);
  }, [typingPeerListKey]);

  useEffect(() => {
    if (typingPeerIdsOrdered.length <= 1) return;
    const id = window.setInterval(() => {
      setTypingPeerRotateIndex((i) => {
        const len = typingPeerIdsOrdered.length;
        if (len <= 1) return 0;
        return (i + 1) % len;
      });
    }, 2000);
    return () => window.clearInterval(id);
  }, [typingPeerListKey, typingPeerIdsOrdered.length]);

  const chatHeaderTypingLine = useMemo(() => {
    if (typingPeerIdsOrdered.length === 0) return null;
    const idx =
      typingPeerIdsOrdered.length === 1
        ? 0
        : typingPeerRotateIndex % typingPeerIdsOrdered.length;
    const peerId = typingPeerIdsOrdered[idx];
    if (!peerId) return null;
    const name = displayNameForUid(peerId);
    return (
      <div className="chat-room-user-typing" role="status" aria-live="polite">
        <span className="chat-room-user-typing-keys" aria-hidden>
          <span className="chat-room-user-typing-key" />
          <span className="chat-room-user-typing-key" />
          <span className="chat-room-user-typing-key" />
        </span>
        <span className="chat-room-user-typing-text">
          {name} печатает
        </span>
      </div>
    );
  }, [typingPeerIdsOrdered, typingPeerRotateIndex, displayNameForUid]);

  const persistDraft = (storageKey: string | null, text: string) => {
    if (!currentUserId || !storageKey) return;
    const map = readDraftMap(currentUserId);
    const trimmed = text.trim();
    if (!trimmed) delete map[storageKey];
    else map[storageKey] = text;
    writeDraftMap(currentUserId, map);
    setDraftsMap({ ...map });
  };

  useEffect(() => {
    const key = selectedGroupChatId ?? selectedContactId;
    if (!currentUserId) {
      prevChatDraftKeyRef.current = null;
      return;
    }
    if (!key) {
      prevChatDraftKeyRef.current = null;
      return;
    }
    if (prevChatDraftKeyRef.current === key) {
      return;
    }
    prevChatDraftKeyRef.current = key;
    const raw = readDraftMap(currentUserId)[key] ?? "";
    setComposerText(raw);
  }, [selectedContactId, selectedGroupChatId, currentUserId]);

  useEffect(() => {
    setEditingMessageId(null);
  }, [selectedContactId, selectedGroupChatId]);

  useEffect(() => {
    setPendingAttachment((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setLightbox(null);
    setAvatarLightbox(null);
  }, [selectedContactId, selectedGroupChatId]);

  useEffect(() => {
    const me = selfId.trim();
    if (!selectedChatId || !me) {
      setTypingPeerIds([]);
      return;
    }
    const unsub = subscribeChatTypingPeers(
      selectedChatId,
      me,
      (peers) => setTypingPeerIds(peers),
      (e) => {
        setTypingPeerIds([]);
        if (import.meta.env.DEV) {
          console.warn("[chat typing]", e.message);
        }
      }
    );
    return () => {
      unsub();
      void clearChatTypingIndicator(selectedChatId, me);
      if (typingIdleTimerRef.current != null) {
        window.clearTimeout(typingIdleTimerRef.current);
        typingIdleTimerRef.current = null;
      }
      lastTypingPulseAtRef.current = 0;
    };
  }, [selectedChatId, selfId]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  useEffect(() => {
    if (!avatarLightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAvatarLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [avatarLightbox]);

  useEffect(() => {
    setGroupParticipantsViewerOpen(false);
  }, [selectedGroupChatId]);

  const closeCorrespondenceModal = useCallback(() => {
    setCorrespondenceModalOpen(false);
    setCorrespondenceWizardStep(1);
    setCorrespondenceViewerU1(null);
    setCorrespondenceViewerU2Uid(null);
    setCorrespondenceSecondPeerUids([]);
    setCorrespondenceSecondPeersLoading(false);
    setCorrespondenceViewChatId(null);
    setCorrespondenceViewMessages([]);
    setCorrespondenceViewErr(null);
  }, []);

  useEffect(() => {
    if (!correspondenceModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCorrespondenceModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [correspondenceModalOpen, closeCorrespondenceModal]);

  useEffect(() => {
    if (!correspondenceViewChatId || correspondenceWizardStep !== 3) {
      if (!correspondenceViewChatId) setCorrespondenceViewMessages([]);
      return;
    }
    setCorrespondenceViewErr(null);
    const unsub = subscribeMessagesForChat(
      correspondenceViewChatId,
      (list) => setCorrespondenceViewMessages(list),
      (e) => setCorrespondenceViewErr(e.message)
    );
    return () => unsub();
  }, [correspondenceViewChatId, correspondenceWizardStep]);

  const cancelEditingComposer = useCallback(() => {
    if (!editingMessageId) return;
    setEditingMessageId(null);
    const restored = composerBackupBeforeEditRef.current;
    setComposerText(restored);
    const key = selectedGroupChatId ?? selectedContactId;
    if (key) persistDraft(key, restored);
  }, [editingMessageId, selectedContactId, selectedGroupChatId]);

  const handleComposerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    adjustComposerHeight(e.target);
    setComposerText(v);
    const key = selectedGroupChatId ?? selectedContactId;
    if (key && !editingMessageId) persistDraft(key, v);

    if (editingMessageId || !selectedChatId || !selfId.trim()) return;

    if (typingIdleTimerRef.current != null) {
      window.clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }

    if (!v.trim()) {
      void clearChatTypingIndicator(selectedChatId, selfId.trim());
      lastTypingPulseAtRef.current = 0;
      return;
    }

    const now = Date.now();
    if (now - lastTypingPulseAtRef.current >= CHAT_TYPING_PULSE_MS) {
      lastTypingPulseAtRef.current = now;
      void pulseChatTypingIndicator(selectedChatId, selfId.trim()).catch(() => {
        /* правила / сеть — не блокируем ввод */
      });
    }

    const tid = window.setTimeout(() => {
      typingIdleTimerRef.current = null;
      void clearChatTypingIndicator(selectedChatId, selfId.trim());
      lastTypingPulseAtRef.current = 0;
    }, CHAT_TYPING_IDLE_MS);
    typingIdleTimerRef.current = tid;
  };

  useLayoutEffect(() => {
    adjustComposerHeight();
  }, [composerText, selectedChatId, adjustComposerHeight]);

  useEffect(() => {
    const onResize = () => adjustComposerHeight();
    window.addEventListener("resize", onResize);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      vv?.removeEventListener("resize", onResize);
    };
  }, [adjustComposerHeight]);

  const handleSend = async () => {
    if (sendInFlightRef.current) return;

    const draftKey = selectedGroupChatId ?? selectedContactId;
    if (!draftKey) {
      setErr("Выберите чат: контакт или группу.");
      return;
    }
    if (!selfId.trim()) {
      setErr("Войдите в аккаунт, чтобы отправить сообщение.");
      return;
    }
    if (!selectedChatId) {
      setErr("Не удалось определить чат. Закройте диалог и откройте контакт снова.");
      return;
    }
    if (selfId.trim()) void clearChatTypingIndicator(selectedChatId, selfId.trim());
    if (typingIdleTimerRef.current != null) {
      window.clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
    lastTypingPulseAtRef.current = 0;

    if (editingMessageId) {
      const next = composerText.trim();
      if (!next) return;
      sendInFlightRef.current = true;
      setComposerSending(true);
      const chatId = selectedChatId;
      try {
        setErr(null);
        await editChatTextMessage({
          chatId,
          messageId: editingMessageId,
          userId: currentUserId,
          nextText: next,
        });
        setEditingMessageId(null);
        composerBackupBeforeEditRef.current = "";
        setComposerText("");
        persistDraft(draftKey, "");
        requestAnimationFrame(() => {
          composerRef.current?.focus();
        });
        scrollChatToBottom();
        requestAnimationFrame(() => scrollChatToBottom());
      } catch (e: any) {
        setErr(e?.message ?? "Ошибка сохранения");
      } finally {
        sendInFlightRef.current = false;
        setComposerSending(false);
      }
      return;
    }

    if (pendingAttachment) {
      const pa = pendingAttachment;
      const textAfterSnapshot = composerText.trim();
      const rt = replyToMessageId;
      sendInFlightRef.current = true;
      setComposerSending(true);
      try {
        setErr(null);
        const dataUrl = await readFileAsDataUrl(pa.file);
        if (dataUrl.length > MAX_CHAT_PAYLOAD_CHARS) {
          setErr(
            pa.kind === "image"
              ? "Фото слишком большое для чата (лимит хранилища). Выберите файл меньше."
              : "Файл слишком большой для чата (лимит хранилища). Выберите файл меньше."
          );
          return;
        }
        const isImg = pa.kind === "image";
        const mime = isImg ? pa.file.type || "image/jpeg" : "application/pdf";
        if (selectedGroupChatId) {
          await sendChatAttachmentMessage({
            fromUserId: selfId.trim(),
            chatId: selectedGroupChatId,
            messageType: isImg ? "image" : "file",
            payloadDataUrl: dataUrl,
            fileName: pa.file.name,
            mimeType: mime || null,
            replyToMessageId: rt,
          });
        } else if (selectedContactId) {
          await sendChatAttachmentMessage({
            fromUserId: selfId.trim(),
            toUserId: selectedContactId,
            chatId: selectedChatId,
            messageType: isImg ? "image" : "file",
            payloadDataUrl: dataUrl,
            fileName: pa.file.name,
            mimeType: mime || null,
            replyToMessageId: rt,
          });
        } else {
          setErr("Выберите получателя.");
          return;
        }
        playOutgoingChatSound(selfId.trim());
        const prevUrl = pa.previewUrl;
        setPendingAttachment(null);
        URL.revokeObjectURL(prevUrl);
        setReplyToMessageId(null);
        if (textAfterSnapshot) {
          if (selectedGroupChatId) {
            await sendChatTextMessage({
              fromUserId: selfId.trim(),
              chatId: selectedGroupChatId,
              text: textAfterSnapshot,
              replyToMessageId: null,
            });
          } else if (selectedContactId) {
            await sendChatTextMessage({
              fromUserId: selfId.trim(),
              toUserId: selectedContactId,
              chatId: selectedChatId,
              text: textAfterSnapshot,
              replyToMessageId: null,
            });
          }
          playOutgoingChatSound(selfId.trim());
        }
        setComposerText("");
        persistDraft(draftKey, "");
        requestAnimationFrame(() => {
          composerRef.current?.focus();
        });
        scrollChatToBottom();
        requestAnimationFrame(() => scrollChatToBottom());
      } catch (e: any) {
        setErr(e?.message ?? "Ошибка отправки");
      } finally {
        sendInFlightRef.current = false;
        setComposerSending(false);
      }
      return;
    }

    const text = composerText.trim();
    if (!text) return;

    const replySnapshot = replyToMessageId;
    sendInFlightRef.current = true;
    setComposerSending(true);
    setComposerText("");
    persistDraft(draftKey, "");
    setReplyToMessageId(null);
    try {
      setErr(null);
      if (selectedGroupChatId) {
        await sendChatTextMessage({
          fromUserId: selfId.trim(),
          chatId: selectedGroupChatId,
          text,
          replyToMessageId: replySnapshot,
        });
      } else if (selectedContactId) {
        await sendChatTextMessage({
          fromUserId: selfId.trim(),
          toUserId: selectedContactId,
          chatId: selectedChatId,
          text,
          replyToMessageId: replySnapshot,
        });
      } else {
        setComposerText(text);
        persistDraft(draftKey, text);
        setReplyToMessageId(replySnapshot);
        setErr("Выберите получателя.");
        return;
      }
      playOutgoingChatSound(selfId.trim());
      requestAnimationFrame(() => {
        composerRef.current?.focus();
      });
      scrollChatToBottom();
      requestAnimationFrame(() => scrollChatToBottom());
    } catch (e: any) {
      setComposerText(text);
      persistDraft(draftKey, text);
      setReplyToMessageId(replySnapshot);
      setErr(e?.message ?? "Ошибка отправки");
    } finally {
      sendInFlightRef.current = false;
      setComposerSending(false);
    }
  };

  const handlePickAttachment = async (file: File) => {
    const draftKey = selectedGroupChatId ?? selectedContactId;
    if (!draftKey) {
      setErr("Сначала откройте чат.");
      return;
    }
    if (!currentUserId || !selectedChatId) {
      setErr("Дождитесь входа в аккаунт и откройте чат.");
      return;
    }
    if (editingMessageId) cancelEditingComposer();
    const mime = file.type;
    if (mime.startsWith("image/")) {
      setErr(null);
      try {
        const { file: outFile, previewUrl } = await compressImageFileForChat(file);
        setPendingAttachment((prev) => {
          if (prev) URL.revokeObjectURL(prev.previewUrl);
          return { kind: "image" as const, previewUrl, file: outFile };
        });
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Не удалось обработать фото");
      }
      return;
    }
    if (isPdfFile(file)) {
      if (file.size > MAX_CHAT_FILE_BYTES) {
        setErr(`Файл слишком большой (макс. ~${CHAT_FILE_MAX_KB_HINT} КБ).`);
        return;
      }
      setErr(null);
      setPendingAttachment((prev) => {
        if (prev) URL.revokeObjectURL(prev.previewUrl);
        return {
          kind: "pdf" as const,
          previewUrl: URL.createObjectURL(file),
          file,
        };
      });
      return;
    }
    if (file.size > MAX_CHAT_FILE_BYTES) {
      setErr(`Файл слишком большой (макс. ~${CHAT_FILE_MAX_KB_HINT} КБ).`);
      return;
    }
    setPendingAttachment((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setErr(null);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl.length > MAX_CHAT_PAYLOAD_CHARS) {
        setErr("Вложение слишком большое для чата.");
        return;
      }
      let messageType: Exclude<ChatMessageType, "text"> = "file";
      if (mime.startsWith("audio/")) messageType = "voice";
      if (selectedGroupChatId) {
        await sendChatAttachmentMessage({
          fromUserId: selfId.trim(),
          chatId: selectedGroupChatId,
          messageType,
          payloadDataUrl: dataUrl,
          fileName: file.name,
          mimeType: mime || null,
          replyToMessageId,
        });
        playOutgoingChatSound(selfId.trim());
      } else if (selectedContactId) {
        await sendChatAttachmentMessage({
          fromUserId: selfId.trim(),
          toUserId: selectedContactId,
          chatId: selectedChatId,
          messageType,
          payloadDataUrl: dataUrl,
          fileName: file.name,
          mimeType: mime || null,
          replyToMessageId,
        });
        playOutgoingChatSound(selfId.trim());
      }
      setReplyToMessageId(null);
    } catch (e: any) {
      setErr(e?.message ?? "Ошибка отправки");
    }
  };

  const clearVoiceTimers = useCallback(() => {
    if (voiceMaxTimerRef.current != null) {
      window.clearTimeout(voiceMaxTimerRef.current);
      voiceMaxTimerRef.current = null;
    }
    if (voiceTickTimerRef.current != null) {
      window.clearInterval(voiceTickTimerRef.current);
      voiceTickTimerRef.current = null;
    }
  }, []);

  const getVoiceElapsedMs = useCallback((): number => {
    const start = voiceRecordStartMsRef.current;
    if (!start) return 0;
    const extra = voicePausedTotalMsRef.current;
    const ps = voicePauseStartMsRef.current;
    if (ps != null) {
      return Date.now() - start - extra - (Date.now() - ps);
    }
    return Date.now() - start - extra;
  }, []);

  const resetVoicePauseState = useCallback(() => {
    voicePausedTotalMsRef.current = 0;
    voicePauseStartMsRef.current = null;
    setVoiceRecordPaused(false);
  }, []);

  const readBlobAsDataUrl = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("Не удалось прочитать запись"));
      r.readAsDataURL(blob);
    });
  }, []);

  const sendVoiceBlob = useCallback(
    async (blob: Blob, mime: string): Promise<boolean> => {
      const draftKey = selectedGroupChatId ?? selectedContactId;
      if (!draftKey || !selectedChatId || !selfId.trim()) return false;
      if (blob.size > MAX_CHAT_FILE_BYTES) {
        setErr(`Запись слишком большая (макс. ~${CHAT_FILE_MAX_KB_HINT} КБ).`);
        return false;
      }
      sendInFlightRef.current = true;
      setComposerSending(true);
      try {
        setErr(null);
        const dataUrl = await readBlobAsDataUrl(blob);
        if (dataUrl.length > MAX_CHAT_PAYLOAD_CHARS) {
          setErr("Голосовое слишком длинное для чата.");
          return false;
        }
        const ext = extensionForVoiceMime(mime);
        const fileName = `voice-${Date.now()}.${ext}`;
        const rt = replyToMessageId;
        if (selectedGroupChatId) {
          await sendChatAttachmentMessage({
            fromUserId: selfId.trim(),
            chatId: selectedGroupChatId,
            messageType: "voice",
            payloadDataUrl: dataUrl,
            fileName,
            mimeType: mime || null,
            replyToMessageId: rt,
          });
        } else if (selectedContactId) {
          await sendChatAttachmentMessage({
            fromUserId: selfId.trim(),
            toUserId: selectedContactId,
            chatId: selectedChatId,
            messageType: "voice",
            payloadDataUrl: dataUrl,
            fileName,
            mimeType: mime || null,
            replyToMessageId: rt,
          });
        } else {
          setErr("Выберите получателя.");
          return false;
        }
        playOutgoingChatSound(selfId.trim());
        setReplyToMessageId(null);
        scrollChatToBottom();
        requestAnimationFrame(() => scrollChatToBottom());
        return true;
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Не удалось отправить голосовое");
        return false;
      } finally {
        sendInFlightRef.current = false;
        setComposerSending(false);
      }
    },
    [
      selectedGroupChatId,
      selectedContactId,
      selectedChatId,
      selfId,
      replyToMessageId,
      readBlobAsDataUrl,
    ]
  );

  const voiceFinalizingRef = useRef(false);

  const finalizeVoiceSession = useCallback(async () => {
    if (voiceFinalizingRef.current) return;
    voiceFinalizingRef.current = true;
    try {
      const elapsed = getVoiceElapsedMs();
      clearVoiceTimers();
      resetVoicePauseState();
      const s = voiceSessionRef.current;
      voiceSessionRef.current = null;
      setIsVoiceRecording(false);
      setVoiceRecordingMs(0);
      if (!s) return;
      const result = await s.finish(false);
      if (!result) {
        setErr("Не удалось сохранить запись. Попробуйте ещё раз.");
        return;
      }
      if (elapsed < MIN_VOICE_RECORD_MS) {
        setErr("Запись слишком короткая. Запишите ещё раз.");
        return;
      }
      await sendVoiceBlob(result.blob, result.mime);
    } finally {
      voiceFinalizingRef.current = false;
    }
  }, [clearVoiceTimers, getVoiceElapsedMs, resetVoicePauseState, sendVoiceBlob]);

  const pauseVoiceRecording = useCallback(() => {
    if (composerSending || voiceFinalizingRef.current) return;
    const s = voiceSessionRef.current;
    if (!s) return;
    if (s.getRecorderState() !== "recording") return;
    s.pause();
    if (s.getRecorderState() !== "paused") return;
    if (voiceTickTimerRef.current != null) {
      window.clearInterval(voiceTickTimerRef.current);
      voiceTickTimerRef.current = null;
    }
    if (voiceMaxTimerRef.current != null) {
      window.clearTimeout(voiceMaxTimerRef.current);
      voiceMaxTimerRef.current = null;
    }
    voicePauseStartMsRef.current = Date.now();
    setVoiceRecordPaused(true);
    setVoiceRecordingMs(getVoiceElapsedMs());
  }, [composerSending, getVoiceElapsedMs]);

  const resumeVoiceRecording = useCallback(() => {
    if (composerSending || voiceFinalizingRef.current) return;
    const s = voiceSessionRef.current;
    if (!s) return;
    if (s.getRecorderState() !== "paused") return;
    s.resume();
    if (voicePauseStartMsRef.current != null) {
      voicePausedTotalMsRef.current += Date.now() - voicePauseStartMsRef.current;
      voicePauseStartMsRef.current = null;
    }
    setVoiceRecordPaused(false);
    const elapsed = getVoiceElapsedMs();
    setVoiceRecordingMs(elapsed);
    voiceTickTimerRef.current = window.setInterval(() => {
      setVoiceRecordingMs(getVoiceElapsedMs());
    }, 200);
    voiceMaxTimerRef.current = window.setTimeout(() => {
      void finalizeVoiceSession();
    }, Math.max(0, MAX_VOICE_RECORD_MS - elapsed));
  }, [composerSending, finalizeVoiceSession, getVoiceElapsedMs]);

  const cancelVoiceRecording = useCallback(async () => {
    if (voiceFinalizingRef.current) return;
    clearVoiceTimers();
    resetVoicePauseState();
    const s = voiceSessionRef.current;
    voiceSessionRef.current = null;
    setIsVoiceRecording(false);
    setVoiceRecordingMs(0);
    if (s) await s.finish(true);
  }, [clearVoiceTimers, resetVoicePauseState]);

  const clearVoicePreview = useCallback(() => {
    setVoicePreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  /** Остановить запись и показать предпрослушивание (без отправки). */
  const previewVoiceRecording = useCallback(async () => {
    if (voiceFinalizingRef.current) return;
    const s = voiceSessionRef.current;
    if (!s) return;
    const st = s.getRecorderState();
    if (st !== "recording" && st !== "paused") return;
    voiceFinalizingRef.current = true;
    try {
      const elapsed = getVoiceElapsedMs();
      clearVoiceTimers();
      resetVoicePauseState();
      voiceSessionRef.current = null;
      setIsVoiceRecording(false);
      setVoiceRecordingMs(0);
      const result = await s.finish(false);
      if (!result) {
        setErr("Не удалось сохранить запись для прослушивания.");
        return;
      }
      setVoicePreview((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        const url = URL.createObjectURL(result.blob);
        return {
          blob: result.blob,
          mime: result.mime,
          url,
          durationMs: elapsed,
        };
      });
    } finally {
      voiceFinalizingRef.current = false;
    }
  }, [clearVoiceTimers, getVoiceElapsedMs, resetVoicePauseState]);

  const sendVoicePreview = useCallback(async () => {
    const p = voicePreview;
    if (!p || composerSending) return;
    if (p.durationMs < MIN_VOICE_RECORD_MS) {
      setErr("Запись слишком короткая. Запишите ещё раз.");
      return;
    }
    setErr(null);
    const ok = await sendVoiceBlob(p.blob, p.mime);
    if (ok) clearVoicePreview();
  }, [voicePreview, composerSending, sendVoiceBlob, clearVoicePreview]);

  useEffect(() => {
    clearVoicePreview();
  }, [selectedChatId, clearVoicePreview]);

  /**
   * iOS Safari: getUserMedia должен стартовать синхронно из tap — без await до него.
   * Цепочка .then() от вызова getAudioStreamSafe() в обработчике клика сохраняет жест.
   */
  const startVoiceRecording = useCallback(() => {
    setVoicePreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
    if (
      voiceStartingRef.current ||
      isVoiceRecording ||
      composerSending ||
      editingMessageId ||
      pendingAttachment ||
      !selectedChatId ||
      !selfId.trim()
    ) {
      return;
    }
    voiceStartingRef.current = true;
    setErr(null);

    getAudioStreamSafe()
      .then((stream) => {
        voiceStartingRef.current = false;
        try {
          const session = attachVoiceRecorder(stream);
          voiceSessionRef.current = session;
          voicePausedTotalMsRef.current = 0;
          voicePauseStartMsRef.current = null;
          setVoiceRecordPaused(false);
          voiceRecordStartMsRef.current = Date.now();
          setIsVoiceRecording(true);
          setVoiceRecordingMs(0);
          voiceTickTimerRef.current = window.setInterval(() => {
            setVoiceRecordingMs(getVoiceElapsedMs());
          }, 200);
          voiceMaxTimerRef.current = window.setTimeout(() => {
            void finalizeVoiceSession();
          }, MAX_VOICE_RECORD_MS);
        } catch (err) {
          stream.getTracks().forEach((t) => t.stop());
          const msg =
            err instanceof Error && /не поддерживается/i.test(err.message)
              ? "Этот браузер не поддерживает запись голоса. Обновите Safari до последней версии."
              : err instanceof Error
                ? err.message
                : "Не удалось начать запись";
          setErr(msg);
        }
      })
      .catch((err: unknown) => {
        voiceStartingRef.current = false;
        setIsVoiceRecording(false);
        setVoiceRecordingMs(0);
        setErr(getMicrophoneFailureMessage(err));
      });
  }, [
    isVoiceRecording,
    composerSending,
    editingMessageId,
    pendingAttachment,
    selectedChatId,
    selfId,
    clearVoiceTimers,
    finalizeVoiceSession,
    getVoiceElapsedMs,
  ]);

  useEffect(() => {
    return () => {
      clearVoiceTimers();
      const s = voiceSessionRef.current;
      voiceSessionRef.current = null;
      if (s) void s.finish(true);
    };
  }, [clearVoiceTimers]);

  const canEdit = (m: ChatMessage): boolean => {
    if (!profile) return false;
    if (m.type !== "text") return false;
    if (profile.role === "admin") return true;
    if (m.senderId !== currentUserId) return false;
    const refMs = m.editedAt ?? m.createdAt;
    return Date.now() - refMs <= MESSAGE_EDIT_WINDOW_MS;
  };

  const canDeleteForMe = (m: ChatMessage): boolean => {
    if (profile?.role === "admin") return true;
    // Входящие (файл/фото/текст): любой участник может скрыть у себя.
    if (m.senderId !== currentUserId) return true;
    // Свои сообщения для инструктора/курсанта можно удалить у себя в любое время.
    return true;
  };

  const canDeleteForAll = (m: ChatMessage): boolean => {
    if (profile?.role === "admin") return true;
    if (m.senderId !== currentUserId) return false;
    const diffMs = Date.now() - m.createdAt;
    return diffMs <= MESSAGE_EDIT_WINDOW_MS;
  };

  const handleConfirmForward = async () => {
    if (!currentUserId || forwardMessageIds.length === 0 || forwardRecipientIds.length === 0) return;
    const sorted = [...forwardMessageIds]
      .map((id) => messageById.get(id))
      .filter((m): m is ChatMessage => Boolean(m))
      .sort((a, b) => a.createdAt - b.createdAt);
    if (sorted.length === 0) {
      setErr("Не удалось подготовить сообщения к пересылке");
      return;
    }
    try {
      await forwardChatMessagesToRecipients({
        fromUserId: selfId.trim(),
        messages: sorted,
        recipientUserIds: forwardRecipientIds,
      });
      playOutgoingChatSound(selfId.trim());
      setForwardOverlayOpen(false);
      setForwardMessageIds([]);
      setForwardRecipientIds([]);
      exitSelectionMode();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ошибка пересылки");
    }
  };

  const runBatchDelete = async (scope: "me" | "all") => {
    if (!selectedChatId || selectedMessageIds.length === 0) return;
    const chatId = selectedChatId;
    const ids = [...selectedMessageIds];
    const allowed: string[] = [];
    for (const id of ids) {
      const m = messageById.get(id);
      if (!m) continue;
      if (scope === "me") {
        if (canDeleteForMe(m)) allowed.push(id);
      } else if (canDeleteForAll(m)) {
        allowed.push(id);
      }
    }
    if (allowed.length === 0) {
      setErr("Нет сообщений, которые можно удалить выбранным способом");
      return;
    }
    const privacy =
      isAdmin && currentUserId
        ? getChatPrivacySettings(currentUserId)
        : DEFAULT_CHAT_PRIVACY_SETTINGS;
    if (privacy.confirmBeforeDelete) {
      const msg =
        scope === "all"
          ? `Удалить у всех выбранные сообщения (${allowed.length} шт.)?`
          : `Удалить у вас выбранные сообщения (${allowed.length} шт.)?`;
      if (!window.confirm(msg)) return;
    }
    try {
      await Promise.all(
        allowed.map((id) =>
          scope === "me"
            ? deleteChatMessageForMe({ chatId, messageId: id, userId: currentUserId })
            : deleteChatMessageForAll({ chatId, messageId: id })
        )
      );
      exitSelectionMode();
      setBatchDeleteSubOpen(false);
      setErr(null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ошибка удаления");
    }
  };

  const closeMenu = useCallback(() => {
    setMenuAdjusted(null);
    setMenuDeleteSubOpen(false);
    setMenuEmojiMoreOpen(false);
    setMenu({ open: false, messageId: null, x: 0, y: 0 });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedMessageIds([]);
    setBatchDeleteSubOpen(false);
  }, []);

  const toggleMessageSelected = useCallback((id: string) => {
    setSelectedMessageIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const toggleForwardRecipient = useCallback((uid: string) => {
    setForwardRecipientIds((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
    );
  }, []);

  const openForwardOverlay = useCallback(
    (messageIds: string[]) => {
      setForwardMessageIds(messageIds);
      setForwardRecipientIds([]);
      setForwardOverlayOpen(true);
      closeMenu();
    },
    [closeMenu]
  );

  useEffect(() => {
    if (!menu.open) return;
    setMenuDeleteSubOpen(false);
    setMenuEmojiMoreOpen(false);
  }, [menu.open, menu.messageId, menu.x, menu.y]);

  useEffect(() => {
    if (!menu.open || !menu.messageId) return;
    if (!messageById.has(menu.messageId)) closeMenu();
  }, [menu.open, menu.messageId, messageById, closeMenu]);

  const clampMenuIntoViewport = useCallback(() => {
    const el = menuRef.current;
    if (!el || !menu.open) return;
    const r = el.getBoundingClientRect();
    const pad = 10;
    const safe = getChatSafeInsets();
    const vv = window.visualViewport;
    const vw = vv?.width ?? window.innerWidth;
    const vh = vv?.height ?? window.innerHeight;
    const offX = vv?.offsetLeft ?? 0;
    const offY = vv?.offsetTop ?? 0;
    const minX = offX + pad + safe.left;
    const maxRight = offX + vw - pad - safe.right;
    /** Нижний край меню не ниже этой координаты (видимая область) */
    let bottomLimit = offY + vh - pad - safe.bottom;
    const minY = offY + pad + safe.top;
    const composerEl = composerBarRef.current;
    if (composerEl) {
      const ct = composerEl.getBoundingClientRect().top;
      if (Number.isFinite(ct) && ct > offY + pad + safe.top) {
        bottomLimit = Math.min(bottomLimit, ct - pad);
      }
    }
    let x = menu.x;
    let y = menu.y;
    if (x + r.width > maxRight) x = Math.max(minX, maxRight - r.width);
    if (x < minX) x = minX;
    if (y + r.height > bottomLimit) y = Math.max(minY, bottomLimit - r.height);
    if (y < minY) y = minY;
    setMenuAdjusted((prev) =>
      prev && prev.x === x && prev.y === y ? prev : { x, y }
    );
  }, [menu.open, menu.x, menu.y]);

  useLayoutEffect(() => {
    if (!menu.open) {
      setMenuAdjusted(null);
      return;
    }
    clampMenuIntoViewport();
    let raf1 = 0;
    let cancelled = false;
    raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) clampMenuIntoViewport();
      });
    });
    const t0 = window.setTimeout(() => {
      if (!cancelled) clampMenuIntoViewport();
    }, 50);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      window.clearTimeout(t0);
    };
  }, [
    menu.open,
    menu.messageId,
    menu.x,
    menu.y,
    menuDeleteSubOpen,
    menuEmojiMoreOpen,
    clampMenuIntoViewport,
  ]);

  useEffect(() => {
    if (!menu.open) return;
    const onResize = () => clampMenuIntoViewport();
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
    };
  }, [menu.open, clampMenuIntoViewport]);

  /** iOS: композер двигается — пересчитать нижнюю границу меню */
  useEffect(() => {
    if (!menu.open) return;
    const bar = composerBarRef.current;
    if (!bar) return;
    const ro = new ResizeObserver(() => clampMenuIntoViewport());
    ro.observe(bar);
    return () => ro.disconnect();
  }, [menu.open, clampMenuIntoViewport]);

  const spawnInlineReactionBurst = useCallback((messageId: string, primaryEmoji: string) => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const id = ++reactionBurstIdRef.current;
    const emojis = pickFiveBurstEmojis(primaryEmoji);
    const items = emojis.map((emoji, i) => {
      const base = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      const a = base + (Math.random() - 0.5) * 0.55;
      const r = 22 + Math.random() * 34;
      return {
        emoji,
        dx: Math.cos(a) * r,
        dy: Math.sin(a) * r - 14,
        delay: i * 46,
        rot: (Math.random() - 0.5) * 42,
      };
    });
    const burst: ReactionBurstState = { id, messageId, primaryEmoji, items };
    setReactionBursts((prev) => [...prev.filter((b) => b.messageId !== messageId), burst]);
    window.setTimeout(() => {
      setReactionBursts((prev) => prev.filter((b) => b.id !== id));
    }, 1320);
  }, []);

  /** Реакции с собеседника: тот же всплеск, что и у себя (дифф снимка из Firestore). */
  useEffect(() => {
    if (!selectedChatId || !currentUserId) return;
    if (!reactionBaselineReadyRef.current) {
      if (messages.length === 0) return;
      for (const m of messagesFiltered) {
        reactionPrevSerializedRef.current.set(m.id, serializeReactions(m.reactions));
      }
      reactionBaselineReadyRef.current = true;
      return;
    }
    for (const m of messagesFiltered) {
      const prevJson = reactionPrevSerializedRef.current.get(m.id);
      const currJson = serializeReactions(m.reactions);
      if (prevJson === undefined) {
        reactionPrevSerializedRef.current.set(m.id, currJson);
        continue;
      }
      if (prevJson === currJson) continue;
      const prev = JSON.parse(prevJson) as Record<string, string[]>;
      const curr = m.reactions ?? {};
      for (const [emoji, uids] of Object.entries(curr)) {
        const prevUids = prev[emoji] ?? [];
        for (const uid of uids) {
          if (!prevUids.includes(uid)) {
            if (uid === currentUserId) {
              const k = `${m.id}:${emoji}`;
              if (recentSelfReactionBurstRef.current === k) {
                recentSelfReactionBurstRef.current = null;
                continue;
              }
            }
            requestAnimationFrame(() => {
              requestAnimationFrame(() => spawnInlineReactionBurst(m.id, emoji));
            });
          }
        }
      }
      reactionPrevSerializedRef.current.set(m.id, currJson);
    }
    for (const id of [...reactionPrevSerializedRef.current.keys()]) {
      if (!messagesFiltered.some((x) => x.id === id)) {
        reactionPrevSerializedRef.current.delete(id);
      }
    }
  }, [messagesFiltered, messages.length, selectedChatId, currentUserId, spawnInlineReactionBurst]);

  /** Удаление у собеседника / синхрон снимка: анимация «пыли» по кэшу до исчезновения строки. */
  useEffect(() => {
    if (!selectedChatId) return;
    const prev = prevMessagesSnapshotRef.current;
    const currList = messagesFiltered;
    const currIds = new Set(currList.map((m) => m.id));
    for (const [id, msg] of prev) {
      if (currIds.has(id)) continue;
      if (deletingMessageIdRef.current === id) continue;
      remoteDeletedMessageCacheRef.current.set(id, msg);
      if (!deleteParticlesCacheRef.current.has(id)) {
        deleteParticlesCacheRef.current.set(
          id,
          buildDeleteParticles(msg.senderId === currentUserId)
        );
      }
      setRemoteDeletingIds((s) => (s.includes(id) ? s : [...s, id]));
      window.setTimeout(() => {
        setRemoteDeletingIds((s) => s.filter((x) => x !== id));
        remoteDeletedMessageCacheRef.current.delete(id);
        deleteParticlesCacheRef.current.delete(id);
      }, DELETE_ANIM_MS);
    }
    prevMessagesSnapshotRef.current = new Map(currList.map((m) => [m.id, m]));
  }, [messagesFiltered, selectedChatId, currentUserId]);

  const handleMenuReaction = async (emoji: string) => {
    if (!selectedChatId || !menu.messageId) return;
    const targetMessageId = menu.messageId;
    const chatId = selectedChatId;
    const prev = messageById.get(targetMessageId);
    let currentEmoji: string | null = null;
    if (prev?.reactions) {
      for (const [k, v] of Object.entries(prev.reactions)) {
        if (v.includes(currentUserId)) {
          currentEmoji = k;
          break;
        }
      }
    }
    const willRemove = currentEmoji === emoji;
    if (!willRemove) {
      recentSelfReactionBurstRef.current = `${targetMessageId}:${emoji}`;
    }
    await toggleReaction({
      chatId,
      messageId: targetMessageId,
      userId: currentUserId,
      emoji,
    });
    closeMenu();
    if (!willRemove) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => spawnInlineReactionBurst(targetMessageId, emoji));
      });
    }
  };

  const handleReactionChipTap = useCallback(
    async (messageId: string) => {
      if (!selectedChatId || !currentUserId) return;
      await clearUserReactionOnMessage({
        chatId: selectedChatId,
        messageId,
        userId: currentUserId,
      });
    },
    [selectedChatId, currentUserId]
  );

  const handleCopyMessage = async (m: ChatMessage) => {
    const text =
      m.type === "text"
        ? (m.text ?? "")
        : m.fileName
          ? `[${m.type}] ${m.fileName}`
          : `[${m.type}]`;
    const ok = await copyTextToClipboard(text);
    if (!ok) setErr("Не удалось скопировать в буфер обмена");
    closeMenu();
  };

  const handleDelete = async (m: ChatMessage, scope: "me" | "all") => {
    if (!selectedChatId) return;
    const privacy =
      isAdmin && currentUserId
        ? getChatPrivacySettings(currentUserId)
        : DEFAULT_CHAT_PRIVACY_SETTINGS;
    if (privacy.confirmBeforeDelete) {
      const msg =
        scope === "all"
          ? "Удалить сообщение у всех участников чата?"
          : "Удалить сообщение только у вас?";
      if (!window.confirm(msg)) return;
    }
    closeMenu();
    const chatId = selectedChatId;
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      try {
        if (scope === "me") {
          await deleteChatMessageForMe({
            chatId,
            messageId: m.id,
            userId: currentUserId,
          });
        } else {
          await deleteChatMessageForAll({
            chatId,
            messageId: m.id,
          });
        }
      } catch {
        // ignore
      }
      return;
    }
    const mine = m.senderId === currentUserId;
    if (!deleteParticlesCacheRef.current.has(m.id)) {
      deleteParticlesCacheRef.current.set(m.id, buildDeleteParticles(mine));
    }
    setDeletingMessageId(m.id);
    await new Promise((r) => window.setTimeout(r, DELETE_ANIM_MS));
    try {
      if (scope === "me") {
        await deleteChatMessageForMe({
          chatId,
          messageId: m.id,
          userId: currentUserId,
        });
      } else {
        await deleteChatMessageForAll({
          chatId,
          messageId: m.id,
        });
      }
    } catch {
      // ignore
    } finally {
      setDeletingMessageId(null);
      deleteParticlesCacheRef.current.delete(m.id);
    }
  };

  const handleStartEdit = (m: ChatMessage) => {
    if (!canEdit(m)) return;
    setPendingAttachment((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setReplyToMessageId(null);
    composerBackupBeforeEditRef.current = composerText;
    setEditingMessageId(m.id);
    setComposerText(m.type === "text" ? (m.text ?? "") : "");
    closeMenu();
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      try {
        const el = composerRef.current;
        if (el) {
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      } catch {
        // ignore
      }
    });
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onChatTabClipboardCapture = useCallback((e: React.ClipboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest(".chat-composer-input")) return;
    e.preventDefault();
  }, []);

  if (authLoading && !user) {
    return (
      <div className="chat-tab chat-tab--loading" onCopyCapture={onChatTabClipboardCapture} onCutCapture={onChatTabClipboardCapture}>
        Загрузка…
      </div>
    );
  }
  if (!user) {
    return (
      <div
        className="chat-tab chat-tab--loading"
        onCopyCapture={onChatTabClipboardCapture}
        onCutCapture={onChatTabClipboardCapture}
      >
        Войдите в аккаунт, чтобы пользоваться чатом.
      </div>
    );
  }

  const menuContextMessage =
    menu.open && menu.messageId ? (messageById.get(menu.messageId) ?? null) : null;

  function closeThread() {
    exitSelectionMode();
    setForwardOverlayOpen(false);
    setForwardMessageIds([]);
    setForwardRecipientIds([]);
    const key = selectedGroupChatId ?? selectedContactId;
    if (key) {
      const textToSave = editingMessageId ? composerBackupBeforeEditRef.current : composerText;
      persistDraft(key, textToSave);
    }
    setEditingMessageId(null);
    setPendingAttachment((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    setLightbox(null);
    closeMenu();
    setSelectedContactId(null);
    setSelectedGroupChatId(null);
    setPickedGroupSnapshot(null);
    setComposerText("");
    prevChatDraftKeyRef.current = null;
  }

  const chatMenuPortal =
    menu.open &&
    menuContextMessage &&
    typeof document !== "undefined" &&
    createPortal(
      <>
        <div
          className="chat-menu-backdrop"
          onClick={closeMenu}
          onPointerDown={(e) => {
            if (e.pointerType === "touch") closeMenu();
          }}
          role="presentation"
        />
        <div
          ref={menuRef}
          className="chat-menu"
          style={{
            left: menuAdjusted?.x ?? menu.x,
            top: menuAdjusted?.y ?? menu.y,
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {(() => {
            const m = menuContextMessage;
            const allowEdit = canEdit(m);
            const allowDeleteMe = canDeleteForMe(m);
            const allowDeleteAll = canDeleteForAll(m);
            const menuShowDeleteMe =
              allowDeleteMe && (!isAdmin || chatPrivacy.allowDeleteForMeInMenu);
            const menuShowDeleteAll =
              allowDeleteAll && (!isAdmin || chatPrivacy.allowDeleteForAllInMenu);
            return (
              <>
                <div className="chat-menu-section-title">Реакции</div>
                <div className="chat-menu-reactions">
                  {REACTIONS_QUICK.map((em) => (
                    <button
                      key={em}
                      type="button"
                      className="chat-menu-reaction-btn"
                      onClick={() => void handleMenuReaction(em)}
                    >
                      {em}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="chat-menu-reaction-btn chat-menu-reaction-btn--more"
                    title="Другие реакции"
                    aria-label="Другие реакции"
                    aria-expanded={menuEmojiMoreOpen}
                    onClick={() => setMenuEmojiMoreOpen((v) => !v)}
                  >
                    +
                  </button>
                </div>
                {menuEmojiMoreOpen ? (
                  <div
                    className="chat-menu-emoji-more"
                    role="group"
                    aria-label="Дополнительные реакции"
                  >
                    <div className="chat-menu-emoji-more-grid">
                      {REACTIONS_MORE.map((em) => (
                        <button
                          key={em}
                          type="button"
                          className="chat-menu-reaction-btn"
                          onClick={() => void handleMenuReaction(em)}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="chat-menu-actions">
                  <button
                    type="button"
                    className="chat-menu-btn"
                    onClick={() => {
                      if (editingMessageId) cancelEditingComposer();
                      setReplyToMessageId(m.id);
                      closeMenu();
                    }}
                  >
                    <span className="chat-menu-btn-ico" aria-hidden>
                      <IconMenuReply />
                    </span>
                    Ответить
                  </button>
                  <button
                    type="button"
                    className="chat-menu-btn"
                    onClick={() => void handleCopyMessage(m)}
                  >
                    <span className="chat-menu-btn-ico" aria-hidden>
                      <IconMenuCopy />
                    </span>
                    Копировать
                  </button>
                  {(m.type === "image" || m.type === "file") && m.payloadDataUrl ? (
                    <button
                      type="button"
                      className="chat-menu-btn"
                      onClick={() => {
                        if (m.type === "image") downloadChatImagePayload(m);
                        else downloadChatFilePayload(m);
                        closeMenu();
                      }}
                    >
                      <span className="chat-menu-btn-ico" aria-hidden>
                        <IconMenuDownload />
                      </span>
                      Скачать
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="chat-menu-btn"
                    onClick={() => openForwardOverlay([m.id])}
                  >
                    <span className="chat-menu-btn-ico" aria-hidden>
                      <IconMenuForward />
                    </span>
                    Переслать
                  </button>
                  <button
                    type="button"
                    className="chat-menu-btn"
                    onClick={() => {
                      if (editingMessageId) cancelEditingComposer();
                      setReplyToMessageId(null);
                      setSelectionMode(true);
                      setSelectedMessageIds([m.id]);
                      closeMenu();
                    }}
                  >
                    <span className="chat-menu-btn-ico" aria-hidden>
                      <IconMenuSelect />
                    </span>
                    Выбрать
                  </button>
                  {allowEdit ? (
                    <button
                      type="button"
                      className="chat-menu-btn"
                      onClick={() => handleStartEdit(m)}
                    >
                      <span className="chat-menu-btn-ico" aria-hidden>
                        <IconMenuEdit />
                      </span>
                      Редактировать
                    </button>
                  ) : null}
                  {menuShowDeleteMe || menuShowDeleteAll ? (
                    menuShowDeleteMe && menuShowDeleteAll ? (
                      <>
                        <button
                          type="button"
                          className="chat-menu-btn chat-menu-btn--expand"
                          onClick={() => setMenuDeleteSubOpen((v) => !v)}
                          aria-expanded={menuDeleteSubOpen}
                        >
                          <span className="chat-menu-btn-ico" aria-hidden>
                            <IconMenuTrash />
                          </span>
                          <span className="chat-menu-btn-label">Удалить</span>
                          <span className="chat-menu-btn-chevron" aria-hidden>
                            {menuDeleteSubOpen ? "▾" : "▸"}
                          </span>
                        </button>
                        {menuDeleteSubOpen ? (
                          <div
                            className="chat-menu-delete-sub"
                            role="group"
                            aria-label="Варианты удаления"
                          >
                            {menuShowDeleteAll ? (
                              <button
                                type="button"
                                className="chat-menu-btn chat-menu-btn--danger chat-menu-btn--sub"
                                onClick={() => void handleDelete(m, "all")}
                              >
                                <span className="chat-menu-btn-ico" aria-hidden>
                                  <IconMenuTrash />
                                </span>
                                Удалить у всех
                              </button>
                            ) : null}
                            {menuShowDeleteMe ? (
                              <button
                                type="button"
                                className="chat-menu-btn chat-menu-btn--danger chat-menu-btn--sub"
                                onClick={() => void handleDelete(m, "me")}
                              >
                                <span className="chat-menu-btn-ico" aria-hidden>
                                  <IconMenuTrash />
                                </span>
                                Удалить у меня
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <button
                        type="button"
                        className="chat-menu-btn chat-menu-btn--danger"
                        onClick={() =>
                          void handleDelete(m, menuShowDeleteAll ? "all" : "me")
                        }
                      >
                        <span className="chat-menu-btn-ico" aria-hidden>
                          <IconMenuTrash />
                        </span>
                        {menuShowDeleteAll ? "Удалить у всех" : "Удалить у меня"}
                      </button>
                    )
                  ) : null}
                </div>
              </>
            );
          })()}
        </div>
      </>,
      document.body
    );

  const forwardOverlayPortal =
    forwardOverlayOpen &&
    typeof document !== "undefined" &&
    createPortal(
      <div className="chat-forward-overlay">
        <div
          className="chat-forward-backdrop"
          role="presentation"
          onClick={() => setForwardOverlayOpen(false)}
        />
        <div
          className="chat-forward-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-forward-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="chat-forward-title" className="chat-forward-title">
            Переслать сообщения
          </h2>
          <p className="chat-forward-hint">Выберите одного или нескольких получателей</p>
          <div className="chat-forward-list">
            {contactsOrdered.length === 0 ? (
              <div className="chat-forward-empty">Нет доступных контактов</div>
            ) : (
              contactsOrdered.map((c) => (
                <label key={c.uid} className="chat-forward-contact">
                  <input
                    type="checkbox"
                    checked={forwardRecipientIds.includes(c.uid)}
                    onChange={() => toggleForwardRecipient(c.uid)}
                  />
                  <span className="chat-forward-contact-name">{formatShortFio(c.displayName)}</span>
                  <span className="chat-forward-contact-role">{roleLabel[c.role]}</span>
                </label>
              ))
            )}
          </div>
          <div className="chat-forward-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setForwardOverlayOpen(false)}
            >
              Отмена
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={forwardRecipientIds.length === 0 || forwardMessageIds.length === 0}
              onClick={() => void handleConfirmForward()}
            >
              Отправить
            </button>
          </div>
        </div>
      </div>,
      document.body
    );

  const correspondenceOverlayPortal =
    correspondenceModalOpen &&
    isAdmin &&
    typeof document !== "undefined" &&
    createPortal(
      <div className="chat-forward-overlay">
        <div
          className="chat-forward-backdrop"
          role="presentation"
          onClick={() => closeCorrespondenceModal()}
        />
        {correspondenceWizardStep === 3 &&
        correspondenceViewerU1 &&
        correspondenceViewerU2Uid ? (
          <div
            className="chat-correspondence-viewer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-correspondence-view-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="chat-correspondence-viewer-top">
              <button
                type="button"
                className="chat-thread-back-btn"
                title="Назад к выбору второго участника"
                aria-label="Назад"
                onClick={() => {
                  setCorrespondenceViewChatId(null);
                  setCorrespondenceViewMessages([]);
                  setCorrespondenceViewerU2Uid(null);
                  setCorrespondenceWizardStep(2);
                }}
              >
                <IconArrowBack className="chat-thread-back-ico" />
              </button>
              <div className="chat-correspondence-viewer-headings">
                <h2 id="chat-correspondence-view-title" className="chat-correspondence-viewer-title">
                  {formatShortFio(correspondenceViewerU1.displayName)} —{" "}
                  {formatShortFio(getProfileForMessageSender(correspondenceViewerU2Uid).displayName)}
                </h2>
                <p className="chat-correspondence-viewer-sub">Только просмотр, отправка недоступна</p>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => closeCorrespondenceModal()}
              >
                Закрыть
              </button>
            </div>
            {correspondenceViewErr ? (
              <p className="chat-correspondence-viewer-err" role="alert">
                {correspondenceViewErr}
              </p>
            ) : null}
            <div className="chat-correspondence-viewer-messages">
              {correspondenceViewMessages.length === 0 ? (
                <div className="chat-messages-empty">Нет сообщений в этой переписке.</div>
              ) : (
                <ul className="chat-message-list">
                  {correspondenceTimeline.map((entry) => {
                    if (entry.type === "date") {
                      return (
                        <li
                          key={`date-${entry.dayKey}`}
                          className="chat-msg-day-separator"
                          role="presentation"
                        >
                          <span className="chat-msg-day-separator-label">{entry.label}</span>
                        </li>
                      );
                    }
                    const m = entry.message;
                    const peerRightUid = correspondenceViewerU2Uid;
                    const mine = peerRightUid != null && m.senderId === peerRightUid;
                    const sender = getProfileForMessageSender(m.senderId);
                    const replyPrev = m.replyToMessageId
                      ? correspondenceViewMessageById.get(m.replyToMessageId)
                      : null;
                    if (m.deletedForAll) {
                      return (
                        <li
                          key={m.id}
                          className={[
                            "chat-msg chat-msg-readonly",
                            mine ? "chat-msg--mine" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <div className="chat-bubble chat-bubble-readonly-muted">Сообщение удалено</div>
                          <span className="chat-msg-meta-ro">{formatRuTime(m.createdAt)}</span>
                        </li>
                      );
                    }
                    return (
                      <li
                        key={m.id}
                        className={[
                          "chat-msg chat-msg-readonly",
                          mine ? "chat-msg--mine" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <div className="chat-bubble chat-bubble-readonly">
                          <span className="chat-readonly-sender">
                            {formatShortFio(sender.displayName)}
                            {m.forwarded ? (
                              <span className="chat-readonly-forwarded"> · переслано</span>
                            ) : null}
                          </span>
                          {replyPrev && !replyPrev.deletedForAll ? (
                            <div className="chat-readonly-reply">
                              {previewLineFromChatMessage(replyPrev)}
                            </div>
                          ) : null}
                          {m.type === "text" ? (
                            <span className="chat-bubble-text">{m.text}</span>
                          ) : null}
                          {m.type === "voice" && m.payloadDataUrl ? (
                            <div className="chat-bubble-attachment">
                              <ChatVoiceMessagePlayer
                                src={m.payloadDataUrl}
                                isMine={mine}
                                avatarProfile={{
                                  uid: sender.uid,
                                  displayName: sender.displayName,
                                  avatarDataUrl: sender.avatarDataUrl,
                                }}
                              />
                            </div>
                          ) : null}
                          {m.type === "image" && m.payloadDataUrl ? (
                            <button
                              type="button"
                              className="chat-bubble-image-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLightbox({
                                  src: m.payloadDataUrl!,
                                  fileName: m.fileName ?? null,
                                });
                              }}
                            >
                              <img
                                className="chat-bubble-image"
                                src={m.payloadDataUrl}
                                alt={m.fileName ?? "Фото"}
                              />
                            </button>
                          ) : null}
                          {m.type === "file" && m.payloadDataUrl ? (
                            <div className="chat-bubble-file-card chat-bubble-file-card--readonly">
                              <span className="chat-bubble-file-open-name">
                                {m.fileName ?? "Файл"}
                              </span>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(m.payloadDataUrl!, "_blank", "noopener,noreferrer");
                                }}
                              >
                                {isIosLikeDevice() ? "Просмотр" : "Открыть в новой вкладке"}
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <span className="chat-msg-meta-ro">{formatRuTime(m.editedAt ?? m.createdAt)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div
            className="chat-forward-dialog chat-correspondence-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-correspondence-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="chat-correspondence-title" className="chat-forward-title">
              {correspondenceWizardStep === 1
                ? "Шаг 1: первый участник"
                : "Шаг 2: второй участник"}
            </h2>
            <p className="chat-forward-hint">
              {correspondenceWizardStep === 1
                ? "Выберите пользователя, чью переписку нужно посмотреть."
                : `Выберите собеседника ${correspondenceViewerU1 ? formatShortFio(correspondenceViewerU1.displayName) : ""} — только чаты, для которых в базе есть переписка.`}
            </p>
            {correspondenceWizardStep === 2 ? (
              <div className="chat-correspondence-wizard-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setCorrespondenceWizardStep(1);
                    setCorrespondenceViewerU1(null);
                    setCorrespondenceSecondPeerUids([]);
                    setCorrespondenceViewErr(null);
                  }}
                >
                  ← Назад
                </button>
              </div>
            ) : null}
            <div className="chat-correspondence-scroll">
              {correspondenceWizardStep === 1 ? (
                <>
                  {contactsListLoading ? (
                    <div className="chat-contacts-empty">Загрузка контактов…</div>
                  ) : contactsForChatList.length === 0 ? (
                    <div className="chat-contacts-empty">Нет активных контактов.</div>
                  ) : (
                    <ul className="chat-contact-list">
                      {contactsOrdered.map((c) => {
                        const room = roomMetaByContactUid[c.uid.trim()];
                        const draft = draftsMap[c.uid]?.trim() ?? "";
                        const previewText = draft
                          ? `Черновик: ${truncatePreviewLine(draft)}`
                          : room?.lastText ?? "—";
                        return (
                          <ChatDmContactListItem
                            key={c.uid}
                            c={c}
                            room={room}
                            draft={draft}
                            previewText={previewText}
                            hasLastMsg={Boolean(room?.lastMs)}
                            isActive={false}
                            chatPrivacy={chatPrivacy}
                            unreadCount={0}
                            typingPeerIds={[]}
                            displayNameForUid={displayNameForUid}
                            showLastSeenByRole={showLastSeenByRole}
                            currentUserRole={currentUserRole}
                            onSelect={() => {
                              setCorrespondenceViewerU1(c);
                              setCorrespondenceSecondPeersLoading(true);
                              setCorrespondenceViewErr(null);
                              setCorrespondenceWizardStep(2);
                              void fetchPeerUidsWithExistingPairChatsForUser(c.uid)
                                .then((ids) => {
                                  setCorrespondenceSecondPeerUids(ids);
                                  setCorrespondenceSecondPeersLoading(false);
                                })
                                .catch((e: unknown) => {
                                  setCorrespondenceViewErr(
                                    e instanceof Error ? e.message : "Ошибка загрузки списка"
                                  );
                                  setCorrespondenceSecondPeersLoading(false);
                                });
                            }}
                            onAvatarPhotoClick={() =>
                              setAvatarLightbox({
                                src: c.avatarDataUrl!,
                                name: c.displayName,
                              })
                            }
                          />
                        );
                      })}
                    </ul>
                  )}
                </>
              ) : correspondenceViewerU1 ? (
                correspondenceSecondPeersLoading ? (
                  <div className="chat-contacts-empty">Поиск переписок…</div>
                ) : correspondenceSecondPeerUids.length === 0 ? (
                  <div className="chat-contacts-empty">
                    Нет сохранённых парных чатов с этим участником (или нет доступа к данным).
                  </div>
                ) : (
                  <ul className="chat-correspondence-peer-pick-list">
                    {[...correspondenceSecondPeerUids]
                      .sort((a, b) =>
                        formatShortFio(getProfileForMessageSender(a).displayName).localeCompare(
                          formatShortFio(getProfileForMessageSender(b).displayName),
                          "ru"
                        )
                      )
                      .map((peerUid) => {
                        const p = getProfileForMessageSender(peerUid);
                        return (
                          <li key={peerUid}>
                            <button
                              type="button"
                              className="chat-correspondence-peer-pick-item"
                              onClick={() => {
                                setCorrespondenceViewerU2Uid(peerUid);
                                setCorrespondenceViewChatId(
                                  chatIdPair(correspondenceViewerU1.uid, peerUid)
                                );
                                setCorrespondenceWizardStep(3);
                              }}
                            >
                              <span className="chat-correspondence-peer-pick-name">
                                {formatShortFio(p.displayName)}
                              </span>
                              <span className="chat-correspondence-peer-pick-uid">{peerUid}</span>
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                )
              ) : null}
            </div>
            <div className="chat-forward-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => closeCorrespondenceModal()}
              >
                Закрыть
              </button>
            </div>
          </div>
        )}
      </div>,
      document.body
    );

  const groupParticipantsForViewer = useMemo(() => {
    if (!selectedGroupRoom) return [];
    const ids = [...new Set(selectedGroupRoom.participantIds.map((x) => x.trim()).filter(Boolean))];
    const list = ids
      .map((uid) => {
      const hit = profileByUidForChat.get(uid);
      if (hit) {
        if (hit.accountStatus === "rejected") return null;
        return {
          uid: hit.uid,
          displayName: hit.displayName,
          avatarDataUrl: hit.avatarDataUrl ?? null,
        };
      }
      if (uid === currentUserId && profile) {
        return {
          uid,
          displayName: profile.displayName,
          avatarDataUrl: profile.avatarDataUrl ?? null,
        };
      }
      return {
        uid,
        displayName: displayNameForUid(uid),
        avatarDataUrl: null,
      };
      })
      .filter((x): x is { uid: string; displayName: string; avatarDataUrl: string | null } => x != null);
    list.sort((a, b) =>
      formatShortFio(a.displayName).localeCompare(formatShortFio(b.displayName), "ru")
    );
    return list;
  }, [selectedGroupRoom, profileByUidForChat, currentUserId, profile, displayNameForUid]);

  const groupParticipantsOverlayPortal =
    groupParticipantsViewerOpen &&
    selectedGroupRoom &&
    typeof document !== "undefined" &&
    createPortal(
      <div className="chat-forward-overlay">
        <div
          className="chat-forward-backdrop"
          role="presentation"
          onClick={() => setGroupParticipantsViewerOpen(false)}
        />
        <div
          className="chat-forward-dialog chat-group-participants-viewer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chat-group-participants-viewer-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="chat-group-participants-viewer-title" className="chat-forward-title">
            Участники группы
          </h2>
          <div className="chat-group-participants-viewer-list-wrap">
            {groupParticipantsForViewer.length === 0 ? (
              <div className="chat-forward-empty">Список участников пуст.</div>
            ) : (
              <ul className="chat-group-participants-viewer-list">
                {groupParticipantsForViewer.map((p) => (
                  <li key={p.uid} className="chat-group-participants-viewer-item">
                    <UserChatAvatar profile={p} size="list" />
                    <span className="chat-group-participants-viewer-name">
                      {formatShortFio(p.displayName)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="chat-forward-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setGroupParticipantsViewerOpen(false)}
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <div
      className={threadOpen ? "chat-tab chat-tab--thread" : "chat-tab"}
      onCopyCapture={onChatTabClipboardCapture}
      onCutCapture={onChatTabClipboardCapture}
    >
      {!threadOpen ? (
        <div className="chat-header">
          <div className="chat-header-left">
            <IconChat className="chat-header-ico" />
            <span className="chat-header-title">Чат</span>
          </div>
          <div className="chat-header-actions" dir="rtl">
            {chatHeaderMode === "refreshOnly" ? (
              <button
                type="button"
                className="chat-ico-btn"
                title="Обновить контакты"
                onClick={() => {
                  setContactsReloadKey((v) => v + 1);
                }}
              >
                <IconRefresh className="chat-ico" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="chat-ico-btn"
                  title="Обновить контакты"
                  onClick={() => {
                    setContactsReloadKey((v) => v + 1);
                  }}
                >
                  <IconRefresh className="chat-ico" />
                </button>
                {isAdmin ? (
                  <>
                    <button
                      type="button"
                      className="chat-ico-btn"
                      title="Просмотр переписки между участниками"
                      aria-label="Переписка"
                      onClick={() => {
                        setCorrespondenceWizardStep(1);
                        setCorrespondenceViewerU1(null);
                        setCorrespondenceViewerU2Uid(null);
                        setCorrespondenceSecondPeerUids([]);
                        setCorrespondenceViewChatId(null);
                        setCorrespondenceViewMessages([]);
                        setCorrespondenceViewErr(null);
                        setCorrespondenceModalOpen(true);
                      }}
                    >
                      <IconCorrespondence className="chat-ico" />
                    </button>
                    <button
                      type="button"
                      className="chat-ico-btn"
                      title="Добавить группу"
                      onClick={() => setGroupModalOpen(true)}
                    >
                      <IconGroup className="chat-ico" />
                    </button>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      <div className={threadOpen ? "chat-layout chat-layout--thread" : "chat-layout"}>
        <aside className="chat-contacts">
          <div className="chat-contacts-section-title">Группы:</div>
          {groupRooms.length === 0 ? (
            <div className="chat-contacts-empty">
              {isAdmin && chatHeaderMode !== "refreshOnly"
                ? "Нет групп. Создайте кнопкой «Добавить группу»."
                : "Нет чат-групп. Учебная группа в карточке курсанта — это другое: администратор должен создать чат-группу и добавить вас в участники (или добавить курсантов из учебной группы в окне редактирования)."}

            </div>
          ) : (
            <ul className="chat-contact-list chat-group-contact-list">
              {groupRooms.map((g) => {
                const draft = draftsMap[g.id]?.trim() ?? "";
                const stickyG = stickyGroupPreviewByChatId[g.id];
                const fromMsg = previewFromMessagesByChatId[g.id];
                const effectiveLastText =
                  (g.lastMessageText ?? "").trim() ||
                  (stickyG?.lastText ?? "").trim() ||
                  (fromMsg?.text ?? "").trim() ||
                  "";
                const effectiveLastAt =
                  g.lastMessageAt ??
                  stickyG?.lastMs ??
                  fromMsg?.at ??
                  null;
                const previewText = draft
                  ? `Черновик: ${truncatePreviewLine(draft)}`
                  : effectiveLastText || "—";
                const hasLastMsg =
                  effectiveLastAt != null || Boolean(effectiveLastText);
                const groupTypingPeers = typingPeersByChatId[g.id] ?? [];
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      className={
                        selectedGroupChatId === g.id ? "chat-contact-item is-active" : "chat-contact-item"
                      }
                      onClick={() => {
                        const prevKey = selectedGroupChatId ?? selectedContactId;
                        if (prevKey) persistDraft(prevKey, composerText);
                        setSelectedContactId(null);
                        setPickedGroupSnapshot(g);
                        setSelectedGroupChatId(g.id);
                        setMenuAdjusted(null);
                        setMenu({ open: false, messageId: null, x: 0, y: 0 });
                      }}
                    >
                      <span className="chat-contact-avatar-wrap">
                        <span className="chat-contact-avatar chat-contact-avatar--group-thumb">
                          {g.avatarDataUrl ? (
                            <img src={g.avatarDataUrl} alt="" className="chat-group-thumb-img" />
                          ) : (
                            <span
                              className="chat-group-thumb-fallback"
                              style={{
                                background: `hsl(${avatarHueFromUid(g.id)} 45% 35%)`,
                              }}
                            >
                              {initialsFromFullName(g.title || "Г")}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="chat-contact-body">
                        <span className="chat-contact-top">
                          <span className="chat-contact-name">{g.title}</span>
                          {(unreadByChatId[g.id] ?? 0) > 0 ? (
                            <span
                              className="chat-contact-unread-badge"
                              aria-label={`Непрочитано: ${unreadByChatId[g.id]}`}
                            >
                              {(unreadByChatId[g.id] ?? 0) > 99
                                ? "99+"
                                : unreadByChatId[g.id]}
                            </span>
                          ) : null}
                        </span>
                        <span className="chat-contact-role-row">
                          <span className="chat-contact-role">Группа</span>
                          <span className="chat-contact-role-sep" aria-hidden />
                          <span className="chat-presence">{g.participantIds.length} уч.</span>
                        </span>
                        <span className="chat-contact-preview-row">
                          {draft ? (
                            <span className="chat-contact-preview chat-contact-preview--draft">
                              {previewText}
                            </span>
                          ) : groupTypingPeers.length > 0 ? (
                            <ContactTypingPreview
                              peerIds={groupTypingPeers}
                              displayNameForUid={displayNameForUid}
                            />
                          ) : (
                            <span className="chat-contact-preview">{previewText}</span>
                          )}
                          {hasLastMsg && effectiveLastAt != null && !draft && groupTypingPeers.length === 0 ? (
                            <span className="chat-contact-preview-meta">
                              <span className="chat-contact-meta">
                                {formatPreviewDateTime(effectiveLastAt)}
                              </span>
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="chat-contacts-section-title">Контакты:</div>

          {contactsListLoading ? (
            <div className="chat-contacts-empty">Загрузка контактов…</div>
          ) : contactsForChatList.length === 0 ? (
            <div className="chat-contacts-empty">
              Нет активных контактов. Убедитесь, что у пользователей в профиле статус
              «Активен» (или обновите данные в Firestore).
            </div>
          ) : isAdmin ? (
            <>
              <div className="chat-contacts-section-title">Инструкторы:</div>
              {adminInstructorContacts.length === 0 ? (
                <div className="chat-contacts-empty">Нет инструкторов.</div>
              ) : (
                <ul className="chat-contact-list">
                  {adminInstructorContacts.map((c) => {
                    const room = roomMetaByContactUid[c.uid.trim()];
                    const lastText = room?.lastText ?? "";
                    const hasLastMsg = Boolean(room?.lastMs);
                    const draft = draftsMap[c.uid]?.trim() ?? "";
                    const previewText = draft
                      ? `Черновик: ${truncatePreviewLine(draft)}`
                      : lastText || "—";
                    const me = selfId.trim();
                    const peer = c.uid.trim();
                    const dmChatId = me && peer ? chatIdPair(me, peer) : "";
                    const unreadDm = dmChatId ? (unreadByChatId[dmChatId] ?? 0) : 0;
                    const dmTypingPeers = dmChatId ? (typingPeersByChatId[dmChatId] ?? []) : [];
                    return (
                      <ChatDmContactListItem
                        key={c.uid}
                        c={c}
                        room={room}
                        draft={draft}
                        previewText={previewText}
                        hasLastMsg={hasLastMsg}
                        isActive={selectedContactId === c.uid}
                        chatPrivacy={chatPrivacy}
                        unreadCount={unreadDm}
                        typingPeerIds={dmTypingPeers}
                        displayNameForUid={displayNameForUid}
                        showLastSeenByRole={showLastSeenByRole}
                        currentUserRole={currentUserRole}
                        onSelect={() => {
                          const prevKey = selectedGroupChatId ?? selectedContactId;
                          if (prevKey) persistDraft(prevKey, composerText);
                          setSelectedGroupChatId(null);
                          setPickedGroupSnapshot(null);
                          setSelectedContactId(c.uid);
                          setMenuAdjusted(null);
                          setMenu({ open: false, messageId: null, x: 0, y: 0 });
                        }}
                        onAvatarPhotoClick={() =>
                          setAvatarLightbox({
                            src: c.avatarDataUrl!,
                            name: c.displayName,
                          })
                        }
                      />
                    );
                  })}
                </ul>
              )}

              <div className="chat-contacts-section-title">Курсанты:</div>
              {adminStudentGroupContacts.length === 0 ? (
                <div className="chat-contacts-empty">Нет курсантов.</div>
              ) : (
                <>
                  <div className="chat-contacts-section-subtitle">Группы:</div>
                  {adminStudentGroupContacts.map((group) => (
                    <div key={group.id}>
                      <button
                        type="button"
                        className="chat-contacts-group-toggle"
                        onClick={() => toggleAdminStudentGroupCollapsed(group.id)}
                        aria-expanded={!adminChatGroupCollapsedMap[group.id]}
                        aria-controls={`admin-chat-group-${group.id}`}
                      >
                        <span className="chat-contacts-group-toggle-ico" aria-hidden>
                          {adminChatGroupCollapsedMap[group.id] ? "▸" : "▾"}
                        </span>
                        <span className="chat-contacts-group-toggle-title">
                          {group.title} ({group.students.length})
                        </span>
                      </button>
                      <ul
                        id={`admin-chat-group-${group.id}`}
                        className="chat-contact-list"
                      >
                        {adminChatGroupCollapsedMap[group.id]
                          ? null
                          : group.students.map((c) => {
                          const room = roomMetaByContactUid[c.uid.trim()];
                          const lastText = room?.lastText ?? "";
                          const hasLastMsg = Boolean(room?.lastMs);
                          const draft = draftsMap[c.uid]?.trim() ?? "";
                          const previewText = draft
                            ? `Черновик: ${truncatePreviewLine(draft)}`
                            : lastText || "—";
                          const me = selfId.trim();
                          const peer = c.uid.trim();
                          const dmChatId = me && peer ? chatIdPair(me, peer) : "";
                          const unreadDm = dmChatId ? (unreadByChatId[dmChatId] ?? 0) : 0;
                          const dmTypingPeers = dmChatId ? (typingPeersByChatId[dmChatId] ?? []) : [];
                            return (
                              <ChatDmContactListItem
                                key={c.uid}
                                c={c}
                                room={room}
                                draft={draft}
                                previewText={previewText}
                                hasLastMsg={hasLastMsg}
                                isActive={selectedContactId === c.uid}
                                chatPrivacy={chatPrivacy}
                                unreadCount={unreadDm}
                                typingPeerIds={dmTypingPeers}
                                displayNameForUid={displayNameForUid}
                                showLastSeenByRole={showLastSeenByRole}
                                currentUserRole={currentUserRole}
                                onSelect={() => {
                                  const prevKey = selectedGroupChatId ?? selectedContactId;
                                  if (prevKey) persistDraft(prevKey, composerText);
                                  setSelectedGroupChatId(null);
                                  setPickedGroupSnapshot(null);
                                  setSelectedContactId(c.uid);
                                  setMenuAdjusted(null);
                                  setMenu({ open: false, messageId: null, x: 0, y: 0 });
                                }}
                                onAvatarPhotoClick={() =>
                                  setAvatarLightbox({
                                    src: c.avatarDataUrl!,
                                    name: c.displayName,
                                  })
                                }
                              />
                            );
                          })}
                      </ul>
                    </div>
                  ))}
                </>
              )}
            </>
          ) : (
            <ul className="chat-contact-list">
              {contactsOrdered.map((c) => {
                const room = roomMetaByContactUid[c.uid.trim()];
                const lastText = room?.lastText ?? "";
                const hasLastMsg = Boolean(room?.lastMs);
                const draft = draftsMap[c.uid]?.trim() ?? "";
                const previewText = draft
                  ? `Черновик: ${truncatePreviewLine(draft)}`
                  : lastText || "—";
                const me = selfId.trim();
                const peer = c.uid.trim();
                const dmChatId = me && peer ? chatIdPair(me, peer) : "";
                const unreadDm = dmChatId ? (unreadByChatId[dmChatId] ?? 0) : 0;
                const dmTypingPeers = dmChatId ? (typingPeersByChatId[dmChatId] ?? []) : [];
                return (
                  <ChatDmContactListItem
                    key={c.uid}
                    c={c}
                    room={room}
                    draft={draft}
                    previewText={previewText}
                    hasLastMsg={hasLastMsg}
                    isActive={selectedContactId === c.uid}
                    chatPrivacy={chatPrivacy}
                    unreadCount={unreadDm}
                    typingPeerIds={dmTypingPeers}
                    displayNameForUid={displayNameForUid}
                    showLastSeenByRole={showLastSeenByRole}
                    currentUserRole={currentUserRole}
                    onSelect={() => {
                      const prevKey = selectedGroupChatId ?? selectedContactId;
                      if (prevKey) persistDraft(prevKey, composerText);
                      setSelectedGroupChatId(null);
                      setPickedGroupSnapshot(null);
                      setSelectedContactId(c.uid);
                      setMenuAdjusted(null);
                      setMenu({ open: false, messageId: null, x: 0, y: 0 });
                    }}
                    onAvatarPhotoClick={() =>
                      setAvatarLightbox({
                        src: c.avatarDataUrl!,
                        name: c.displayName,
                      })
                    }
                  />
                );
              })}
            </ul>
          )}
        </aside>

        {(selectedContactId || selectedGroupChatId) ? (
        <section
          ref={chatRoomSectionRef}
          className={
            threadOpen ? "chat-room chat-room--thread" : "chat-room"
          }
          onClick={(e) => {
            const t = e.target as HTMLElement;
            if (t.closest(".chat-composer")) return;
            composerRef.current?.blur();
          }}
        >
          {selectedGroupChatId && !selectedGroupRoom ? (
            <div className="chat-room-empty">
              <p>Загрузка группы…</p>
            </div>
          ) : selectedContactId && !selectedContact ? (
            <div className="chat-room-empty">
              <p>Контакт не найден.</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => closeThread()}>
                К списку контактов
              </button>
            </div>
          ) : (
            <>
              {!threadOpen ? (
                <div className="chat-room-top">
                  <button
                    type="button"
                    className="chat-thread-back-btn"
                    onClick={() => closeThread()}
                    aria-label="Назад к списку контактов"
                  >
                    <IconArrowBack className="chat-thread-back-ico" />
                  </button>
                  <div className="chat-room-user">
                    {selectedGroupRoom ? (
                      <>
                        <span className="chat-contact-avatar chat-contact-avatar-lg chat-contact-avatar--group-header">
                          {selectedGroupRoom.avatarDataUrl ? (
                            <img
                              src={selectedGroupRoom.avatarDataUrl}
                              alt=""
                              className="chat-group-header-avatar-img"
                            />
                          ) : (
                            <span
                              className="chat-group-header-avatar-fallback"
                              style={{
                                background: `hsl(${avatarHueFromUid(selectedGroupRoom.id)} 45% 35%)`,
                              }}
                            >
                              {initialsFromFullName(selectedGroupRoom.title || "Г")}
                            </span>
                          )}
                        </span>
                        <div className="chat-room-user-meta">
                          <div className="chat-room-user-name">{selectedGroupRoom.title}</div>
                          <button
                            type="button"
                            className="chat-room-user-sub chat-room-user-sub-btn"
                            onClick={() => setGroupParticipantsViewerOpen(true)}
                          >
                            Группа · {selectedGroupRoom.participantIds.length} участников
                          </button>
                          {chatHeaderTypingLine}
                        </div>
                        {isAdmin ? (
                          <button
                            type="button"
                            className="chat-ico-btn chat-group-header-edit-btn"
                            title="Редактировать группу"
                            aria-label="Редактировать группу"
                            onClick={() => setEditGroupModalOpen(true)}
                          >
                            <IconMenuEdit className="chat-ico" />
                          </button>
                        ) : null}
                      </>
                    ) : selectedContact ? (
                      <>
                        <UserChatAvatar
                          profile={selectedContact}
                          size="header"
                          onPhotoClick={
                            selectedContact.avatarDataUrl
                              ? () =>
                                  setAvatarLightbox({
                                    src: selectedContact.avatarDataUrl!,
                                    name: selectedContact.displayName,
                                  })
                              : undefined
                          }
                        />
                        <div className="chat-room-user-meta">
                          <div className="chat-room-user-name">{formatShortFio(selectedContact.displayName)}</div>
                          <div className="chat-room-user-sub">
                            {typingPeerIds.length > 0 ? chatHeaderTypingLine : dmChatHeaderSubtitle}
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                  {chatHeaderMode === "refreshOnly" ? (
                    <div className="chat-thread-header-actions">
                      <button
                        type="button"
                        className="chat-ico-btn"
                        title="Обновить контакты"
                        onClick={() => setContactsReloadKey((v) => v + 1)}
                      >
                        <IconRefresh className="chat-ico" />
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {threadOpen ? (
                <div ref={chatThreadHeaderFixedRef} className="chat-room-top chat-room-top--fixed">
                  <button
                    type="button"
                    className="chat-thread-back-btn"
                    onClick={() => closeThread()}
                    aria-label="Назад к списку контактов"
                  >
                    <IconArrowBack className="chat-thread-back-ico" />
                  </button>
                  <div className="chat-room-user">
                    {selectedGroupRoom ? (
                      <>
                        <span className="chat-contact-avatar chat-contact-avatar-lg chat-contact-avatar--group-header">
                          {selectedGroupRoom.avatarDataUrl ? (
                            <img
                              src={selectedGroupRoom.avatarDataUrl}
                              alt=""
                              className="chat-group-header-avatar-img"
                            />
                          ) : (
                            <span
                              className="chat-group-header-avatar-fallback"
                              style={{
                                background: `hsl(${avatarHueFromUid(selectedGroupRoom.id)} 45% 35%)`,
                              }}
                            >
                              {initialsFromFullName(selectedGroupRoom.title || "Г")}
                            </span>
                          )}
                        </span>
                        <div className="chat-room-user-meta">
                          <div className="chat-room-user-name">{selectedGroupRoom.title}</div>
                          <button
                            type="button"
                            className="chat-room-user-sub chat-room-user-sub-btn"
                            onClick={() => setGroupParticipantsViewerOpen(true)}
                          >
                            Группа · {selectedGroupRoom.participantIds.length} участников
                          </button>
                          {chatHeaderTypingLine}
                        </div>
                        {isAdmin ? (
                          <button
                            type="button"
                            className="chat-ico-btn chat-group-header-edit-btn"
                            title="Редактировать группу"
                            aria-label="Редактировать группу"
                            onClick={() => setEditGroupModalOpen(true)}
                          >
                            <IconMenuEdit className="chat-ico" />
                          </button>
                        ) : null}
                      </>
                    ) : selectedContact ? (
                      <>
                        <UserChatAvatar
                          profile={selectedContact}
                          size="header"
                          onPhotoClick={
                            selectedContact.avatarDataUrl
                              ? () =>
                                  setAvatarLightbox({
                                    src: selectedContact.avatarDataUrl!,
                                    name: selectedContact.displayName,
                                  })
                              : undefined
                          }
                        />
                        <div className="chat-room-user-meta">
                          <div className="chat-room-user-name">{formatShortFio(selectedContact.displayName)}</div>
                          <div className="chat-room-user-sub">
                            {typingPeerIds.length > 0 ? chatHeaderTypingLine : dmChatHeaderSubtitle}
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                  {chatHeaderMode === "refreshOnly" ? (
                    <div className="chat-thread-header-actions">
                      <button
                        type="button"
                        className="chat-ico-btn"
                        title="Обновить контакты"
                        onClick={() => setContactsReloadKey((v) => v + 1)}
                      >
                        <IconRefresh className="chat-ico" />
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="chat-thread-messages-shell">
              <div
                className="chat-messages chat-messages--thread"
                ref={scrollRef}
              >
                <div
                  className={
                    messagesForDisplay.length === 0
                      ? "chat-messages-inner chat-messages-inner--empty"
                      : "chat-messages-inner"
                  }
                >
                {messagesForDisplay.length === 0 ? (
                  <div className="chat-messages-empty">Нет сообщений.</div>
                ) : (
                  <ul className="chat-message-list">
                    {messageTimeline.map((entry) => {
                      if (entry.type === "date") {
                        return (
                          <li
                            key={`date-${entry.dayKey}`}
                            className="chat-msg-day-separator"
                            role="presentation"
                          >
                            <span className="chat-msg-day-separator-label">{entry.label}</span>
                          </li>
                        );
                      }
                      const m = entry.message;
                      const isLast = m.id === lastMsgId;
                      const mine = m.senderId === currentUserId;
                      const reactionBurst =
                        reactionBursts.find((b) => b.messageId === m.id) ?? null;
                      const isDeletingVisual =
                        deletingMessageId === m.id || remoteDeletingIds.includes(m.id);
                      const replyMsg = m.replyToMessageId
                        ? messageByIdForRender.get(m.replyToMessageId) ?? null
                        : null;
                      const metaTimeLabel = formatRuTime(m.editedAt ?? m.createdAt);
                      const checkTitleMine = [
                        selectedGroupChatId
                          ? "Отправлено"
                          : dmPeerShowsOnline
                            ? "Доставлено (собеседник в сети)"
                            : "Доставлено",
                        m.editedAt != null
                          ? `Изменено ${formatRuTime(m.editedAt)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ");

                      const msgSelected = selectedMessageIds.includes(m.id);
                      const incomingSenderProfile =
                        !mine && selectedGroupChatId
                          ? getProfileForMessageSender(m.senderId)
                          : null;

                      return (
                        <li
                          key={m.id}
                          ref={isLast ? lastMessageRef : undefined}
                          data-chat-msg-id={m.id}
                          className={[
                            mine ? "chat-msg chat-msg--mine" : "chat-msg",
                            !mine && selectedGroupChatId ? "chat-msg--group-incoming" : "",
                            quoteHighlightMessageId === m.id ? "chat-msg--quote-highlight" : "",
                            isDeletingVisual ? "chat-msg--deleting" : "",
                            selectionMode ? "chat-msg--selection" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {selectionMode ? (
                            <button
                              type="button"
                              className="chat-msg-select-toggle"
                              aria-pressed={msgSelected}
                              aria-label={msgSelected ? "Снять выбор" : "Выбрать сообщение"}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleMessageSelected(m.id);
                              }}
                            >
                              <span className="chat-msg-select-box" aria-hidden>
                                {msgSelected ? "✓" : ""}
                              </span>
                            </button>
                          ) : null}
                          <ChatMessageBubbleChrome
                            mine={mine}
                            incomingSender={incomingSenderProfile}
                            showIncomingSenderChrome={Boolean(selectedGroupChatId)}
                            onAvatarPhotoClick={
                              incomingSenderProfile?.avatarDataUrl
                                ? () =>
                                    setAvatarLightbox({
                                      src: incomingSenderProfile.avatarDataUrl!,
                                      name: formatShortFio(incomingSenderProfile.displayName),
                                    })
                                : undefined
                            }
                          >
                            {isDeletingVisual ? (
                              <div className="chat-msg-delete-particles" aria-hidden>
                                {(deleteParticlesCacheRef.current.get(m.id) ?? buildDeleteParticles(mine)).map(
                                  (p, i) => (
                                    <span
                                      key={i}
                                      className="chat-msg-delete-particle"
                                      style={
                                        {
                                          "--ox": p.ox,
                                          "--oy": p.oy,
                                          "--dx": p.dx,
                                          "--dy": p.dy,
                                          "--rot": p.rot,
                                          "--delay": p.delay,
                                          "--sz": p.sz,
                                          background: p.bg,
                                        } as CSSProperties
                                      }
                                    />
                                  )
                                )}
                              </div>
                            ) : null}
                            <div
                            className={[
                              "chat-bubble",
                              isDeletingVisual ? "chat-bubble--deleting" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              if (isDeletingVisual) return;
                              if (selectionMode) {
                                toggleMessageSelected(m.id);
                                return;
                              }
                              setMenu({ open: true, messageId: m.id, x: e.clientX, y: e.clientY });
                            }}
                            onClick={(e) => {
                              if (!selectionMode) return;
                              const t = e.target as HTMLElement;
                              if (t.closest("button, a, audio")) return;
                              toggleMessageSelected(m.id);
                            }}
                            onPointerDown={(e) => {
                              if (selectionMode) return;
                              if (isDeletingVisual) return;
                              if (e.pointerType === "touch" || e.pointerType === "mouse") {
                                const pid = e.pointerId;
                                const cx = e.clientX;
                                const cy = e.clientY;
                                const mid = m.id;
                                let startX = cx;
                                let startY = cy;
                                const cancelMove = (ev: PointerEvent) => {
                                  if (ev.pointerId !== pid) return;
                                  const dx = Math.abs(ev.clientX - startX);
                                  const dy = Math.abs(ev.clientY - startY);
                                  if (dx > 12 || dy > 12) cleanup();
                                };
                                const cleanup = () => {
                                  window.clearTimeout(t);
                                  document.removeEventListener("pointerup", onDocPointerEnd);
                                  document.removeEventListener("pointercancel", onDocPointerEnd);
                                  document.removeEventListener("pointermove", cancelMove);
                                };
                                const onDocPointerEnd = (ev: PointerEvent) => {
                                  if (ev.pointerId !== pid) return;
                                  cleanup();
                                };
                                const t = window.setTimeout(() => {
                                  cleanup();
                                  setMenu({ open: true, messageId: mid, x: cx, y: cy });
                                }, 550);
                                document.addEventListener("pointermove", cancelMove);
                                document.addEventListener("pointerup", onDocPointerEnd);
                                document.addEventListener("pointercancel", onDocPointerEnd);
                              }
                            }}
                          >
                            {!mine && selectedGroupChatId && incomingSenderProfile ? (
                              <div className="chat-bubble-sender-meta">
                                <span className="chat-bubble-sender-name">
                                  {formatShortFio(incomingSenderProfile.displayName)}
                                </span>
                                <span className="chat-bubble-sender-role">
                                  Роль:{" "}
                                  {incomingSenderProfile.role != null
                                    ? roleLabel[incomingSenderProfile.role]
                                    : "—"}
                                </span>
                              </div>
                            ) : null}
                            {m.forwarded ? (
                              <div className="chat-bubble-forwarded">
                                <span className="chat-bubble-forwarded-ico" aria-hidden>
                                  <svg viewBox="0 0 24 24" width="14" height="14">
                                    <path
                                      fill="currentColor"
                                      d="M12 8V4l8 8-8 8v-4H4V8h8zm-2 2H6v4h4v2.17L16.17 12 10 5.83V10z"
                                    />
                                  </svg>
                                </span>
                                <span className="chat-bubble-forwarded-label">
                                  Пересланное сообщение
                                </span>
                              </div>
                            ) : null}
                            {replyMsg ? (
                              <button
                                type="button"
                                className="chat-reply"
                                title="Перейти к сообщению"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  focusQuotedMessage(replyMsg.id);
                                }}
                              >
                                <span className="chat-reply-name">
                                  {replyMsg.senderId === currentUserId
                                    ? "Вы"
                                    : selectedGroupChatId
                                      ? displayNameForUid(replyMsg.senderId)
                                      : selectedContactName}
                                </span>
                                <span className="chat-reply-text">
                                  {replyMsg.type === "text"
                                    ? replyMsg.text
                                    : replyMsg.type === "voice"
                                      ? "Голосовое сообщение"
                                      : replyMsg.fileName
                                        ? `Файл: ${replyMsg.fileName}`
                                        : "Медиа"}
                                </span>
                              </button>
                            ) : null}

                            {isVoiceChatMessage(m) ? (
                              <div className="chat-bubble-attachment">
                                <ChatVoiceMessagePlayer
                                  src={m.payloadDataUrl!}
                                  isMine={mine}
                                  avatarProfile={
                                    mine
                                      ? {
                                          uid: currentUserId,
                                          displayName: profile?.displayName ?? "Вы",
                                          avatarDataUrl: profile?.avatarDataUrl ?? null,
                                        }
                                      : getProfileForMessageSender(m.senderId)
                                  }
                                />
                              </div>
                            ) : m.type === "text" ? (
                              <span className="chat-bubble-text">{m.text}</span>
                            ) : m.type === "image" && m.payloadDataUrl ? (
                              <button
                                type="button"
                                className="chat-bubble-image-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (selectionMode) {
                                    toggleMessageSelected(m.id);
                                    return;
                                  }
                                  setLightbox({
                                    src: m.payloadDataUrl!,
                                    fileName: m.fileName ?? null,
                                  });
                                }}
                              >
                                <img
                                  className="chat-bubble-image"
                                  src={m.payloadDataUrl}
                                  alt={m.fileName ?? "Фото"}
                                />
                              </button>
                            ) : m.type === "file" && m.payloadDataUrl ? (
                              (() => {
                                const fk = chatFilePreviewKind(m);
                                const ext = chatFileExtensionLabel(m.fileName);
                                const fileOpenHint = isIosLikeDevice()
                                  ? "Просмотр"
                                  : "Открыть в новой вкладке";
                                return (
                                  <div className="chat-bubble-file-card">
                                    {fk === "pdf" ? (
                                      <div className="chat-bubble-file-preview chat-bubble-file-preview--pdf">
                                        <iframe
                                          className="chat-bubble-file-preview-frame"
                                          title={m.fileName ?? "PDF"}
                                          src={m.payloadDataUrl}
                                          style={{
                                            pointerEvents: selectionMode ? "none" : "auto",
                                          }}
                                        />
                                      </div>
                                    ) : null}
                                    {fk === "image" ? (
                                      <button
                                        type="button"
                                        className="chat-bubble-file-preview chat-bubble-file-preview--image"
                                        title="Просмотр"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (selectionMode) {
                                            toggleMessageSelected(m.id);
                                            return;
                                          }
                                          setLightbox({
                                            src: m.payloadDataUrl!,
                                            fileName: m.fileName ?? null,
                                          });
                                        }}
                                      >
                                        <img
                                          className="chat-bubble-file-preview-img"
                                          src={m.payloadDataUrl}
                                          alt={m.fileName ?? ""}
                                        />
                                      </button>
                                    ) : null}
                                    {fk === "video" ? (
                                      <div className="chat-bubble-file-preview chat-bubble-file-preview--video">
                                        <video
                                          className="chat-bubble-file-preview-video"
                                          src={m.payloadDataUrl}
                                          controls
                                          playsInline
                                          preload="metadata"
                                          style={{
                                            pointerEvents: selectionMode ? "none" : "auto",
                                          }}
                                        />
                                      </div>
                                    ) : null}
                                    {fk === "other" ? (
                                      <div className="chat-bubble-file-preview chat-bubble-file-preview--other">
                                        <span className="chat-bubble-file-preview-doc-icon" aria-hidden>
                                          📄
                                        </span>
                                        {ext ? (
                                          <span className="chat-bubble-file-preview-ext">{ext}</span>
                                        ) : null}
                                      </div>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="chat-bubble-file-open"
                                      title={fileOpenHint}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (selectionMode) {
                                          toggleMessageSelected(m.id);
                                          return;
                                        }
                                        openChatPayloadInNewWindow(m);
                                      }}
                                    >
                                      <span className="chat-bubble-file-open-name">
                                        {m.fileName ?? "Файл"}
                                      </span>
                                      <span className="chat-bubble-file-open-hint">
                                        {fileOpenHint}
                                      </span>
                                    </button>
                                  </div>
                                );
                              })()
                            ) : null}

                            <span className="chat-msg-meta">
                                {metaTimeLabel}
                                {mine ? (
                                  <span className="chat-msg-check" title={checkTitleMine}>
                                    {selectedGroupChatId
                                      ? "✓"
                                      : dmPeerShowsOnline
                                        ? "✓✓"
                                        : "✓"}
                                  </span>
                                ) : null}
                                {m.editedAt != null ? (
                                  <span
                                    className="chat-msg-edited"
                                    title={
                                      m.editedAt != null
                                        ? `Изменено ${formatRuTime(m.editedAt)}`
                                        : undefined
                                    }
                                  >
                                    (ред.)
                                  </span>
                                ) : null}
                              </span>

                            {((m.reactions && Object.keys(m.reactions).length > 0) ||
                              reactionBurst?.messageId === m.id)
                              ? (() => {
                                  const burstHere =
                                    reactionBurst && reactionBurst.messageId === m.id;
                                  const burstInner =
                                    burstHere && reactionBurst ? (
                                      <div className="chat-reaction-burst-inline" aria-hidden>
                                        {reactionBurst.items.map((p, i) => (
                                          <span
                                            key={`${reactionBurst.id}-${i}`}
                                            className="chat-reaction-burst-particle chat-reaction-burst-particle--inline"
                                            style={
                                              {
                                                "--dx": `${p.dx}px`,
                                                "--dy": `${p.dy}px`,
                                                "--rot": `${p.rot}deg`,
                                                animationDelay: `${p.delay}ms`,
                                              } as CSSProperties
                                            }
                                          >
                                            {p.emoji}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null;
                                  const hasReactions =
                                    m.reactions && Object.keys(m.reactions).length > 0;
                                  const chipHasPrimary =
                                    hasReactions &&
                                    burstHere &&
                                    m.reactions != null &&
                                    Object.prototype.hasOwnProperty.call(
                                      m.reactions,
                                      reactionBurst.primaryEmoji
                                    );
                                  return (
                                    <div className="chat-msg-reactions-host">
                                      {hasReactions ? (
                                        <div className="chat-msg-reactions-row" aria-label="Реакции">
                                          {Object.entries(m.reactions!).map(([emoji, uids]) => {
                                            const myChip = uids.includes(currentUserId);
                                            return (
                                              <span key={emoji} className="chat-reaction-bubble-slot">
                                                {burstHere &&
                                                reactionBurst.primaryEmoji === emoji
                                                  ? burstInner
                                                  : null}
                                                {myChip ? (
                                                  <button
                                                    type="button"
                                                    className="chat-reaction-bubble chat-reaction-bubble--mine"
                                                    title="Снять реакцию"
                                                    aria-label="Снять реакцию"
                                                    onPointerDown={(e) => e.stopPropagation()}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      void handleReactionChipTap(m.id);
                                                    }}
                                                  >
                                                    <span className="chat-reaction-bubble-emoji">
                                                      {emoji}
                                                    </span>
                                                    <span className="chat-reaction-bubble-count">
                                                      {uids.length}
                                                    </span>
                                                  </button>
                                                ) : (
                                                  <span className="chat-reaction-bubble">
                                                    <span className="chat-reaction-bubble-emoji">
                                                      {emoji}
                                                    </span>
                                                    <span className="chat-reaction-bubble-count">
                                                      {uids.length}
                                                    </span>
                                                  </span>
                                                )}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      ) : null}
                                      {burstHere && (!hasReactions || !chipHasPrimary) ? (
                                        <div
                                          className="chat-msg-reactions-row chat-msg-reactions-row--burst-only"
                                          aria-hidden
                                        >
                                          {burstInner}
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })()
                              : null}
                          </div>
                          </ChatMessageBubbleChrome>
                        </li>
                      );
                    })}
                  </ul>
                )}
                </div>
              </div>
              {threadOpen && messagesForDisplay.length > 0 && showScrollToBottom ? (
                <button
                  type="button"
                  className="chat-scroll-to-bottom-btn"
                  title="К последнему сообщению"
                  aria-label="К последнему сообщению"
                  onClick={() => {
                    scrollChatToBottom();
                    requestAnimationFrame(() => updateScrollToBottomVisibility());
                  }}
                >
                  <IconArrowDown className="chat-scroll-to-bottom-ico" />
                </button>
              ) : null}
              </div>

              <div className="chat-composer" ref={composerBarRef}>
                {selectionMode ? (
                  <div className="chat-selection-toolbar" role="toolbar" aria-label="Выбранные сообщения">
                    <span className="chat-selection-toolbar-count">
                      Выбрано: {selectedMessageIds.length}
                    </span>
                    <div className="chat-selection-toolbar-buttons">
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={selectedMessageIds.length === 0}
                        onClick={() => openForwardOverlay([...selectedMessageIds])}
                      >
                        Переслать
                      </button>
                      {isAdmin ? (
                        batchToolbarHasDelete ? (
                          batchShowDeleteForMe && batchShowDeleteForAll ? (
                            <div className="chat-selection-delete-wrap">
                              <button
                                type="button"
                                className="btn btn-sm btn-danger"
                                disabled={selectedMessageIds.length === 0}
                                onClick={() => setBatchDeleteSubOpen((v) => !v)}
                              >
                                Удалить
                              </button>
                              {batchDeleteSubOpen ? (
                                <div
                                  className="chat-selection-delete-sub"
                                  role="group"
                                  aria-label="Как удалить"
                                >
                                  <button
                                    type="button"
                                    className="btn btn-sm"
                                    onClick={() => void runBatchDelete("all")}
                                  >
                                    Удалить у всех
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm"
                                    onClick={() => void runBatchDelete("me")}
                                  >
                                    Удалить у меня
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          ) : batchShowDeleteForMe ? (
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              disabled={selectedMessageIds.length === 0}
                              onClick={() => void runBatchDelete("me")}
                            >
                              Удалить
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              disabled={selectedMessageIds.length === 0}
                              onClick={() => void runBatchDelete("all")}
                            >
                              Удалить
                            </button>
                          )
                        ) : null
                      ) : (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          disabled={selectedMessageIds.length === 0}
                          onClick={() => void runBatchDelete("me")}
                        >
                          Удалить
                        </button>
                      )}
                      <button type="button" className="btn btn-sm" onClick={() => exitSelectionMode()}>
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                {editingMessageId ? (
                  <div className="chat-reply-composer">
                    <button
                      type="button"
                      className="chat-reply-composer-target"
                      title="Перейти к сообщению"
                      onClick={() => focusQuotedMessage(editingMessageId)}
                    >
                      <span className="chat-reply-composer-label">Редактирование:</span>
                      <span className="chat-reply-composer-text">
                        {(() => {
                          const msg = messageById.get(editingMessageId ?? "");
                          if (!msg) return "";
                          if (msg.type === "text") return msg.text ?? "";
                          if (msg.type === "voice") return "Голосовое сообщение";
                          return msg.fileName ? `Файл: ${msg.fileName}` : "Медиа";
                        })()}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="chat-reply-composer-close"
                      onClick={() => cancelEditingComposer()}
                      aria-label="Отменить редактирование"
                    >
                      ×
                    </button>
                  </div>
                ) : replyToMessageId ? (
                  <div className="chat-reply-composer">
                    <button
                      type="button"
                      className="chat-reply-composer-target"
                      title="Перейти к сообщению"
                      onClick={() => focusQuotedMessage(replyToMessageId)}
                    >
                      <span className="chat-reply-composer-label">Ответ:</span>
                      <span className="chat-reply-composer-text">
                        {(() => {
                          const msg = messageById.get(replyToMessageId ?? "");
                          if (!msg) return "";
                          if (msg.type === "text") return msg.text;
                          if (msg.type === "voice") return "Голосовое сообщение";
                          return msg.fileName ? `Файл: ${msg.fileName}` : "Медиа";
                        })()}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="chat-reply-composer-close"
                      onClick={() => setReplyToMessageId(null)}
                      aria-label="Отменить ответ"
                    >
                      ×
                    </button>
                  </div>
                ) : null}

                {pendingAttachment ? (
                  pendingAttachment.kind === "image" ? (
                    <div className="chat-pending-image" aria-label="Фото к отправке">
                      <img
                        src={pendingAttachment.previewUrl}
                        alt=""
                        className="chat-pending-image-thumb"
                      />
                      <button
                        type="button"
                        className="chat-pending-image-remove"
                        aria-label="Убрать фото"
                        onClick={() => {
                          setPendingAttachment((prev) => {
                            if (prev) URL.revokeObjectURL(prev.previewUrl);
                            return null;
                          });
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="chat-pending-pdf" aria-label="PDF к отправке">
                      <iframe
                        className="chat-pending-pdf-frame"
                        title={pendingAttachment.file.name}
                        src={pendingAttachment.previewUrl}
                      />
                      <button
                        type="button"
                        className="chat-pending-pdf-remove"
                        aria-label="Убрать PDF"
                        onClick={() => {
                          setPendingAttachment((prev) => {
                            if (prev) URL.revokeObjectURL(prev.previewUrl);
                            return null;
                          });
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )
                ) : null}

                <input
                  ref={fileInputRef}
                  type="file"
                  className="chat-file-input"
                  tabIndex={-1}
                  aria-hidden={true}
                  accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    void handlePickAttachment(f);
                    e.currentTarget.value = "";
                  }}
                />
                {isVoiceRecording ? (
                  <div
                    className={`chat-voice-recording-bar${voiceRecordPaused ? " chat-voice-recording-bar--paused" : ""}`}
                    role="status"
                    aria-live="polite"
                    aria-label={voiceRecordPaused ? "Пауза" : "Идёт запись"}
                  >
                    <div className="chat-voice-recording-main">
                      {voiceRecordPaused ? (
                        <button
                          type="button"
                          className="chat-ico-btn chat-voice-recording-icon-btn chat-voice-recording-main-pause"
                          title="Продолжить запись"
                          aria-label="Продолжить запись"
                          disabled={composerSending}
                          onClick={() => resumeVoiceRecording()}
                        >
                          <IconVoicePlay className="chat-composer-ico" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="chat-ico-btn chat-voice-recording-icon-btn chat-voice-recording-main-pause"
                          title="Пауза"
                          aria-label="Пауза"
                          disabled={composerSending}
                          onClick={() => pauseVoiceRecording()}
                        >
                          <IconVoicePause className="chat-composer-ico" />
                        </button>
                      )}
                      <span
                        className={`chat-voice-recording-dot${voiceRecordPaused ? " is-paused" : ""}`}
                        aria-hidden
                      />
                      <span className="chat-voice-recording-time">
                        {formatVoiceRecClock(voiceRecordingMs)}
                      </span>
                    </div>
                    <div className="chat-voice-recording-actions">
                      <button
                        type="button"
                        className="chat-ico-btn chat-voice-recording-icon-btn"
                        title="Прослушать перед отправкой"
                        aria-label="Прослушать запись перед отправкой"
                        disabled={composerSending}
                        onClick={() => void previewVoiceRecording()}
                      >
                        <IconVoicePreview className="chat-composer-ico" />
                      </button>
                      <button
                        type="button"
                        className="chat-ico-btn chat-voice-recording-icon-btn chat-voice-recording-icon-btn--danger"
                        title="Удалить запись"
                        aria-label="Удалить запись"
                        onClick={() => void cancelVoiceRecording()}
                        disabled={composerSending}
                      >
                        <IconMenuTrash className="chat-composer-ico" />
                      </button>
                      <button
                        type="button"
                        className="chat-ico-btn chat-ico-btn--send chat-voice-recording-send"
                        title="Отправить голосовое"
                        aria-label="Отправить голосовое сообщение"
                        disabled={composerSending}
                        onClick={() => void finalizeVoiceSession()}
                      >
                        <IconSend className="chat-composer-ico" />
                      </button>
                    </div>
                  </div>
                ) : null}
                {voicePreview ? (
                  <div className="chat-voice-preview-bar" role="region" aria-label="Предпросмотр голосового">
                    <audio
                      className="chat-voice-preview-audio"
                      src={voicePreview.url}
                      controls
                      playsInline
                      preload="metadata"
                    />
                    <div className="chat-voice-preview-actions">
                      <button
                        type="button"
                        className="chat-ico-btn chat-ico-btn--send chat-voice-preview-send"
                        title="Отправить голосовое"
                        aria-label="Отправить голосовое сообщение"
                        disabled={composerSending}
                        onClick={() => void sendVoicePreview()}
                      >
                        <IconSend className="chat-composer-ico" />
                      </button>
                      <button
                        type="button"
                        className="chat-ico-btn chat-voice-preview-delete"
                        title="Удалить предпросмотр"
                        aria-label="Удалить предпросмотр"
                        disabled={composerSending}
                        onClick={() => clearVoicePreview()}
                      >
                        <IconMenuTrash className="chat-composer-ico" />
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="chat-composer-row">
                  <button
                    type="button"
                    className="chat-ico-btn chat-ico-btn--attach"
                    title="Прикрепить файл"
                    aria-label="Прикрепить файл"
                    disabled={composerSending || isVoiceRecording || Boolean(voicePreview)}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <IconPaperclip className="chat-composer-ico" />
                  </button>
                  <textarea
                    ref={composerRef}
                    className="chat-composer-input"
                    rows={1}
                    value={composerText}
                    readOnly={composerSending || isVoiceRecording}
                    onChange={handleComposerChange}
                    onKeyDown={(e) => {
                      if (composerSending) return;
                      if (editingMessageId && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                    placeholder={
                      editingMessageId ? "Редактировать сообщение…" : "Введите сообщение…"
                    }
                    aria-label={editingMessageId ? "Редактировать сообщение" : "Введите сообщение"}
                    spellCheck={false}
                    autoCapitalize="sentences"
                    autoCorrect="off"
                  />
                  <button
                    type="button"
                    className="chat-ico-btn chat-ico-btn--send"
                    title="Отправить"
                    aria-label="Отправить"
                    disabled={composerSending || isVoiceRecording}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void handleSend()}
                  >
                    <IconSend className="chat-composer-ico" />
                  </button>
                  <button
                    type="button"
                    className={`chat-ico-btn chat-ico-btn--mic${isVoiceRecording ? " is-recording" : ""}`}
                    title="Начать запись голосового сообщения"
                    aria-label="Начать запись голосового сообщения"
                    disabled={
                      composerSending ||
                      isVoiceRecording ||
                      Boolean(editingMessageId) ||
                      Boolean(pendingAttachment) ||
                      !selectedChatId ||
                      !selfId.trim()
                    }
                    onClick={() => startVoiceRecording()}
                  >
                    <IconMic className="chat-composer-ico" />
                  </button>
                </div>
                  </>
                )}
              </div>
            </>
          )}
        </section>
        ) : null}
      </div>

      {err ? <div className="chat-error" role="alert">{err}</div> : null}
      {chatMenuPortal ? chatMenuPortal : null}
      {lightbox && typeof document !== "undefined"
        ? createPortal(
            <div
              className="chat-image-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label="Просмотр фото"
            >
              <button
                type="button"
                className="chat-image-lightbox-backdrop"
                tabIndex={-1}
                aria-label="Закрыть"
                onClick={() => setLightbox(null)}
              />
              <button
                type="button"
                className="chat-image-lightbox-close"
                aria-label="Закрыть"
                onClick={() => setLightbox(null)}
              >
                ×
              </button>
              <img
                className="chat-image-lightbox-img"
                src={lightbox.src}
                alt={lightbox.fileName ?? ""}
              />
            </div>,
            document.body
          )
        : null}
      {avatarLightbox && typeof document !== "undefined"
        ? createPortal(
            <div
              className="chat-image-lightbox chat-avatar-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={`Аватар: ${avatarLightbox.name}`}
            >
              <button
                type="button"
                className="chat-image-lightbox-backdrop"
                tabIndex={-1}
                aria-label="Закрыть"
                onClick={() => setAvatarLightbox(null)}
              />
              <button
                type="button"
                className="chat-image-lightbox-close"
                aria-label="Закрыть"
                onClick={() => setAvatarLightbox(null)}
              >
                ×
              </button>
              <img
                className="chat-image-lightbox-img chat-avatar-lightbox-img"
                src={avatarLightbox.src}
                alt={avatarLightbox.name}
              />
            </div>,
            document.body
          )
        : null}
      {groupParticipantsOverlayPortal ? groupParticipantsOverlayPortal : null}
      {forwardOverlayPortal ? forwardOverlayPortal : null}
      {correspondenceOverlayPortal ? correspondenceOverlayPortal : null}
      <CreateGroupChatModal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        contacts={contactsForUi}
        currentUserId={currentUserId}
        trainingGroups={isAdmin ? trainingGroups : []}
        roleLabel={roleLabel}
        onCreated={(chatId) => {
          setSelectedContactId(null);
          setSelectedGroupChatId(chatId);
          setGroupModalOpen(false);
        }}
      />
      <EditGroupChatModal
        open={editGroupModalOpen}
        onClose={() => setEditGroupModalOpen(false)}
        room={selectedGroupRoom}
        contacts={contactsForUi}
        currentUserId={currentUserId}
        trainingGroups={isAdmin ? trainingGroups : []}
        roleLabel={roleLabel}
        onSaved={() => {}}
        onDeleted={() => {
          setEditGroupModalOpen(false);
          closeThread();
        }}
      />
    </div>
  );
}

