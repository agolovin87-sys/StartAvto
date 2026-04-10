import { createContext, useContext } from "react";

export type ChatNavContextValue = {
  /** Перейти во вкладку «Чат» и открыть диалог с пользователем по uid. */
  openChatWithUser: (uid: string) => void;
};

export const ChatNavContext = createContext<ChatNavContextValue | null>(null);

export function useChatNav(): ChatNavContextValue | null {
  return useContext(ChatNavContext);
}
