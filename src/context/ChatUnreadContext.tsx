import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

type ChatUnreadContextValue = {
  chatSectionActive: boolean;
  reportDashboardTab: (tab: "chat" | "other") => void;
  reportFocusedChatId: (chatId: string | null) => void;
  notifyIncomingMessage: (
    chatId: string,
    senderId: string,
    viewerUid: string
  ) => void;
  clearUnreadForChat: (chatId: string) => void;
  unreadByChatId: Record<string, number>;
  totalUnread: number;
};

const ChatUnreadContext = createContext<ChatUnreadContextValue | null>(null);

export function ChatUnreadProvider({ children }: { children: ReactNode }) {
  const [chatSectionActive, setChatSectionActive] = useState(false);
  const chatSectionActiveRef = useRef(false);
  const [unreadByChatId, setUnreadByChatId] = useState<Record<string, number>>(
    {}
  );
  const focusedChatIdRef = useRef<string | null>(null);

  const reportDashboardTab = useCallback((tab: "chat" | "other") => {
    const active = tab === "chat";
    chatSectionActiveRef.current = active;
    setChatSectionActive(active);
  }, []);

  const reportFocusedChatId = useCallback((chatId: string | null) => {
    const t = chatId?.trim() ?? "";
    focusedChatIdRef.current = t || null;
  }, []);

  const notifyIncomingMessage = useCallback(
    (chatId: string, senderId: string, viewerUid: string) => {
      const cid = chatId.trim();
      if (!cid) return;
      if (senderId === viewerUid) return;
      if (chatSectionActiveRef.current && focusedChatIdRef.current === cid) {
        return;
      }
      setUnreadByChatId((prev) => ({
        ...prev,
        [cid]: (prev[cid] ?? 0) + 1,
      }));
    },
    []
  );

  const clearUnreadForChat = useCallback((chatId: string) => {
    const cid = chatId.trim();
    if (!cid) return;
    setUnreadByChatId((prev) => {
      if (!prev[cid]) return prev;
      const next = { ...prev };
      delete next[cid];
      return next;
    });
  }, []);

  const totalUnread = useMemo(
    () => Object.values(unreadByChatId).reduce((a, n) => a + n, 0),
    [unreadByChatId]
  );

  const value = useMemo(
    () => ({
      chatSectionActive,
      reportDashboardTab,
      reportFocusedChatId,
      notifyIncomingMessage,
      clearUnreadForChat,
      unreadByChatId,
      totalUnread,
    }),
    [
      chatSectionActive,
      reportDashboardTab,
      reportFocusedChatId,
      notifyIncomingMessage,
      clearUnreadForChat,
      unreadByChatId,
      totalUnread,
    ]
  );

  return (
    <ChatUnreadContext.Provider value={value}>{children}</ChatUnreadContext.Provider>
  );
}

export function useChatUnread(): ChatUnreadContextValue {
  const ctx = useContext(ChatUnreadContext);
  if (!ctx) {
    throw new Error("useChatUnread must be used within ChatUnreadProvider");
  }
  return ctx;
}
