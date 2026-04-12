import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { subscribeInstructors } from "@/firebase/admin";
import {
  ackAdminGpsPingSeen,
  subscribeAdminGpsPingSeenMap,
  subscribeInstructorGpsSessionPingMs,
} from "@/firebase/adminGpsPing";
import type { UserProfile } from "@/types";

type AdminGpsPingContextValue = {
  totalGpsPingUnread: number;
  instructorHasGpsPingUnread: (instructorUid: string) => boolean;
  ackInstructorGpsPing: (instructorUid: string) => void;
};

const noop: AdminGpsPingContextValue = {
  totalGpsPingUnread: 0,
  instructorHasGpsPingUnread: () => false,
  ackInstructorGpsPing: () => {},
};

const AdminGpsPingContext = createContext<AdminGpsPingContextValue>(noop);

export function useAdminGpsPing(): AdminGpsPingContextValue {
  return useContext(AdminGpsPingContext);
}

export function AdminGpsPingProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const adminUid = (user?.uid ?? "").trim();
  const isAdmin = profile?.role === "admin";

  const [instructorUids, setInstructorUids] = useState<string[]>([]);
  const [pingMsByInstructor, setPingMsByInstructor] = useState<Record<string, number | null>>(
    {}
  );
  const [seenPingMsByInstructor, setSeenPingMsByInstructor] = useState<Record<string, number>>(
    {}
  );

  const pingMsRef = useRef(pingMsByInstructor);
  pingMsRef.current = pingMsByInstructor;

  useEffect(() => {
    if (!isAdmin) {
      setInstructorUids([]);
      return () => {};
    }
    return subscribeInstructors(
      (list: UserProfile[]) => {
        const active = list
          .filter((u) => u.accountStatus === "active")
          .map((u) => u.uid.trim())
          .filter(Boolean);
        active.sort();
        setInstructorUids(active);
      },
      () => {}
    );
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !adminUid) {
      setSeenPingMsByInstructor({});
      return () => {};
    }
    return subscribeAdminGpsPingSeenMap(adminUid, setSeenPingMsByInstructor);
  }, [isAdmin, adminUid]);

  const uidsKey = instructorUids.join("\n");

  useEffect(() => {
    if (!isAdmin || instructorUids.length === 0) {
      setPingMsByInstructor({});
      return () => {};
    }

    setPingMsByInstructor((prev) => {
      const next: Record<string, number | null> = {};
      for (const uid of instructorUids) next[uid] = prev[uid] ?? null;
      return next;
    });

    const unsubs = instructorUids.map((uid) =>
      subscribeInstructorGpsSessionPingMs(uid, (ms) => {
        setPingMsByInstructor((p) => ({ ...p, [uid]: ms }));
      })
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [isAdmin, uidsKey]);

  const totalGpsPingUnread = useMemo(() => {
    let n = 0;
    for (const uid of instructorUids) {
      const p = pingMsByInstructor[uid];
      if (p == null) continue;
      const s = seenPingMsByInstructor[uid] ?? 0;
      if (p > s) n++;
    }
    return n;
  }, [instructorUids, pingMsByInstructor, seenPingMsByInstructor]);

  const instructorHasGpsPingUnread = useCallback(
    (instructorUid: string) => {
      const uid = instructorUid.trim();
      const p = pingMsByInstructor[uid];
      if (p == null) return false;
      const s = seenPingMsByInstructor[uid] ?? 0;
      return p > s;
    },
    [pingMsByInstructor, seenPingMsByInstructor]
  );

  const ackInstructorGpsPing = useCallback(
    (instructorUid: string) => {
      const uid = instructorUid.trim();
      if (!isAdmin || !adminUid || !uid) return;
      const p = pingMsRef.current[uid];
      if (p == null) return;
      void ackAdminGpsPingSeen(adminUid, uid, p);
    },
    [isAdmin, adminUid]
  );

  const value = useMemo<AdminGpsPingContextValue>(() => {
    if (!isAdmin) return noop;
    return {
      totalGpsPingUnread,
      instructorHasGpsPingUnread,
      ackInstructorGpsPing,
    };
  }, [isAdmin, totalGpsPingUnread, instructorHasGpsPingUnread, ackInstructorGpsPing]);

  return (
    <AdminGpsPingContext.Provider value={value}>{children}</AdminGpsPingContext.Provider>
  );
}
