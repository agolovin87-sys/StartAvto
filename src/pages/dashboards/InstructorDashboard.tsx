import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useChatUnread } from "@/context/ChatUnreadContext";
import { ChatNavContext } from "@/context/ChatNavContext";
import { useChatThreadShell } from "@/context/ChatThreadShellContext";
import { AdminChatTab } from "@/pages/dashboards/admin/AdminChatTab";
import { AdminSettingsTab } from "@/pages/dashboards/admin/AdminSettingsTab";
import { InstructorBookingTab } from "@/pages/dashboards/instructor/InstructorBookingTab";
import { InstructorHistoryTab } from "@/pages/dashboards/instructor/InstructorHistoryTab";
import { InstructorHomeTab } from "@/pages/dashboards/instructor/InstructorHomeTab";
import { InstructorTicketsTab } from "@/pages/dashboards/instructor/InstructorTicketsTab";
import {
  subscribeDriveSlotsForInstructor,
  subscribeFreeDriveWindowsForInstructor,
} from "@/firebase/drives";
import { useAutoDeleteExpiredOpenFreeWindows } from "@/hooks/useAutoDeleteExpiredOpenFreeWindows";
import { useDashboardTabHistory } from "@/hooks/useDashboardTabHistory";
import { playDriveAlertSound } from "@/audio/playDriveAlertSound";
import {
  loadInstructorSeenDriveKeys,
  relevantInstructorHomeNotificationKeys,
  saveInstructorSeenDriveKeys,
} from "@/lib/instructorHomeDriveNotifications";
import type { DriveSlot, FreeDriveWindow } from "@/types";

type InstructorNavTab = "home" | "booking" | "chat" | "tickets" | "history" | "settings";

const INSTRUCTOR_DASH_TABS = [
  "home",
  "booking",
  "chat",
  "tickets",
  "history",
  "settings",
] as const satisfies readonly InstructorNavTab[];

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

function IconBooking({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
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

const navItems: {
  id: InstructorNavTab;
  label: string;
  Icon: typeof IconHome;
}[] = [
  { id: "home", label: "Главная", Icon: IconHome },
  { id: "booking", label: "Запись", Icon: IconBooking },
  { id: "chat", label: "Чат", Icon: IconChatNav },
  { id: "tickets", label: "Билеты", Icon: IconTicketsNav },
  { id: "history", label: "История", Icon: IconHistory },
  { id: "settings", label: "Настройки", Icon: IconSettings },
];

export function InstructorDashboard() {
  const { profile, user } = useAuth();
  const instructorUid = (user?.uid ?? profile?.uid ?? "").trim();
  const [tab, setTab] = useState<InstructorNavTab>("home");
  useDashboardTabHistory(tab, setTab, INSTRUCTOR_DASH_TABS);
  const [chatThreadOpen, setChatThreadOpen] = useState(false);
  const { setShellHeaderHidden } = useChatThreadShell();
  const { reportDashboardTab, totalUnread } = useChatUnread();
  const [instructorFreeWindows, setInstructorFreeWindows] = useState<FreeDriveWindow[]>([]);
  const [instructorSlots, setInstructorSlots] = useState<DriveSlot[]>([]);
  const [seenInstructorDriveKeys, setSeenInstructorDriveKeys] = useState<Set<string>>(
    () => new Set()
  );
  const prevUnseenInstructorDriveKeysRef = useRef<Set<string>>(new Set());
  const [pendingOpenChatUserId, setPendingOpenChatUserId] = useState<string | null>(
    null
  );

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
    if (tab !== "chat") {
      setChatThreadOpen(false);
      setShellHeaderHidden(false);
    }
  }, [tab, setShellHeaderHidden]);

  useEffect(() => {
    reportDashboardTab(tab === "chat" ? "chat" : "other");
  }, [tab, reportDashboardTab]);

  useEffect(() => {
    if (!instructorUid) {
      setInstructorFreeWindows([]);
      return;
    }
    return subscribeFreeDriveWindowsForInstructor(
      instructorUid,
      setInstructorFreeWindows,
      () => {}
    );
  }, [instructorUid]);

  useLayoutEffect(() => {
    if (!instructorUid) {
      setSeenInstructorDriveKeys(new Set());
      return;
    }
    setSeenInstructorDriveKeys(loadInstructorSeenDriveKeys(instructorUid));
  }, [instructorUid]);

  useEffect(() => {
    prevUnseenInstructorDriveKeysRef.current = new Set();
  }, [instructorUid]);

  useEffect(() => {
    if (!instructorUid) {
      setInstructorSlots([]);
      return;
    }
    return subscribeDriveSlotsForInstructor(instructorUid, setInstructorSlots, () =>
      setInstructorSlots([])
    );
  }, [instructorUid]);

  useLayoutEffect(() => {
    if (tab !== "home" || !instructorUid) return;
    const rel = relevantInstructorHomeNotificationKeys(
      instructorSlots,
      instructorFreeWindows,
      instructorUid
    );
    if (rel.length === 0) return;
    setSeenInstructorDriveKeys((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const k of rel) {
        if (!next.has(k)) {
          next.add(k);
          changed = true;
        }
      }
      if (changed) saveInstructorSeenDriveKeys(instructorUid, next);
      return changed ? next : prev;
    });
  }, [tab, instructorUid, instructorSlots, instructorFreeWindows]);

  const homeBookingNotifCount = useMemo(() => {
    if (tab === "home" || !instructorUid) return 0;
    const rel = relevantInstructorHomeNotificationKeys(
      instructorSlots,
      instructorFreeWindows,
      instructorUid
    );
    return rel.filter((k) => !seenInstructorDriveKeys.has(k)).length;
  }, [
    tab,
    instructorUid,
    instructorSlots,
    instructorFreeWindows,
    seenInstructorDriveKeys,
  ]);

  useEffect(() => {
    if (!instructorUid) return;
    const rel = relevantInstructorHomeNotificationKeys(
      instructorSlots,
      instructorFreeWindows,
      instructorUid
    );
    const unseen = new Set(rel.filter((k) => !seenInstructorDriveKeys.has(k)));
    const prev = prevUnseenInstructorDriveKeysRef.current;
    let hasNew = false;
    for (const k of unseen) {
      if (!prev.has(k)) {
        hasNew = true;
        break;
      }
    }
    if (hasNew) playDriveAlertSound(instructorUid);
    prevUnseenInstructorDriveKeysRef.current = new Set(unseen);
  }, [
    instructorUid,
    instructorSlots,
    instructorFreeWindows,
    seenInstructorDriveKeys,
  ]);

  useAutoDeleteExpiredOpenFreeWindows(instructorUid, instructorFreeWindows);

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
          {tab === "home" ? <InstructorHomeTab /> : null}
          {tab === "booking" ? (
            <InstructorBookingTab freeWindows={instructorFreeWindows} />
          ) : null}
          {tab === "chat" ? (
            <AdminChatTab
              chatHeaderMode="default"
              contactsScope="instructorAttached"
              pendingOpenUserId={pendingOpenChatUserId}
              onPendingOpenConsumed={consumePendingChat}
              onThreadModeChange={(open) => {
                setChatThreadOpen(open);
                setShellHeaderHidden(open);
              }}
            />
          ) : null}
          {tab === "tickets" ? <InstructorTicketsTab /> : null}
          {tab === "history" ? <InstructorHistoryTab /> : null}
          {tab === "settings" ? <AdminSettingsTab /> : null}
        </div>

        <nav className="admin-bottom-nav" aria-label="Разделы кабинета инструктора">
          {navItems.map(({ id, label, Icon }) => {
            const chatTabBadge =
              id === "chat" && tab !== "chat" && totalUnread > 0 ? totalUnread : 0;
            const homeTabBadge =
              id === "home" && tab !== "home" && homeBookingNotifCount > 0
                ? homeBookingNotifCount
                : 0;
            const navBadge =
              id === "chat" ? chatTabBadge : id === "home" ? homeTabBadge : 0;
            const navBadgeAria =
              id === "chat" && navBadge > 0
                ? `Непрочитанных сообщений: ${navBadge}`
                : id === "home" && navBadge > 0
                  ? `Новых уведомлений по записи и вождению: ${navBadge}`
                  : "";
            return (
              <button
                key={id}
                type="button"
                data-instructor-onboarding-nav={id}
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
      </div>
    </ChatNavContext.Provider>
  );
}
