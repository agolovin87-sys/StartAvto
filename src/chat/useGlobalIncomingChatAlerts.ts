import { useEffect, useRef } from "react";
import { useChatUnread } from "@/context/ChatUnreadContext";
import {
  subscribeChatRoomsForUser,
  subscribeLatestMessageForChat,
  subscribeManualGroupChatsForUser,
} from "@/firebase/chat";
import type { ChatRoom } from "@/types";
import { formatShortFio } from "@/admin/formatShortFio";
import { runIncomingMessageAlerts } from "@/chat/incomingMessageAlerts";
import { getUserProfile } from "@/firebase/users";

/**
 * Звук/вибрация входящего по всем чатам пользователя, пока открыт кабинет
 * (не только вкладка «Чат»).
 */
export function useGlobalIncomingChatAlerts(viewerUid: string | null): void {
  const { notifyIncomingMessage } = useChatUnread();
  const uid = viewerUid?.trim() ?? "";

  const queryRoomsRef = useRef<ChatRoom[]>([]);
  const manualRoomsRef = useRef<ChatRoom[]>([]);

  useEffect(() => {
    if (!uid) return;

    let cancelled = false;
    const messageUnsubs = new Map<string, () => void>();
    const lastMsgIdByChat = new Map<string, string | undefined>();
    const primedChat = new Set<string>();

    const roomById = (): Map<string, ChatRoom> => {
      const m = new Map<string, ChatRoom>();
      for (const r of [...queryRoomsRef.current, ...manualRoomsRef.current]) {
        m.set(r.id, r);
      }
      return m;
    };

    const syncMessageListeners = () => {
      if (cancelled) return;
      const rooms = roomById();
      const wanted = new Set(rooms.keys());

      for (const chatId of [...messageUnsubs.keys()]) {
        if (!wanted.has(chatId)) {
          messageUnsubs.get(chatId)!();
          messageUnsubs.delete(chatId);
          lastMsgIdByChat.delete(chatId);
          primedChat.delete(chatId);
        }
      }

      for (const chatId of wanted) {
        if (messageUnsubs.has(chatId)) continue;
        const room = rooms.get(chatId);
        if (!room) continue;

        const unsub = subscribeLatestMessageForChat(
          chatId,
          (msg) => {
            if (cancelled) return;
            const r = roomById().get(chatId);

            if (!msg) {
              if (!primedChat.has(chatId)) primedChat.add(chatId);
              return;
            }

            if (!primedChat.has(chatId)) {
              primedChat.add(chatId);
              lastMsgIdByChat.set(chatId, msg.id);
              return;
            }

            const lastId = lastMsgIdByChat.get(chatId);
            if (msg.id === lastId) return;
            lastMsgIdByChat.set(chatId, msg.id);
            if (msg.senderId === uid) return;

            notifyIncomingMessage(chatId, msg.senderId, uid);

            const documentHidden =
              typeof document !== "undefined" && document.visibilityState === "hidden";
            const chatTitle =
              r?.kind === "group" && r.title?.trim()
                ? r.title
                : "Чат";

            void getUserProfile(msg.senderId).then((p) => {
              const full = p?.displayName?.trim() ?? "";
              const senderShort = full ? formatShortFio(full) : "Контакт";
              runIncomingMessageAlerts(uid, {
                message: msg,
                senderLabel: senderShort,
                chatTitle,
                documentHidden,
              });
            });
          },
          () => {}
        );
        messageUnsubs.set(chatId, unsub);
      }
    };

    const unsubQuery = subscribeChatRoomsForUser(
      uid,
      (rooms) => {
        queryRoomsRef.current = rooms;
        syncMessageListeners();
      },
      () => {}
    );

    const unsubManual = subscribeManualGroupChatsForUser(
      uid,
      (rooms) => {
        manualRoomsRef.current = rooms;
        syncMessageListeners();
      },
      () => {}
    );

    return () => {
      cancelled = true;
      unsubQuery();
      unsubManual();
      messageUnsubs.forEach((u) => u());
      messageUnsubs.clear();
    };
  }, [uid, notifyIncomingMessage]);
}
