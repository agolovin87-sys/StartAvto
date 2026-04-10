import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ChatThreadShellContextValue = {
  shellHeaderHidden: boolean;
  setShellHeaderHidden: (hidden: boolean) => void;
};

const ChatThreadShellContext = createContext<ChatThreadShellContextValue | null>(null);

export function ChatThreadShellProvider({ children }: { children: ReactNode }) {
  const [shellHeaderHidden, setShellHeaderHiddenState] = useState(false);

  const setShellHeaderHidden = useCallback((hidden: boolean) => {
    setShellHeaderHiddenState(hidden);
  }, []);

  const value = useMemo(
    () => ({ shellHeaderHidden, setShellHeaderHidden }),
    [shellHeaderHidden, setShellHeaderHidden],
  );

  return (
    <ChatThreadShellContext.Provider value={value}>{children}</ChatThreadShellContext.Provider>
  );
}

export function useChatThreadShell() {
  const ctx = useContext(ChatThreadShellContext);
  if (!ctx) {
    throw new Error("useChatThreadShell must be used within ChatThreadShellProvider");
  }
  return ctx;
}
