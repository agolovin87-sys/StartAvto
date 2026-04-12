import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminGpsPingProvider, useAdminGpsPing } from "@/context/AdminGpsPingContext";
import { useChatUnread } from "@/context/ChatUnreadContext";
import { ChatNavContext } from "@/context/ChatNavContext";
import { useChatThreadShell } from "@/context/ChatThreadShellContext";
import { AdminHomeTab } from "@/pages/dashboards/admin/AdminHomeTab";
import { AdminInstructorsTab } from "@/pages/dashboards/admin/AdminInstructorsTab";
import { AdminScheduleTab } from "@/pages/dashboards/admin/AdminScheduleTab";
import { AdminStudentsTab } from "@/pages/dashboards/admin/AdminStudentsTab";
import { AdminChatTab } from "@/pages/dashboards/admin/AdminChatTab";
import { AdminGpsTab } from "@/pages/dashboards/admin/AdminGpsTab";
import { AdminHistoryTab } from "@/pages/dashboards/admin/AdminHistoryTab";
import { AdminSettingsTab } from "@/pages/dashboards/admin/AdminSettingsTab";
import { backfillManualGroupParticipantEmails } from "@/firebase/chat";
import { useDashboardTabHistory } from "@/hooks/useDashboardTabHistory";

type AdminNavTab = "home" | "schedule" | "chat" | "history" | "gps" | "settings";

const ADMIN_DASH_TABS = [
  "home",
  "schedule",
  "chat",
  "history",
  "gps",
  "settings",
] as const satisfies readonly AdminNavTab[];

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

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7v-5z"
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

function IconGps({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"
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
  id: AdminNavTab;
  label: string;
  Icon: typeof IconHome;
}[] = [
  { id: "home", label: "Главная", Icon: IconHome },
  { id: "schedule", label: "График", Icon: IconCalendar },
  { id: "chat", label: "Чат", Icon: IconChatNav },
  { id: "history", label: "История", Icon: IconHistory },
  { id: "gps", label: "GPS", Icon: IconGps },
  { id: "settings", label: "Настройки", Icon: IconSettings },
];

export function AdminDashboard() {
  return (
    <AdminGpsPingProvider>
      <AdminDashboardInner />
    </AdminGpsPingProvider>
  );
}

function AdminDashboardInner() {
  const [tab, setTab] = useState<AdminNavTab>("home");
  useDashboardTabHistory(tab, setTab, ADMIN_DASH_TABS);
  const [chatThreadOpen, setChatThreadOpen] = useState(false);
  const { setShellHeaderHidden } = useChatThreadShell();
  const { reportDashboardTab, totalUnread } = useChatUnread();
  const { totalGpsPingUnread } = useAdminGpsPing();
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
    // Бэкфилл старых ручных групп (email участников + kind=group при необходимости).
    void backfillManualGroupParticipantEmails();
  }, []);

  return (
    <ChatNavContext.Provider value={chatNavValue}>
    <div
      className={
        chatThreadOpen && tab === "chat"
          ? "admin-dashboard admin-dashboard--with-bottom-nav admin-dashboard--chat-thread-open"
          : "admin-dashboard admin-dashboard--with-bottom-nav"
      }
    >
      <div className="admin-dashboard-content">
        {tab === "home" ? (
          <>
            <AdminHomeTab />
            <div className="admin-section-sep" aria-hidden />
            <AdminInstructorsTab />
            <div className="admin-section-sep" aria-hidden />
            <AdminStudentsTab />
          </>
        ) : null}
        {tab === "schedule" ? <AdminScheduleTab /> : null}
        {tab === "chat" ? (
          <AdminChatTab
            contactsScope="allActiveUsers"
            pendingOpenUserId={pendingOpenChatUserId}
            onPendingOpenConsumed={consumePendingChat}
            onThreadModeChange={(open) => {
              setChatThreadOpen(open);
              setShellHeaderHidden(open);
            }}
          />
        ) : null}
        {tab === "history" ? <AdminHistoryTab /> : null}
        {tab === "gps" ? <AdminGpsTab /> : null}
        {tab === "settings" ? <AdminSettingsTab /> : null}
      </div>

      <nav className="admin-bottom-nav" aria-label="Разделы админки">
        {navItems.map(({ id, label, Icon }) => {
          const navBadgeCount =
            id === "chat" && tab !== "chat" && totalUnread > 0
              ? totalUnread
              : id === "gps" && tab !== "gps" && totalGpsPingUnread > 0
                ? totalGpsPingUnread
                : 0;
          const navBadgeAria =
            id === "chat" && navBadgeCount > 0
              ? `Непрочитанных сообщений: ${navBadgeCount}`
              : id === "gps" && navBadgeCount > 0
                ? `Новых уведомлений по геолокации: ${navBadgeCount}`
                : "";
          return (
            <button
              key={id}
              type="button"
              className={tab === id ? "admin-bottom-nav-item is-active" : "admin-bottom-nav-item"}
              onClick={() => setTab(id)}
            >
              <span className="admin-bottom-nav-ico-wrap">
                <Icon className="admin-nav-icon" />
                {navBadgeCount > 0 ? (
                  <span className="admin-bottom-nav-badge" aria-label={navBadgeAria}>
                    {navBadgeCount > 99 ? "99+" : navBadgeCount}
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
