import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { initialsFromFullName, avatarHueFromUid } from "@/admin/instructorAvatar";
import { formatShortFio } from "@/admin/formatShortFio";
import { dateKeyToRuDisplay, sortSlotsByTime } from "@/admin/scheduleFormat";
import { subscribeTrainingGroups } from "@/firebase/admin";
import {
  instructorApplyRunningLateShift,
  instructorCompleteDriveLiveSession,
  instructorDeleteDriveSlot,
  instructorStartDriveLiveSession,
  submitInstructorRatingStudent,
  subscribeDriveSlotsForInstructor,
} from "@/firebase/drives";
import { mapFirebaseError } from "@/firebase/errors";
import { subscribeUsersByIds } from "@/firebase/instructorData";
import {
  addCalendarDaysToDateKey,
  scheduleDateKeyFromUtcMs,
  scheduleMondayDateKeyForWeekContaining,
  weekDateKeysFromMondayDateKey,
} from "@/lib/scheduleTimezone";
import { isValidRuMobilePhone, normalizeRuPhone } from "@/lib/phoneRu";
import { AlertDialog } from "@/components/ConfirmDialog";
import { DriveLessonRatingModal } from "@/components/DriveLessonRatingModal";
import {
  DriveFinishedDayTable,
  groupFinishedDriveSlotsByDateKey,
} from "@/components/DriveFinishedDayTable";
import { DriveLiveSessionPanel } from "@/components/DriveLiveSessionPanel";
import { DriveLiveSteeringDecor } from "@/components/DriveLiveSteeringDecor";
import { DriveWeekScheduleNoticeCard } from "@/components/DriveWeekScheduleNoticeCard";
import { InstructorStudentLocationShareButton } from "@/components/DriveStudentLocationShare";
import { DriveSlotShareAddressRow } from "@/components/DriveSlotShareAddressRow";
import {
  canShowInstructorRunningLateButton,
  canShowInstructorStartDriveButton,
  earlyStartMinutesRounded,
  isDriveStartBeforeScheduledTime,
  shouldHideWeekScheduleGeoShareButtons,
} from "@/lib/driveSession";
import { useDriveImminentWeekAlert } from "@/hooks/useDriveImminentWeekAlert";
import { useAuth } from "@/context/AuthContext";
import { useDriveLocationSharingUi } from "@/context/DriveLocationSharingUiContext";
import { useChatNav } from "@/context/ChatNavContext";
import type { AccountStatus, DriveSlot, TrainingGroup, UserProfile } from "@/types";
import { isPresenceEffectivelyOnline } from "@/utils/presence";

const statusLabel: Record<AccountStatus, string> = {
  pending: "Ожидает",
  active: "Активен",
  inactive: "Деактивирован",
  rejected: "Удалён",
};

const WEEKDAY_LABELS = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];

function telHrefFromPhone(phone: string): string | undefined {
  const n = normalizeRuPhone(phone);
  return n && isValidRuMobilePhone(n) ? `tel:${n}` : undefined;
}

function formatRuDate(ms: number): string {
  return dateKeyToRuDisplay(scheduleDateKeyFromUtcMs(ms));
}

function IconRole() {
  return (
    <svg className="instr-meta-ico" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
      />
    </svg>
  );
}

function IconStatusIco() {
  return (
    <svg className="instr-meta-ico" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
      />
    </svg>
  );
}

function IconTalons() {
  return (
    <svg className="instructor-ico instructor-ico-line" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
      />
    </svg>
  );
}

function IconCar({ className }: { className?: string }) {
  return (
    <svg
      className={`instructor-ico instructor-ico-line${className ? ` ${className}` : ""}`}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"
      />
    </svg>
  );
}

function IconDrives() {
  return (
    <svg className="instructor-ico instructor-ico-line" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"
      />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg className="instructor-ico instructor-ico-line" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
      />
    </svg>
  );
}

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
      />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`instr-chevron${open ? " is-open" : ""}`}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path fill="currentColor" d="M7 10l5 5 5-5z" />
    </svg>
  );
}

function IconWeekChevronLeft() {
  return (
    <svg className="instructor-home-week-nav-ico" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
    </svg>
  );
}

function IconWeekChevronRight() {
  return (
    <svg className="instructor-home-week-nav-ico" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg className="instructor-ico instructor-ico-line" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7v-5z"
      />
    </svg>
  );
}

/** Иконка блока «Мои курсанты» — группа людей */
function IconMyCadets() {
  return (
    <svg className="instructor-ico instructor-ico-line" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
      />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  );
}

function IconRunningLate() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"
      />
    </svg>
  );
}

function IconCheckCircle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
      />
    </svg>
  );
}

function IconCloseModal() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
      />
    </svg>
  );
}

function InstructorSelfCard({ profile }: { profile: UserProfile }) {
  const hue = avatarHueFromUid(profile.uid);
  const initials = initialsFromFullName(profile.displayName);
  const presenceOnline = isPresenceEffectivelyOnline(profile.presence);
  const zeroTalons = profile.talons === 0;

  return (
    <div className="instructor-card instructor-card--student instructor-home-self-card">
      <div className="instructor-preview-bar">
        <div className="instructor-card-preview instructor-card-preview--tint glossy-panel instructor-home-self-preview">
          <div className="instructor-home-self-main">
            <span className="instructor-avatar-wrap">
              <span
                className={
                  profile.avatarDataUrl
                    ? "instructor-avatar instructor-avatar--photo"
                    : "instructor-avatar"
                }
                style={
                  profile.avatarDataUrl ? undefined : { background: `hsl(${hue} 42% 40%)` }
                }
              >
                {profile.avatarDataUrl ? (
                  <img src={profile.avatarDataUrl} alt="" className="instructor-avatar-img" />
                ) : (
                  initials
                )}
              </span>
              <span
                className={
                  presenceOnline
                    ? "chat-contact-status-dot chat-contact-status-dot--online"
                    : "chat-contact-status-dot chat-contact-status-dot--offline"
                }
                aria-hidden
              />
            </span>
            <span className="instructor-preview-text">
              <span className="instructor-preview-name">
                {formatShortFio(profile.displayName)}
              </span>
              <span className="instructor-preview-role-row">
                <IconRole />
                <span>Роль: Инструктор</span>
              </span>
              <span className="instructor-preview-status-row">
                <IconStatusIco />
                <span>Статус:</span>
                <span
                  className={`instructor-status instructor-status--${profile.accountStatus}`}
                >
                  {statusLabel[profile.accountStatus]}
                </span>
              </span>
              <span className="instructor-preview-status-row">
                <IconCar className="instructor-ico--purple" />
                <span>Учебное ТС:</span>
                <span>{profile.vehicleLabel?.trim() || "—"}</span>
              </span>
            </span>
          </div>
          <div
            className="instructor-home-self-talons-col"
            aria-label={`Баланс талонов: ${profile.talons}`}
          >
            <span className="instructor-home-self-talons-label">
              <IconTalons />
              <span>Баланс талонов</span>
            </span>
            <span
              className={
                zeroTalons
                  ? "instructor-home-self-talons-circle is-zero"
                  : "instructor-home-self-talons-circle is-positive"
              }
            >
              {profile.talons}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CadetRowCard({ student }: { student: UserProfile }) {
  const chatNav = useChatNav();
  const hue = avatarHueFromUid(student.uid);
  const initials = initialsFromFullName(student.displayName);
  const presenceOnline = isPresenceEffectivelyOnline(student.presence);
  const telHref = telHrefFromPhone(student.phone);

  return (
    <li className="instructor-card-outer">
      <div className="instructor-card instructor-card--student">
        <div className="instructor-preview-bar">
          <div className="instructor-card-preview instructor-card-preview--student glossy-panel instructor-home-cadet-preview">
            <span className="instructor-avatar-wrap">
              <span
                className={
                  student.avatarDataUrl
                    ? "instructor-avatar instructor-avatar--photo"
                    : "instructor-avatar"
                }
                style={
                  student.avatarDataUrl ? undefined : { background: `hsl(${hue} 42% 40%)` }
                }
              >
                {student.avatarDataUrl ? (
                  <img src={student.avatarDataUrl} alt="" className="instructor-avatar-img" />
                ) : (
                  initials
                )}
              </span>
              <span
                className={
                  presenceOnline
                    ? "chat-contact-status-dot chat-contact-status-dot--online"
                    : "chat-contact-status-dot chat-contact-status-dot--offline"
                }
                aria-hidden
              />
            </span>
            <span className="instructor-preview-text">
              <span className="instructor-preview-name instructor-home-cadet-fio">
                {student.displayName.trim() || "—"}
              </span>
              <span className="instructor-preview-status-row">
                <IconTalons />
                <span>Талоны: {student.talons}</span>
              </span>
              <span className="instructor-preview-status-row">
                <IconDrives />
                <span>Вождений: {student.drivesCount}</span>
              </span>
            </span>
          </div>
          <div
            className="instructor-preview-actions"
            role="presentation"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {telHref ? (
              <a
                href={telHref}
                className="instr-side-btn instr-side-call glossy-btn"
                aria-label="Позвонить"
              >
                <IconPhone />
              </a>
            ) : (
              <span
                className="instr-side-btn instr-side-call instr-side-btn--disabled"
                aria-hidden
              >
                <IconPhone />
              </span>
            )}
            {chatNav ? (
              <button
                type="button"
                className="instr-side-btn instr-side-chat glossy-btn"
                aria-label="Чат"
                onClick={() => chatNav.openChatWithUser(student.uid)}
              >
                <IconChat />
              </button>
            ) : (
              <span
                className="instr-side-btn instr-side-chat instr-side-btn--disabled"
                aria-hidden
              >
                <IconChat />
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export function InstructorHomeTab() {
  const { profile, user, refreshProfile } = useAuth();
  const driveLocUi = useDriveLocationSharingUi();
  const showInstructorDriveLocationShare =
    driveLocUi.ready && driveLocUi.instructorsEnabled;
  /** Документ в Firestore всегда по uid из Auth — совпадает с users/{uid} после прикрепления админом. */
  const instructorUid = user?.uid ?? profile?.uid ?? "";

  const [attachedStudents, setAttachedStudents] = useState<UserProfile[]>([]);
  const [groups, setGroups] = useState<TrainingGroup[]>([]);
  const [slots, setSlots] = useState<DriveSlot[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [weekCancelBusyId, setWeekCancelBusyId] = useState<string | null>(null);
  const [weekScheduleErr, setWeekScheduleErr] = useState<string | null>(null);
  const [cadetsOpen, setCadetsOpen] = useState(true);
  const [weekScheduleOpen, setWeekScheduleOpen] = useState(true);
  /** 0 — текущая календарная неделя; −1 — прошлая; +1 — следующая */
  const [weekScheduleOffset, setWeekScheduleOffset] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [earlyConfirmSlot, setEarlyConfirmSlot] = useState<DriveSlot | null>(null);
  const [startLiveBusyId, setStartLiveBusyId] = useState<string | null>(null);
  const [lateModalSlot, setLateModalSlot] = useState<DriveSlot | null>(null);
  const [lateSelectedMin, setLateSelectedMin] = useState<5 | 10 | 15 | null>(null);
  const [lateShiftBusyId, setLateShiftBusyId] = useState<string | null>(null);
  const [postDriveFlow, setPostDriveFlow] = useState<
    null | { slotId: string; step: "done" | "rate" }
  >(null);
  const [postDriveRatingBusy, setPostDriveRatingBusy] = useState(false);
  const [postDriveRatingErr, setPostDriveRatingErr] = useState<string | null>(null);

  const prevSlotLiveSnapshotRef = useRef<
    Map<string, Pick<DriveSlot, "status" | "liveStudentAckAt" | "liveStartedAt">>
  >(new Map());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const prev = prevSlotLiveSnapshotRef.current;
    for (const sl of slots) {
      const was = prev.get(sl.id);
      if (
        was &&
        was.status !== "completed" &&
        sl.status === "completed" &&
        was.liveStudentAckAt != null &&
        was.liveStartedAt != null
      ) {
        setPostDriveFlow({ slotId: sl.id, step: "done" });
        break;
      }
    }
    const next = new Map<
      string,
      Pick<DriveSlot, "status" | "liveStudentAckAt" | "liveStartedAt">
    >();
    for (const sl of slots) {
      next.set(sl.id, {
        status: sl.status,
        liveStudentAckAt: sl.liveStudentAckAt,
        liveStartedAt: sl.liveStartedAt,
      });
    }
    prevSlotLiveSnapshotRef.current = next;
  }, [slots]);

  /** Один источник правды — onSnapshot на users/{uid} в AuthContext (без второго слушателя на тот же документ). */
  const attachedIds = useMemo(
    () => [...new Set(profile?.attachedStudentIds ?? [])],
    [profile?.attachedStudentIds]
  );

  const attachedIdsKey = useMemo(
    () => [...attachedIds].sort().join(","),
    [attachedIds]
  );

  /** После действий админа локальный кэш иногда отстаёт — подтягиваем профиль с сервера при входе на вкладку и при возврате в окно. */
  useEffect(() => {
    if (profile?.role !== "instructor") return;
    void refreshProfile();
    const onVis = () => {
      if (document.visibilityState === "visible") void refreshProfile();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [profile?.role, refreshProfile]);

  useEffect(() => {
    if (!instructorUid) {
      setAttachedStudents([]);
      return;
    }
    return subscribeUsersByIds(attachedIds, setAttachedStudents);
  }, [instructorUid, attachedIdsKey]);

  useEffect(() => {
    return subscribeTrainingGroups(setGroups, (e) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!instructorUid) {
      setSlots([]);
      return;
    }
    return subscribeDriveSlotsForInstructor(
      instructorUid,
      setSlots,
      (e) => setErr(e.message)
    );
  }, [instructorUid]);

  const studentMap = useMemo(() => {
    const m = new Map<string, UserProfile>();
    for (const s of attachedStudents) m.set(s.uid, s);
    return m;
  }, [attachedStudents]);

  const groupIdSet = useMemo(() => new Set(groups.map((g) => g.id)), [groups]);

  /** Курсанты без группы или с groupId, которого нет в справочнике групп. */
  const ungroupedStudents = useMemo(
    () =>
      attachedStudents.filter((s) => {
        const gid = (s.groupId ?? "").trim();
        return !gid || !groupIdSet.has(gid);
      }),
    [attachedStudents, groupIdSet]
  );

  const groupsWithMyCadets = useMemo(() => {
    const list = groups
      .map((g) => ({
        group: g,
        members: attachedStudents.filter((s) => s.groupId === g.id),
      }))
      .filter((x) => x.members.length > 0)
      .sort((a, b) =>
        a.group.name.localeCompare(b.group.name, "ru", { sensitivity: "base" })
      );
    return list;
  }, [groups, attachedStudents]);

  const slotsByDateKey = useMemo(() => {
    const m = new Map<string, DriveSlot[]>();
    for (const s of slots) {
      if (s.status !== "scheduled" || !s.dateKey) continue;
      const list = m.get(s.dateKey) ?? [];
      list.push(s);
      m.set(s.dateKey, list);
    }
    for (const [, list] of m) {
      list.sort(sortSlotsByTime);
    }
    return m;
  }, [slots]);

  const finishedSlotsByDateKey = useMemo(
    () => groupFinishedDriveSlotsByDateKey(slots),
    [slots]
  );

  const scheduleWeekMondayDateKey = useMemo(() => {
    const base = scheduleMondayDateKeyForWeekContaining(nowMs);
    return addCalendarDaysToDateKey(base, weekScheduleOffset * 7);
  }, [nowMs, weekScheduleOffset]);

  const weekKeys = useMemo(
    () => weekDateKeysFromMondayDateKey(scheduleWeekMondayDateKey),
    [scheduleWeekMondayDateKey]
  );

  const scheduleWeekRangeLabel = useMemo(() => {
    if (weekKeys.length < 7) return "";
    return `${dateKeyToRuDisplay(weekKeys[0])} — ${dateKeyToRuDisplay(weekKeys[6])}`;
  }, [weekKeys]);

  const weekSlotCount = useMemo(() => {
    let n = 0;
    for (const dateKey of weekKeys) {
      n += slotsByDateKey.get(dateKey)?.length ?? 0;
    }
    return n;
  }, [slotsByDateKey, weekKeys]);

  const weekScheduledSlotsForImminent = useMemo(() => {
    const out: DriveSlot[] = [];
    for (const dk of weekKeys) {
      for (const sl of slotsByDateKey.get(dk) ?? []) {
        if (sl.status === "scheduled" && sl.liveStartedAt == null) {
          out.push(sl);
        }
      }
    }
    return out;
  }, [weekKeys, slotsByDateKey]);

  const driveImminent = useDriveImminentWeekAlert({
    weekScheduledSlots: weekScheduledSlotsForImminent,
    nowMs,
    viewerUid: instructorUid || undefined,
    enabled: true,
    onImminentSlot: () => setWeekScheduleOpen(true),
  });

  async function cancelWeekDriveSlot(slotId: string) {
    setWeekCancelBusyId(slotId);
    setWeekScheduleErr(null);
    try {
      await instructorDeleteDriveSlot(slotId);
    } catch (e: unknown) {
      setWeekScheduleErr(mapFirebaseError(e));
    } finally {
      setWeekCancelBusyId(null);
    }
  }

  const completeLiveSession = useCallback(async (slotId: string) => {
    setWeekScheduleErr(null);
    try {
      await instructorCompleteDriveLiveSession(slotId);
    } catch (e: unknown) {
      setWeekScheduleErr(mapFirebaseError(e));
    }
  }, []);

  async function startLiveSession(slot: DriveSlot) {
    setStartLiveBusyId(slot.id);
    setWeekScheduleErr(null);
    try {
      await instructorStartDriveLiveSession(slot.id);
    } catch (e: unknown) {
      setWeekScheduleErr(mapFirebaseError(e));
    } finally {
      setStartLiveBusyId(null);
      setEarlyConfirmSlot(null);
    }
  }

  function onInstructorPressPlay(sl: DriveSlot) {
    if (isDriveStartBeforeScheduledTime(sl, nowMs)) {
      setEarlyConfirmSlot(sl);
      return;
    }
    void startLiveSession(sl);
  }

  async function submitRunningLate() {
    if (!lateModalSlot || lateSelectedMin == null) return;
    setLateShiftBusyId(lateModalSlot.id);
    setWeekScheduleErr(null);
    try {
      await instructorApplyRunningLateShift(lateModalSlot.id, lateSelectedMin);
      setWeekScheduleErr(null);
      setLateModalSlot(null);
      setLateSelectedMin(null);
    } catch (e: unknown) {
      setWeekScheduleErr(mapFirebaseError(e));
    } finally {
      setLateShiftBusyId(null);
    }
  }

  if (!profile) return null;

  return (
    <div className="admin-tab instructor-home-tab">
      <h1 className="admin-tab-title">Главная</h1>

      {err ? (
        <div className="form-error" role="alert">
          {err}
          {/permission|доступ/i.test(err) ? (
            <span className="admin-schedule-permission-hint">
              {" "}
              Опубликуйте актуальные правила из файла{" "}
              <code className="admin-inline-code">firestore.rules</code> в консоли Firebase или
              выполните:{" "}
              <code className="admin-inline-code">firebase deploy --only firestore:rules</code>
            </span>
          ) : null}
        </div>
      ) : null}

      <section className="instructor-home-section" aria-labelledby="instr-self-heading">
        <h2 id="instr-self-heading" className="instructor-subtitle">
          Инструктор
        </h2>
        <InstructorSelfCard profile={profile} />
      </section>

      <section className="instructor-home-section" aria-labelledby="my-cadets-heading">
        <button
          type="button"
          id="my-cadets-heading"
          className="instructor-home-section-toggle glossy-panel"
          aria-expanded={cadetsOpen}
          onClick={() => setCadetsOpen((o) => !o)}
        >
          <span className="instructor-home-section-toggle-label">
            <span className="instructor-home-toggle-label-row">
              <IconMyCadets />
              <span>Мои курсанты</span>
            </span>
          </span>
          <span className="instructor-home-section-toggle-meta">
            {attachedIds.length > 0 ? attachedIds.length : attachedStudents.length}
          </span>
          <IconChevron open={cadetsOpen} />
        </button>
        {cadetsOpen ? (
          attachedStudents.length === 0 && attachedIds.length > 0 && !err ? (
            <p className="admin-empty instructor-home-empty" role="status">
              Загрузка списка курсантов…
            </p>
          ) : attachedStudents.length === 0 ? (
            <p className="admin-empty instructor-home-empty">
              Нет закреплённых курсантов. Администратор назначит их в разделе инструкторов.
            </p>
          ) : (
            <div className="instructor-home-cadets-body">
              {ungroupedStudents.length > 0 ? (
                <div className="instructor-home-nested-section">
                  <h3 className="instructor-home-nested-title" id="ungrouped-subheading">
                    Без группы
                  </h3>
                  <ul className="instructor-card-list instructor-home-cadet-list">
                    {ungroupedStudents.map((s) => (
                      <CadetRowCard key={s.uid} student={s} />
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="instructor-home-nested-section">
                <h3 className="instructor-home-nested-title" id="groups-subheading">
                  Группы
                </h3>
                {groupsWithMyCadets.length === 0 ? (
                  <p className="admin-empty instructor-home-empty">
                    Среди ваших курсантов никто не состоит в учебной группе.
                  </p>
                ) : (
                  <ul className="instructor-home-group-list">
                    {groupsWithMyCadets.map(({ group: g, members }) => {
                      const periodText =
                        g.hasTrainingPeriod &&
                        g.trainingStartMs != null &&
                        g.trainingEndMs != null
                          ? `${formatRuDate(g.trainingStartMs)} — ${formatRuDate(g.trainingEndMs)}`
                          : "Без срока";
                      return (
                        <li key={g.id} className="instructor-home-group-block glossy-panel">
                          <div className="instructor-home-group-head">
                            <strong className="instructor-home-group-name">{g.name}</strong>
                            <span className="instructor-home-group-period">{periodText}</span>
                          </div>
                          <ul className="instructor-card-list instructor-home-group-members">
                            {members.map((s) => (
                              <CadetRowCard key={s.uid} student={s} />
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )
        ) : null}
      </section>

      <section className="instructor-home-section" aria-labelledby="week-schedule-heading">
        <div className="instructor-home-week-toolbar">
          <button
            type="button"
            className="instructor-home-week-nav-btn glossy-panel"
            aria-label="Предыдущая неделя"
            onClick={() => setWeekScheduleOffset((o) => o - 1)}
          >
            <IconWeekChevronLeft />
          </button>
          <button
            type="button"
            id="week-schedule-heading"
            className="instructor-home-section-toggle glossy-panel"
            aria-expanded={weekScheduleOpen}
            onClick={() => setWeekScheduleOpen((o) => !o)}
          >
            <span className="instructor-home-section-toggle-label">
              <span className="instructor-home-toggle-label-row">
                <IconCalendar />
                <span>Мой график</span>
              </span>
            </span>
            <span className="instructor-home-section-toggle-meta">{weekSlotCount}</span>
            <IconChevron open={weekScheduleOpen} />
          </button>
          <button
            type="button"
            className="instructor-home-week-nav-btn glossy-panel"
            aria-label="Следующая неделя"
            onClick={() => setWeekScheduleOffset((o) => o + 1)}
          >
            <IconWeekChevronRight />
          </button>
        </div>
        {weekScheduleOpen ? (
          <>
            <p className="field-hint instructor-home-week-hint">
              {weekScheduleOffset === 0 ? (
                <>
                  <span className="instructor-week-schedule-hint-em">Текущая неделя</span> (пн–вс):
                  подтверждённые вождения с курсантами.
                </>
              ) : (
                <>
                  <span className="instructor-week-schedule-hint-em">
                    Неделя {scheduleWeekRangeLabel}
                  </span>
                  : подтверждённые вождения с курсантами.
                </>
              )}
            </p>
            {weekScheduleErr ? (
              <div className="form-error instructor-week-schedule-err" role="alert">
                {weekScheduleErr}
              </div>
            ) : null}
            <ul className="instructor-home-week-list">
          {weekKeys.map((dateKey, i) => {
            const daySlots = slotsByDateKey.get(dateKey) ?? [];
            const finishedForDay = finishedSlotsByDateKey.get(dateKey) ?? [];
            const label = WEEKDAY_LABELS[i];
            return (
              <li key={dateKey} className="instructor-home-week-day glossy-panel">
                <h3 className="instructor-home-week-day-title">
                  {label}{" "}
                  <span className="instructor-home-week-date">
                    ({dateKeyToRuDisplay(dateKey)})
                  </span>
                </h3>
                {daySlots.length > 0 ? (
                  <ul className="instructor-home-slot-list drive-week-schedule-notice-slot-list">
                    {daySlots.map((sl) => {
                      const st = studentMap.get(sl.studentId);
                      const shortName =
                        formatShortFio(st?.displayName?.trim() ? st.displayName : "") || "Курсант";
                      const live = sl.liveStartedAt != null;
                      const liveAcked = sl.liveStudentAckAt != null;
                      const livePaused =
                        liveAcked &&
                        sl.livePausedAt != null &&
                        sl.livePausedAt >= (sl.liveStudentAckAt ?? 0);
                      if (live) {
                        return (
                          <DriveWeekScheduleNoticeCard
                            key={sl.id}
                            slot={sl}
                            personRowLabel="Курсант"
                            personShortName={shortName}
                            statusValue={
                              <span className="drive-instructor-live-status">
                                {!liveAcked
                                  ? "ожидает подтверждения…"
                                  : livePaused
                                    ? "на паузе…"
                                    : "в процессе"}
                              </span>
                            }
                            belowStatusRow={<DriveSlotShareAddressRow slotId={sl.id} />}
                            customSideActions={
                              <>
                                {liveAcked && !livePaused ? <DriveLiveSteeringDecor /> : null}
                              </>
                            }
                            belowCard={
                              sl.liveStartedAt != null ? (
                                <DriveLiveSessionPanel
                                  slot={sl}
                                  onCompleteLive={() => completeLiveSession(sl.id)}
                                  onActionError={(msg) => setWeekScheduleErr(msg)}
                                />
                              ) : null
                            }
                          />
                        );
                      }
                      const canStart = canShowInstructorStartDriveButton(sl, nowMs);
                      const canRunningLate = canShowInstructorRunningLateButton(sl, nowMs);
                      const hideWeekGeo = shouldHideWeekScheduleGeoShareButtons(sl);
                      return (
                        <DriveWeekScheduleNoticeCard
                          key={sl.id}
                          slot={sl}
                          personRowLabel="Курсант"
                          personShortName={shortName}
                          listItemRef={driveImminent.getListItemRef(sl.id)}
                          imminentAttention={driveImminent.isImminent(sl)}
                          statusValue={
                            sl.instructorLateShiftMin != null && sl.instructorLateShiftMin > 0 ? (
                              <span className="drive-instructor-late-shift-status">
                                начало сдвинуто на {sl.instructorLateShiftMin} мин.
                              </span>
                            ) : (
                              <span className="drive-scheduled-status-confirmed">подтверждено</span>
                            )
                          }
                          belowStatusRow={
                            hideWeekGeo ? null : <DriveSlotShareAddressRow slotId={sl.id} />
                          }
                          cancelBusy={weekCancelBusyId === sl.id}
                          cancelAriaLabel="Отменить вождение"
                          onCancel={() => void cancelWeekDriveSlot(sl.id)}
                          customSideActions={
                            <>
                              {canStart ? (
                                <button
                                  type="button"
                                  className="instr-side-btn glossy-btn instructor-drive-start-btn"
                                  disabled={startLiveBusyId === sl.id}
                                  onClick={() => onInstructorPressPlay(sl)}
                                  aria-label="Начать вождение"
                                  title="Начать вождение"
                                >
                                  <IconPlay />
                                </button>
                              ) : null}
                              {canRunningLate ? (
                                <button
                                  type="button"
                                  className="instr-side-btn glossy-btn instructor-running-late-btn"
                                  disabled={
                                    lateShiftBusyId === sl.id ||
                                    startLiveBusyId === sl.id ||
                                    weekCancelBusyId === sl.id
                                  }
                                onClick={() => {
                                  setWeekScheduleErr(null);
                                  setLateModalSlot(sl);
                                  setLateSelectedMin(null);
                                }}
                                  aria-label="Опаздываю"
                                  title="Опаздываю"
                                >
                                  <IconRunningLate />
                                </button>
                              ) : null}
                              {showInstructorDriveLocationShare && !hideWeekGeo ? (
                                <InstructorStudentLocationShareButton slotId={sl.id} />
                              ) : null}
                              <button
                                type="button"
                                className="instr-side-btn glossy-btn student-pending-decline-btn"
                                onClick={() => void cancelWeekDriveSlot(sl.id)}
                                disabled={weekCancelBusyId === sl.id}
                                aria-label="Отменить вождение"
                                title="Отменить"
                              >
                                <svg viewBox="0 0 24 24" aria-hidden>
                                  <path
                                    fill="currentColor"
                                    d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                                  />
                                </svg>
                              </button>
                            </>
                          }
                        />
                      );
                    })}
                  </ul>
                ) : finishedForDay.length === 0 ? (
                  <p className="admin-empty instructor-home-week-empty">Нет записей.</p>
                ) : null}
                <DriveFinishedDayTable
                  slots={finishedForDay}
                  variant="instructor"
                  cadetShortName={(sl) => {
                    const st = studentMap.get(sl.studentId);
                    const raw =
                      (st?.displayName?.trim() ? st.displayName : "") ||
                      (sl.studentDisplayName?.trim() ? sl.studentDisplayName : "");
                    return formatShortFio(raw) || "—";
                  }}
                />
              </li>
            );
          })}
            </ul>
          </>
        ) : null}
      </section>

      {lateModalSlot ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            if (!lateShiftBusyId) {
              setWeekScheduleErr(null);
              setLateModalSlot(null);
              setLateSelectedMin(null);
            }
          }}
        >
          <div
            className="modal-panel instructor-running-late-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="instructor-late-title"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="instructor-late-title" className="modal-title">
              Опаздываю
            </h2>
            {weekScheduleErr ? (
              <div
                className="form-error instructor-running-late-modal-err"
                role="alert"
              >
                {weekScheduleErr}
              </div>
            ) : null}
            <div className="instructor-running-late-select-wrap">
              <label
                className="instructor-running-late-select-label"
                htmlFor="instructor-late-min-select"
              >
                Сдвинуть начало вождения на
              </label>
              <select
                id="instructor-late-min-select"
                className="instructor-running-late-select"
                value={lateSelectedMin == null ? "" : String(lateSelectedMin)}
                disabled={!!lateShiftBusyId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") setLateSelectedMin(null);
                  else {
                    const n = parseInt(v, 10);
                    if (n === 5 || n === 10 || n === 15) setLateSelectedMin(n);
                  }
                }}
              >
                <option value="">Выберите…</option>
                <option value="5">5 мин.</option>
                <option value="10">10 мин.</option>
                <option value="15">15 мин.</option>
              </select>
            </div>
            <div className="modal-actions instructor-running-late-modal-actions">
              <button
                type="button"
                className="btn btn-ghost instructor-running-late-icon-btn"
                disabled={!!lateShiftBusyId}
                aria-label="Отмена"
                title="Отмена"
                onClick={() => {
                  setWeekScheduleErr(null);
                  setLateModalSlot(null);
                  setLateSelectedMin(null);
                }}
              >
                <IconCloseModal />
              </button>
              <button
                type="button"
                className="btn btn-primary instructor-running-late-icon-btn instructor-running-late-confirm-icon-btn"
                disabled={lateSelectedMin == null || !!lateShiftBusyId}
                aria-label="Подтверждаю"
                title="Подтверждаю"
                onClick={() => void submitRunningLate()}
              >
                <IconCheckCircle />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {earlyConfirmSlot ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setEarlyConfirmSlot(null)}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="early-drive-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="early-drive-title" className="modal-title">
              Начать вождение раньше времени?
            </h2>
            <p className="field-hint">
              Вы уверены начать вождение раньше на{" "}
              {earlyStartMinutesRounded(earlyConfirmSlot, nowMs)} мин?
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEarlyConfirmSlot(null)}
              >
                Нет
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={startLiveBusyId === earlyConfirmSlot.id}
                onClick={() => void startLiveSession(earlyConfirmSlot)}
              >
                Да
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AlertDialog
        open={postDriveFlow?.step === "done"}
        message="Вождение завершено!"
        onClose={() =>
          setPostDriveFlow((f) => (f?.step === "done" ? { slotId: f.slotId, step: "rate" } : f))
        }
      />
      <DriveLessonRatingModal
        open={postDriveFlow?.step === "rate"}
        variant="instructor"
        busy={postDriveRatingBusy}
        error={postDriveRatingErr}
        onClose={() => {
          setPostDriveFlow(null);
          setPostDriveRatingErr(null);
        }}
        onSubmit={async (value) => {
          const sid = postDriveFlow?.step === "rate" ? postDriveFlow.slotId : null;
          if (!sid) return;
          const g = value as 3 | 4 | 5;
          if (g !== 3 && g !== 4 && g !== 5) return;
          setPostDriveRatingErr(null);
          setPostDriveRatingBusy(true);
          try {
            await submitInstructorRatingStudent(sid, g);
            setPostDriveFlow(null);
          } catch (e: unknown) {
            setPostDriveRatingErr(e instanceof Error ? e.message : "Не удалось сохранить оценку");
          } finally {
            setPostDriveRatingBusy(false);
          }
        }}
      />
    </div>
  );
}
