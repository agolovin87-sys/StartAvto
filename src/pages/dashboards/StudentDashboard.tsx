import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { initialsFromFullName, avatarHueFromUid } from "@/admin/instructorAvatar";
import { formatShortFio } from "@/admin/formatShortFio";
import {
  dateKeyToRuDisplay,
  localDateKey,
  sortSlotsByTime,
  weekdayRuFromDateKey,
} from "@/admin/scheduleFormat";
import { useChatUnread } from "@/context/ChatUnreadContext";
import { useAuth } from "@/context/AuthContext";
import { ChatNavContext } from "@/context/ChatNavContext";
import { useChatThreadShell } from "@/context/ChatThreadShellContext";
import {
  studentReserveFreeDriveWindow,
  studentCancelFreeDriveWindowReservation,
  studentAckDriveLiveSession,
  studentCancelDriveSlot,
  studentCancelScheduledDriveSlot,
  studentConfirmDriveSlot,
  subscribeFreeDriveWindowsForStudent,
  subscribeDriveSlotsForStudent,
} from "@/firebase/drives";
import { mapFirebaseError } from "@/firebase/errors";
import { subscribeStudentAttachedInstructors } from "@/firebase/studentChatContacts";
import { canStudentCancelScheduledDriveSlot } from "@/lib/driveSession";
import { DRIVE_TIME_OCCUPIED_MSG } from "@/lib/driveTimeConflict";
import {
  countStudentCommittedBookings,
  evaluateStudentTalonBooking,
  STUDENT_TALON_MSG_INSUFFICIENT,
  STUDENT_TALON_MSG_ZERO,
  type TalonBookingBlockReason,
} from "@/lib/talonBooking";
import { isValidRuMobilePhone, normalizeRuPhone } from "@/lib/phoneRu";
import { AdminChatTab } from "@/pages/dashboards/admin/AdminChatTab";
import { AdminSettingsTab } from "@/pages/dashboards/admin/AdminSettingsTab";
import { StudentHistoryTab } from "@/pages/dashboards/student/StudentHistoryTab";
import { StudentTicketsTab } from "@/pages/dashboards/student/StudentTicketsTab";
import type { AccountStatus, DriveSlot, FreeDriveWindow, UserProfile } from "@/types";
import { isPresenceEffectivelyOnline } from "@/utils/presence";
import {
  IconPendingDate,
  IconPendingPerson,
  IconPendingStatus,
} from "@/components/DrivePendingRowIcons";
import { AlertDialog } from "@/components/ConfirmDialog";
import { DriveLiveStudentTimerDecor } from "@/components/DriveLiveStudentTimerDecor";
import {
  DriveFinishedDayTable,
  groupFinishedDriveSlotsByDateKey,
} from "@/components/DriveFinishedDayTable";
import { DriveWeekScheduleNoticeCard } from "@/components/DriveWeekScheduleNoticeCard";
import { useDashboardTabHistory } from "@/hooks/useDashboardTabHistory";
import { playDriveAlertSound } from "@/audio/playDriveAlertSound";
import {
  loadSeenDriveKeys,
  relevantDriveNotificationKeys,
  saveSeenDriveKeys,
} from "@/lib/studentHomeDriveNotifications";

type StudentNavTab = "home" | "chat" | "tickets" | "history" | "settings";

const STUDENT_DASH_TABS = [
  "home",
  "chat",
  "tickets",
  "history",
  "settings",
] as const satisfies readonly StudentNavTab[];

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

function mondayOfWeekContaining(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = c.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  c.setDate(c.getDate() + diff);
  return c;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function weekDateKeys(monday: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => localDateKey(addDays(monday, i)));
}

function telHrefFromPhone(phone: string): string | undefined {
  const n = normalizeRuPhone(phone);
  return n && isValidRuMobilePhone(n) ? `tel:${n}` : undefined;
}

function IconHome({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8h5z"
      />
    </svg>
  );
}

function IconChatNav({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"
      />
    </svg>
  );
}

function IconTicketsNav({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
      />
    </svg>
  );
}

function IconHistory({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"
      />
    </svg>
  );
}

function IconSettings({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.63-.07.94s.02.64.07.94l-2.03 1.58c-.2.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"
      />
    </svg>
  );
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
      width={18}
      height={18}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"
      />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg
      className="instructor-ico instructor-ico-line"
      viewBox="0 0 24 24"
      width={18}
      height={18}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
      />
    </svg>
  );
}

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden>
      <path
        fill="currentColor"
        d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
      />
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

function IconNotificationBell() {
  return (
    <svg className="student-pending-drives-notify-ico" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"
      />
    </svg>
  );
}

function IconConfirmDrive() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
      />
    </svg>
  );
}

function IconDeleteBooking() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  );
}

function IconPlayFill() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  );
}

function StudentSelfCard({ profile }: { profile: UserProfile }) {
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
              <span className="instructor-preview-name">{formatShortFio(profile.displayName)}</span>
              <span className="instructor-preview-role-row">
                <IconRole />
                <span>Роль: Курсант</span>
              </span>
              <span className="instructor-preview-status-row">
                <IconStatusIco />
                <span>Статус:</span>
                <span className={`instructor-status instructor-status--${profile.accountStatus}`}>
                  {statusLabel[profile.accountStatus]}
                </span>
              </span>
              <span className="instructor-preview-status-row">
                <IconCar className="instructor-ico--purple" />
                <span>Вождений: {profile.drivesCount}</span>
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

function MyInstructorCard({
  instructor,
  onOpenChat,
}: {
  instructor: UserProfile | null;
  onOpenChat: (uid: string) => void;
}) {
  if (!instructor) {
    return <p className="admin-empty instructor-home-empty">Инструктор не прикреплен.</p>;
  }

  const hue = avatarHueFromUid(instructor.uid);
  const initials = initialsFromFullName(instructor.displayName);
  const presenceOnline = isPresenceEffectivelyOnline(instructor.presence);
  const telHref = telHrefFromPhone(instructor.phone);

  return (
    <div className="instructor-card instructor-card--student student-home-my-instructor">
      <div className="instructor-preview-bar">
        <div className="instructor-card-preview instructor-card-preview--student glossy-panel instructor-home-cadet-preview">
          <span className="instructor-avatar-wrap">
            <span
              className={
                instructor.avatarDataUrl
                  ? "instructor-avatar instructor-avatar--photo"
                  : "instructor-avatar"
              }
              style={
                instructor.avatarDataUrl ? undefined : { background: `hsl(${hue} 42% 40%)` }
              }
            >
              {instructor.avatarDataUrl ? (
                <img src={instructor.avatarDataUrl} alt="" className="instructor-avatar-img" />
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
              {instructor.displayName.trim() || "—"}
            </span>
            <span className="instructor-preview-status-row">
              <IconRole />
              <span>Роль: Инструктор</span>
            </span>
            <span className="instructor-preview-status-row">
              <IconCar className="instructor-ico--purple" />
              <span>Учебное ТС: {instructor.vehicleLabel?.trim() || "—"}</span>
            </span>
          </span>
        </div>
        <div className="instructor-preview-actions">
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
          <button
            type="button"
            className="instr-side-btn instr-side-chat glossy-btn"
            aria-label="Чат"
            onClick={() => onOpenChat(instructor.uid)}
          >
            <IconChat />
          </button>
        </div>
      </div>
    </div>
  );
}

function StudentPendingDriveCard({
  slot,
  instructorName,
  onConfirm,
  onCancel,
  busy,
}: {
  slot: DriveSlot;
  instructorName: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const day = weekdayRuFromDateKey(slot.dateKey);
  return (
    <li className="student-pending-drive-item">
      <div className="instructor-card instructor-card--student student-home-my-instructor">
        <div className="instructor-preview-bar">
          <div className="instructor-card-preview instructor-card-preview--student glossy-panel instructor-home-cadet-preview student-pending-drive-preview">
            <div className="student-pending-drive-main">
              <div className="drive-pending-notice-row">
                <IconPendingDate />
                <span className="drive-pending-notice-row-text">
                  <span className="drive-pending-notice-label">Дата:</span>{" "}
                  {day}, {dateKeyToRuDisplay(slot.dateKey)} · {slot.startTime || "—"}
                </span>
              </div>
              <div className="drive-pending-notice-row">
                <IconPendingPerson />
                <span className="drive-pending-notice-row-text">
                  <span className="drive-pending-notice-label">Инструктор:</span> {instructorName}
                </span>
              </div>
              <div className="drive-pending-notice-row">
                <IconPendingStatus />
                <span className="drive-pending-notice-row-text">
                  <span className="drive-pending-notice-label">Статус:</span>{" "}
                  <span className="drive-pending-status-value drive-pending-status-value--blink">
                    ожидает Вашего подтверждения
                  </span>
                </span>
              </div>
            </div>
          </div>
          <div className="instructor-preview-actions">
            <button
              type="button"
              className="instr-side-btn glossy-btn student-pending-confirm-btn"
              onClick={onConfirm}
              disabled={busy}
              aria-label="Подтвердить запись"
            >
              <IconConfirmDrive />
            </button>
            <button
              type="button"
              className="instr-side-btn glossy-btn student-pending-decline-btn"
              onClick={onCancel}
              disabled={busy}
              aria-label="Удалить запись"
              title="Удалить"
            >
              <IconDeleteBooking />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

const navItems: {
  id: StudentNavTab;
  label: string;
  Icon: typeof IconHome;
}[] = [
  { id: "home", label: "Главная", Icon: IconHome },
  { id: "chat", label: "Чат", Icon: IconChatNav },
  { id: "tickets", label: "Билеты", Icon: IconTicketsNav },
  { id: "history", label: "История", Icon: IconHistory },
  { id: "settings", label: "Настройки", Icon: IconSettings },
];

export function StudentDashboard() {
  const { profile, user } = useAuth();
  const [tab, setTab] = useState<StudentNavTab>("home");
  useDashboardTabHistory(tab, setTab, STUDENT_DASH_TABS);
  const [chatThreadOpen, setChatThreadOpen] = useState(false);
  const { setShellHeaderHidden } = useChatThreadShell();
  const { reportDashboardTab, totalUnread } = useChatUnread();
  const [myInstructors, setMyInstructors] = useState<UserProfile[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [slots, setSlots] = useState<DriveSlot[]>([]);
  const [freeWindows, setFreeWindows] = useState<FreeDriveWindow[]>([]);
  const [pendingDriveBusyId, setPendingDriveBusyId] = useState<string | null>(null);
  const [pendingDriveErr, setPendingDriveErr] = useState<string | null>(null);
  const [scheduleCancelBusyId, setScheduleCancelBusyId] = useState<string | null>(null);
  const [scheduleCancelErr, setScheduleCancelErr] = useState<string | null>(null);
  const [ackLiveBusyId, setAckLiveBusyId] = useState<string | null>(null);
  const [reserveWindowBusyId, setReserveWindowBusyId] = useState<string | null>(null);
  const [freeWindowsErr, setFreeWindowsErr] = useState<string | null>(null);
  const [driveTimeOccupiedOpen, setDriveTimeOccupiedOpen] = useState(false);
  const [driveLiveCompletedDialogOpen, setDriveLiveCompletedDialogOpen] = useState(false);
  const [studentTalonAlert, setStudentTalonAlert] = useState<TalonBookingBlockReason | null>(null);
  const [weekOpen, setWeekOpen] = useState(true);
  /** 0 — текущая календарная неделя; −1 — прошлая; +1 — следующая */
  const [weekScheduleOffset, setWeekScheduleOffset] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pendingOpenChatUserId, setPendingOpenChatUserId] = useState<string | null>(
    null
  );
  const [seenDriveNotifyKeys, setSeenDriveNotifyKeys] = useState<Set<string>>(() => new Set());
  const prevUnseenDriveKeysRef = useRef<Set<string>>(new Set());

  const prevSlotLiveSnapshotRef = useRef<
    Map<
      string,
      Pick<DriveSlot, "status" | "liveStudentAckAt" | "liveStartedAt">
    >
  >(new Map());

  const openChatWithUser = useCallback((uid: string) => {
    const t = uid?.trim();
    if (!t) return;
    setPendingOpenChatUserId(t);
    setTab("chat");
  }, []);

  const consumePendingChat = useCallback(() => setPendingOpenChatUserId(null), []);

  const chatNavValue = useMemo(
    () => ({ openChatWithUser }),
    [openChatWithUser]
  );

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
        setDriveLiveCompletedDialogOpen(true);
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

  useEffect(() => {
    if (tab !== "chat") {
      setChatThreadOpen(false);
      setShellHeaderHidden(false);
    }
  }, [tab, setShellHeaderHidden]);

  useEffect(() => {
    reportDashboardTab(tab === "chat" ? "chat" : "other");
  }, [tab, reportDashboardTab]);

  const studentUid = (user?.uid ?? profile?.uid ?? "").trim();

  useLayoutEffect(() => {
    if (!studentUid) {
      setSeenDriveNotifyKeys(new Set());
      return;
    }
    setSeenDriveNotifyKeys(loadSeenDriveKeys(studentUid));
  }, [studentUid]);

  useLayoutEffect(() => {
    if (tab !== "home" || !studentUid) return;
    const rel = relevantDriveNotificationKeys(slots, freeWindows, studentUid);
    if (rel.length === 0) return;
    setSeenDriveNotifyKeys((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const k of rel) {
        if (!next.has(k)) {
          next.add(k);
          changed = true;
        }
      }
      if (changed) saveSeenDriveKeys(studentUid, next);
      return changed ? next : prev;
    });
  }, [tab, studentUid, slots, freeWindows]);

  const homeDriveNotifCount = useMemo(() => {
    if (tab === "home" || !studentUid) return 0;
    const rel = relevantDriveNotificationKeys(slots, freeWindows, studentUid);
    return rel.filter((k) => !seenDriveNotifyKeys.has(k)).length;
  }, [tab, studentUid, slots, freeWindows, seenDriveNotifyKeys]);

  useEffect(() => {
    prevUnseenDriveKeysRef.current = new Set();
  }, [studentUid]);

  useEffect(() => {
    if (!studentUid) return;
    const rel = relevantDriveNotificationKeys(slots, freeWindows, studentUid);
    const unseen = new Set(rel.filter((k) => !seenDriveNotifyKeys.has(k)));
    const prev = prevUnseenDriveKeysRef.current;
    let hasNew = false;
    for (const k of unseen) {
      if (!prev.has(k)) {
        hasNew = true;
        break;
      }
    }
    if (hasNew) playDriveAlertSound(studentUid);
    prevUnseenDriveKeysRef.current = new Set(unseen);
  }, [studentUid, slots, freeWindows, seenDriveNotifyKeys]);

  useEffect(() => {
    if (!studentUid) {
      setMyInstructors([]);
      setContactsLoading(false);
      return;
    }
    setContactsLoading(true);
    return subscribeStudentAttachedInstructors(
      studentUid,
      (users) => {
        setMyInstructors(users);
        setContactsLoading(false);
      },
      () => {
        setMyInstructors([]);
        setContactsLoading(false);
      }
    );
  }, [studentUid]);

  useEffect(() => {
    if (!myInstructors[0]?.uid) {
      setFreeWindows([]);
      return;
    }
    return subscribeFreeDriveWindowsForStudent(
      myInstructors[0].uid,
      setFreeWindows,
      () => setFreeWindows([])
    );
  }, [myInstructors]);

  useEffect(() => {
    if (!studentUid) {
      setSlots([]);
      return;
    }
    return subscribeDriveSlotsForStudent(studentUid, setSlots, () => setSlots([]));
  }, [studentUid]);

  const myInstructor = myInstructors[0] ?? null;
  const visibleFreeWindows = useMemo(
    () =>
      freeWindows.filter(
        (w) => w.status === "open" || (w.status === "reserved" && w.studentId === studentUid)
      ),
    [freeWindows, studentUid]
  );
  const instructorById = useMemo(() => {
    const m = new Map<string, UserProfile>();
    for (const ins of myInstructors) m.set(ins.uid, ins);
    return m;
  }, [myInstructors]);

  const pendingSlots = useMemo(
    () => slots.filter((s) => s.status === "pending_confirmation"),
    [slots]
  );

  const slotsByDateKey = useMemo(() => {
    const m = new Map<string, DriveSlot[]>();
    for (const s of slots) {
      if (s.status !== "scheduled" || !s.dateKey) continue;
      const list = m.get(s.dateKey) ?? [];
      list.push(s);
      m.set(s.dateKey, list);
    }
    for (const [, list] of m) list.sort(sortSlotsByTime);
    return m;
  }, [slots]);

  const finishedSlotsByDateKey = useMemo(
    () => groupFinishedDriveSlotsByDateKey(slots),
    [slots]
  );

  const scheduleWeekMonday = useMemo(() => {
    const base = mondayOfWeekContaining(new Date(nowMs));
    return addDays(base, weekScheduleOffset * 7);
  }, [nowMs, weekScheduleOffset]);

  const weekKeys = useMemo(() => weekDateKeys(scheduleWeekMonday), [scheduleWeekMonday]);

  const scheduleWeekRangeLabel = useMemo(() => {
    if (weekKeys.length < 7) return "";
    return `${dateKeyToRuDisplay(weekKeys[0])} — ${dateKeyToRuDisplay(weekKeys[6])}`;
  }, [weekKeys]);

  const weekScheduleSlotCount = useMemo(() => {
    let n = 0;
    for (const dateKey of weekKeys) {
      n += slotsByDateKey.get(dateKey)?.length ?? 0;
    }
    return n;
  }, [slotsByDateKey, weekKeys]);

  async function confirmPendingDrive(slotId: string) {
    setPendingDriveBusyId(slotId);
    setPendingDriveErr(null);
    try {
      await studentConfirmDriveSlot(slotId);
    } catch (e: unknown) {
      setPendingDriveErr(mapFirebaseError(e));
    } finally {
      setPendingDriveBusyId(null);
    }
  }

  async function cancelPendingDrive(slotId: string) {
    setPendingDriveBusyId(slotId);
    setPendingDriveErr(null);
    try {
      await studentCancelDriveSlot(slotId);
    } catch (e: unknown) {
      setPendingDriveErr(mapFirebaseError(e));
    } finally {
      setPendingDriveBusyId(null);
    }
  }

  async function cancelConfirmedDrive(slotId: string) {
    setScheduleCancelBusyId(slotId);
    setScheduleCancelErr(null);
    try {
      await studentCancelScheduledDriveSlot(slotId);
    } catch (e: unknown) {
      setScheduleCancelErr(mapFirebaseError(e));
    } finally {
      setScheduleCancelBusyId(null);
    }
  }

  async function ackDriveLiveSession(slotId: string) {
    setAckLiveBusyId(slotId);
    setScheduleCancelErr(null);
    try {
      await studentAckDriveLiveSession(slotId);
    } catch (e: unknown) {
      setScheduleCancelErr(mapFirebaseError(e));
    } finally {
      setAckLiveBusyId(null);
    }
  }

  async function reserveFreeWindow(windowId: string) {
    if (!studentUid) return;
    const committed = countStudentCommittedBookings(slots, studentUid, freeWindows);
    const talonGate = evaluateStudentTalonBooking(profile?.talons, committed);
    if (!talonGate.ok) {
      setStudentTalonAlert(talonGate.reason);
      return;
    }
    setReserveWindowBusyId(windowId);
    setFreeWindowsErr(null);
    try {
      await studentReserveFreeDriveWindow(windowId);
    } catch (e: unknown) {
      const msg = mapFirebaseError(e);
      if (msg === DRIVE_TIME_OCCUPIED_MSG) {
        setDriveTimeOccupiedOpen(true);
      } else {
        setFreeWindowsErr(msg);
      }
    } finally {
      setReserveWindowBusyId(null);
    }
  }

  async function cancelReservedFreeWindow(windowId: string) {
    setReserveWindowBusyId(windowId);
    setFreeWindowsErr(null);
    try {
      await studentCancelFreeDriveWindowReservation(windowId);
    } catch (e: unknown) {
      const msg = mapFirebaseError(e);
      setFreeWindowsErr(msg);
    } finally {
      setReserveWindowBusyId(null);
    }
  }

  return (
    <ChatNavContext.Provider value={chatNavValue}>
      <div
        className={
          chatThreadOpen && tab === "chat"
            ? "admin-dashboard admin-dashboard--with-bottom-nav instructor-dashboard admin-dashboard--chat-thread-open"
            : "admin-dashboard admin-dashboard--with-bottom-nav instructor-dashboard"
        }
      >
        <div className="admin-dashboard-content">
          {tab === "home" && profile ? (
            <div className="dashboard">
              <h1 className="dashboard-title">Главная</h1>
              <section className="instructor-home-section" aria-labelledby="student-self-heading">
                <h2 id="student-self-heading" className="instructor-subtitle">
                  <span className="student-home-subtitle-row">
                    <IconRole />
                    <span>Курсант</span>
                  </span>
                </h2>
                <StudentSelfCard profile={profile} />
              </section>
              <section
                className="instructor-home-section student-home-section--instructor"
                aria-labelledby="my-instructor-heading"
              >
                <h2 id="my-instructor-heading" className="instructor-subtitle">
                  <span className="student-home-subtitle-row">
                    <IconCar />
                    <span>Мой инструктор</span>
                  </span>
                </h2>
                {contactsLoading ? (
                  <p className="admin-empty instructor-home-empty" role="status">
                    Загрузка инструктора…
                  </p>
                ) : (
                  <MyInstructorCard instructor={myInstructor} onOpenChat={openChatWithUser} />
                )}
              </section>
              <section
                className="instructor-home-section student-home-section--free-windows"
                aria-labelledby="student-free-windows-heading"
              >
                <h2
                  id="student-free-windows-heading"
                  className="instructor-subtitle student-pending-drives-title"
                >
                  <span className="student-pending-drives-title-row">
                    <IconNotificationBell />
                    <span className="student-pending-drives-title-text">Свободные окна:</span>
                  </span>
                </h2>
                {freeWindowsErr ? (
                  <div className="form-error student-pending-drives-err" role="alert">
                    {freeWindowsErr}
                  </div>
                ) : null}
                {visibleFreeWindows.length === 0 ? (
                  <p className="admin-empty instructor-home-empty">Пока нет свободных окон.</p>
                ) : (
                  <ul className="student-pending-drives-list">
                    {visibleFreeWindows.map((w) => {
                        const busy = reserveWindowBusyId === w.id;
                        const reservedByMe = w.status === "reserved" && w.studentId === studentUid;
                        const day = weekdayRuFromDateKey(w.dateKey);
                        const instructorName =
                          formatShortFio(myInstructor?.displayName?.trim() ? myInstructor.displayName : "") ||
                          "Инструктор";
                        return (
                          <li key={w.id} className="student-pending-drive-item">
                            <div className="instructor-card instructor-card--student student-home-my-instructor">
                              <div className="instructor-preview-bar">
                                <div className="instructor-card-preview instructor-card-preview--student glossy-panel instructor-home-cadet-preview student-pending-drive-preview">
                                  <div className="student-pending-drive-main">
                                    <div className="drive-pending-notice-row">
                                      <IconPendingDate />
                                      <span className="drive-pending-notice-row-text">
                                        <span className="drive-pending-notice-label">Дата:</span>{" "}
                                        {day}, {dateKeyToRuDisplay(w.dateKey)} · {w.startTime || "—"}
                                      </span>
                                    </div>
                                    <div className="drive-pending-notice-row">
                                      <IconPendingPerson />
                                      <span className="drive-pending-notice-row-text">
                                        <span className="drive-pending-notice-label">Инструктор:</span> {instructorName}
                                      </span>
                                    </div>
                                    <div className="drive-pending-notice-row">
                                      <IconPendingStatus />
                                      <span className="drive-pending-notice-row-text">
                                        <span className="drive-pending-notice-label">Статус:</span>{" "}
                                        <span
                                          className={
                                            reservedByMe
                                              ? "drive-live-status-text"
                                              : "drive-pending-status-value drive-pending-status-value--danger drive-pending-status-value--unbooked-glow"
                                          }
                                        >
                                          {reservedByMe
                                            ? "Ждем подтверждение инструктора..."
                                            : "не забронировано"}
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="instructor-preview-actions">
                                  <button
                                    type="button"
                                    className={
                                      reservedByMe
                                        ? "instr-side-btn glossy-btn student-pending-decline-btn"
                                        : "instr-side-btn glossy-btn student-pending-confirm-btn"
                                    }
                                    onClick={() =>
                                      reservedByMe
                                        ? void cancelReservedFreeWindow(w.id)
                                        : void reserveFreeWindow(w.id)
                                    }
                                    disabled={busy}
                                    aria-label={reservedByMe ? "Отменить бронь" : "Забронировать окно"}
                                    title={reservedByMe ? "Отменить бронь" : "Забронировать"}
                                  >
                                    {reservedByMe ? <IconDeleteBooking /> : <IconConfirmDrive />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </section>
              <section
                className="instructor-home-section student-home-section--schedule"
                aria-labelledby="student-week-schedule-heading"
              >
                {pendingSlots.length > 0 ? (
                  <div className="student-pending-drives-block">
                    <h3 className="student-pending-drives-title">
                      <span className="student-pending-drives-title-row">
                        <IconNotificationBell />
                        <span className="student-pending-drives-title-text">
                          Подтверждение записи:
                        </span>
                      </span>
                    </h3>
                    {pendingDriveErr ? (
                      <div className="form-error student-pending-drives-err" role="alert">
                        {pendingDriveErr}
                      </div>
                    ) : null}
                    <ul className="student-pending-drives-list">
                      {pendingSlots.map((sl) => {
                        const ins = instructorById.get(sl.instructorId);
                        const instructorName =
                          formatShortFio(ins?.displayName?.trim() ? ins.displayName : "") ||
                          "Инструктор";
                        const busy = pendingDriveBusyId === sl.id;
                        return (
                          <StudentPendingDriveCard
                            key={sl.id}
                            slot={sl}
                            instructorName={instructorName}
                            busy={busy}
                            onConfirm={() => void confirmPendingDrive(sl.id)}
                            onCancel={() => void cancelPendingDrive(sl.id)}
                          />
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
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
                    id="student-week-schedule-heading"
                    className="instructor-home-section-toggle glossy-panel"
                    aria-expanded={weekOpen}
                    onClick={() => setWeekOpen((v) => !v)}
                  >
                    <span className="instructor-home-section-toggle-label">
                      <span className="student-home-subtitle-row">
                        <IconCalendar />
                        <span>График вождения</span>
                      </span>
                    </span>
                    <span className="instructor-home-section-toggle-meta">{weekScheduleSlotCount}</span>
                    <IconChevron open={weekOpen} />
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
                {weekOpen ? (
                  <>
                    <p className="field-hint instructor-home-week-hint">
                      {weekScheduleOffset === 0 ? (
                        <>
                          Подтверждённые вождения на{" "}
                          <span className="student-week-schedule-hint-em">текущую неделю</span> (после
                          согласования с инструктором).
                        </>
                      ) : (
                        <>
                          Подтверждённые вождения на неделю{" "}
                          <span className="student-week-schedule-hint-em">{scheduleWeekRangeLabel}</span>{" "}
                          (после согласования с инструктором).
                        </>
                      )}
                    </p>
                    {scheduleCancelErr ? (
                      <div className="form-error student-schedule-cancel-err" role="alert">
                        {scheduleCancelErr}
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
                                  const ins = instructorById.get(sl.instructorId);
                                  const shortName =
                                    formatShortFio(
                                      ins?.displayName?.trim() ? ins.displayName : ""
                                    ) || "—";
                                  const inLive = sl.liveStartedAt != null;
                                  const liveAcked = sl.liveStudentAckAt != null;
                                  const livePaused =
                                    liveAcked &&
                                    sl.livePausedAt != null &&
                                    sl.livePausedAt >= (sl.liveStudentAckAt ?? 0);
                                  if (inLive) {
                                    return (
                                      <DriveWeekScheduleNoticeCard
                                        key={sl.id}
                                        slot={sl}
                                        firstRow="time"
                                        personRowLabel="Инструктор"
                                        personShortName={shortName}
                                        statusValue={
                                          <span className="drive-live-status-text">
                                            {!liveAcked
                                              ? "Подтвердите начало"
                                              : livePaused
                                                ? "На паузе…"
                                                : "Идет вождение"}
                                          </span>
                                        }
                                        customSideActions={
                                          !liveAcked ? (
                                            <button
                                              type="button"
                                              className="instr-side-btn glossy-btn student-drive-live-ack-btn"
                                              onClick={() => void ackDriveLiveSession(sl.id)}
                                              disabled={ackLiveBusyId === sl.id}
                                              aria-label="Подтвердить вождение"
                                              title="Подтвердить"
                                            >
                                              <IconPlayFill />
                                            </button>
                                          ) : livePaused ? null : (
                                            <DriveLiveStudentTimerDecor slot={sl} nowMs={nowMs} />
                                          )
                                        }
                                      />
                                    );
                                  }
                                  return (
                                    <DriveWeekScheduleNoticeCard
                                      key={sl.id}
                                      slot={sl}
                                      firstRow="time"
                                      personRowLabel="Инструктор"
                                      personShortName={shortName}
                                      statusValue={
                                        sl.instructorLateShiftMin != null &&
                                        sl.instructorLateShiftMin > 0 ? (
                                          <span className="drive-student-late-shift-status">
                                            Вождение смещено на {sl.instructorLateShiftMin} мин.
                                            Инструктор задерживается…
                                          </span>
                                        ) : (
                                          <span className="drive-scheduled-status-confirmed">
                                            подтверждено
                                          </span>
                                        )
                                      }
                                      cancelBusy={scheduleCancelBusyId === sl.id}
                                      onCancel={
                                        canStudentCancelScheduledDriveSlot(sl, nowMs)
                                          ? () => void cancelConfirmedDrive(sl.id)
                                          : undefined
                                      }
                                    />
                                  );
                                })}
                              </ul>
                            ) : finishedForDay.length === 0 ? (
                              <p className="admin-empty instructor-home-week-empty">Не назначено.</p>
                            ) : null}
                            <DriveFinishedDayTable slots={finishedForDay} variant="student" />
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : null}
              </section>
            </div>
          ) : null}
          {tab === "tickets" ? <StudentTicketsTab /> : null}
          {tab === "chat" ? (
            <AdminChatTab
              chatHeaderMode="default"
              contactsScope="studentChat"
              pendingOpenUserId={pendingOpenChatUserId}
              onPendingOpenConsumed={consumePendingChat}
              onThreadModeChange={(open) => {
                setChatThreadOpen(open);
                setShellHeaderHidden(open);
              }}
            />
          ) : null}
          {tab === "history" ? <StudentHistoryTab /> : null}
          {tab === "settings" ? <AdminSettingsTab /> : null}
        </div>

        <nav className="admin-bottom-nav" aria-label="Разделы кабинета курсанта">
          {navItems.map(({ id, label, Icon }) => {
            const chatTabBadge =
              id === "chat" && tab !== "chat" && totalUnread > 0 ? totalUnread : 0;
            const homeTabBadge =
              id === "home" && tab !== "home" && homeDriveNotifCount > 0
                ? homeDriveNotifCount
                : 0;
            const navBadge = id === "chat" ? chatTabBadge : id === "home" ? homeTabBadge : 0;
            const navBadgeAria =
              id === "chat" && navBadge > 0
                ? `Непрочитанных сообщений: ${navBadge}`
                : id === "home" && navBadge > 0
                  ? `Новых уведомлений по вождению: ${navBadge}`
                  : "";
            return (
              <button
                key={id}
                type="button"
                data-student-onboarding-nav={id}
                className={
                  tab === id ? "admin-bottom-nav-item is-active" : "admin-bottom-nav-item"
                }
                onClick={() => setTab(id)}
              >
                <span className="admin-bottom-nav-ico-wrap">
                  <Icon className="admin-nav-icon" />
                  {navBadge > 0 ? (
                    <span className="admin-bottom-nav-badge" aria-label={navBadgeAria}>
                      {navBadge > 99 ? "99+" : navBadge}
                    </span>
                  ) : null}
                </span>
                <span className="admin-bottom-nav-label">{label}</span>
              </button>
            );
          })}
        </nav>

        <AlertDialog
          open={studentTalonAlert !== null}
          message={
            studentTalonAlert === "insufficient"
              ? STUDENT_TALON_MSG_INSUFFICIENT
              : STUDENT_TALON_MSG_ZERO
          }
          onClose={() => setStudentTalonAlert(null)}
        />
        <AlertDialog
          open={driveTimeOccupiedOpen}
          message={DRIVE_TIME_OCCUPIED_MSG}
          onClose={() => setDriveTimeOccupiedOpen(false)}
        />
        <AlertDialog
          open={driveLiveCompletedDialogOpen}
          message="Вождение завершено!"
          onClose={() => setDriveLiveCompletedDialogOpen(false)}
        />
      </div>
    </ChatNavContext.Provider>
  );
}
