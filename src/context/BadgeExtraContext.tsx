import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";

export type BadgeExtraContextValue = {
  adminGpsUnread: number;
  setAdminGpsUnread: (n: number) => void;
};

const BadgeExtraContext = createContext<BadgeExtraContextValue | null>(null);

export function BadgeExtraProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [adminGpsUnread, setAdminGpsUnreadState] = useState(0);

  const setAdminGpsUnread = useCallback((n: number) => {
    setAdminGpsUnreadState(Math.max(0, Math.floor(n)));
  }, []);

  useEffect(() => {
    if (profile?.role !== "admin") {
      setAdminGpsUnreadState(0);
    }
  }, [profile?.role]);

  const value = useMemo(
    () => ({ adminGpsUnread, setAdminGpsUnread }),
    [adminGpsUnread, setAdminGpsUnread]
  );

  return (
    <BadgeExtraContext.Provider value={value}>{children}</BadgeExtraContext.Provider>
  );
}

export function useBadgeExtra(): BadgeExtraContextValue {
  const ctx = useContext(BadgeExtraContext);
  if (!ctx) {
    throw new Error("useBadgeExtra вне BadgeExtraProvider");
  }
  return ctx;
}
