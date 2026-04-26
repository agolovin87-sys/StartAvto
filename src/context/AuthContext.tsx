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
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";
import { doc, getDoc, getDocFromServer, onSnapshot } from "firebase/firestore";
import type { UserRole, UserProfile } from "@/types";
import { getFirebase, isFirebaseConfigured } from "@/firebase/config";
import { removeAllFcmTokensForUser } from "@/firebase/fcm";
import {
  createUserProfile,
  ensureProfileAfterLogin,
  getUserProfile,
  normalizeUserProfile,
} from "@/firebase/users";
import { mapFirebaseError } from "@/firebase/errors";
import { logAuditAction } from "@/utils/audit";
import { clearBadge } from "@/utils/badging";

type AuthState = {
  user: import("firebase/auth").User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
};

type AuthContextValue = AuthState & {
  /** Перечитать профиль из Firestore (например после смены аватара в настройках). */
  refreshProfile: () => Promise<void>;
  signIn: (
    email: string,
    password: string,
    stayLoggedIn?: boolean
  ) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
    role: UserRole,
    phone: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<import("firebase/auth").User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [error, setError] = useState<string | null>(null);
  /** Чтобы setProfile после ensureProfileAfterLogin не затирал свежие данные из onSnapshot. */
  const profileSnapshotSeenRef = useRef(false);
  /** Последний uid, для которого уже шла первичная загрузка профиля (см. onAuthStateChanged). */
  const authSessionUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const { auth } = getFirebase();
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        authSessionUidRef.current = null;
        profileSnapshotSeenRef.current = false;
        setProfile(null);
        setLoading(false);
        return;
      }
      // Firebase может вызвать колбэк повторно для того же uid (возврат на вкладку, реконнект).
      // Раньше при каждом вызове ставился loading=true и весь кабинет заменялся на экран загрузки.
      if (authSessionUidRef.current === u.uid) {
        return;
      }
      authSessionUidRef.current = u.uid;
      profileSnapshotSeenRef.current = false;
      setLoading(true);
      try {
        const p = await ensureProfileAfterLogin(
          u.uid,
          u.email ?? "",
          u.displayName ?? ""
        );
        if (!profileSnapshotSeenRef.current) {
          setProfile(p);
        }
      } catch (e) {
        setError(mapFirebaseError(e));
        setProfile(null);
        try {
          await firebaseSignOut(getFirebase().auth);
        } catch {
          /* ignore */
        }
      } finally {
        setLoading(false);
      }
    });
  }, []);

  /** Актуальный профиль из Firestore (талоны, attachedStudentIds и т.д.) без перезахода. */
  useEffect(() => {
    if (!isFirebaseConfigured || !user) return;
    const { db } = getFirebase();
    const ref = doc(db, "users", user.uid);
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        profileSnapshotSeenRef.current = true;
        const next = normalizeUserProfile(
          snap.data() as Record<string, unknown>,
          user.uid
        );
        setProfile((prev) => {
          if (
            prev &&
            prev.uid === next.uid &&
            prev.displayName === next.displayName &&
            prev.role === next.role &&
            prev.email === next.email &&
            prev.accountStatus === next.accountStatus &&
            prev.createdAt === next.createdAt &&
            (prev.rejectedAt ?? null) === (next.rejectedAt ?? null) &&
            prev.phone === next.phone &&
            prev.vehicleLabel === next.vehicleLabel &&
            prev.talons === next.talons &&
            prev.examTalons === next.examTalons &&
            prev.drivesCount === next.drivesCount &&
            prev.groupId === next.groupId &&
            (prev.avatarDataUrl ?? null) === (next.avatarDataUrl ?? null) &&
            JSON.stringify(prev.attachedStudentIds ?? []) ===
              JSON.stringify(next.attachedStudentIds ?? []) &&
            prev.presence?.state === next.presence?.state &&
            (prev.presence?.lastSeenAt ?? null) ===
              (next.presence?.lastSeenAt ?? null)
          ) {
            return prev;
          }
          return next;
        });
      },
      (err) => {
        console.warn("[Firestore] users/", user.uid, err.code, err.message);
      }
    );
  }, [user?.uid]);

  const signIn = useCallback(
    async (email: string, password: string, stayLoggedIn = true) => {
      setError(null);
      try {
        const { auth } = getFirebase();
        await setPersistence(
          auth,
          stayLoggedIn ? browserLocalPersistence : browserSessionPersistence
        );
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        void logAuditAction("LOGIN", "user", {
          entityId: cred.user.uid,
          entityName: `Вход в систему (${cred.user.email ?? email.trim()})`,
          status: "success",
        });
      } catch (e) {
        const msg = mapFirebaseError(e);
        setError(msg);
        throw e;
      }
    },
    []
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
      role: UserRole,
      phone: string
    ) => {
      setError(null);
      try {
        const { auth } = getFirebase();
        await setPersistence(auth, browserLocalPersistence);
        const cred = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        );
        if (displayName.trim()) {
          await updateProfile(cred.user, { displayName: displayName.trim() });
        }
        const name =
          (displayName.trim() || cred.user.email?.split("@")[0]) ??
          "Пользователь";
        await createUserProfile(
          cred.user.uid,
          cred.user.email ?? email.trim(),
          name,
          role,
          phone
        );
        void logAuditAction("CREATE_USER", "user", {
          entityId: cred.user.uid,
          entityName: `Создал пользователя ${name} (роль: ${role})`,
          newValue: { email: cred.user.email ?? email.trim(), role, displayName: name },
          status: "success",
        });
      } catch (e) {
        const msg = mapFirebaseError(e);
        setError(msg);
        throw e;
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    setError(null);
    const { auth } = getFirebase();
    const uid = auth.currentUser?.uid?.trim();
    const email = auth.currentUser?.email ?? "";
    if (uid) {
      try {
        await logAuditAction("LOGOUT", "user", {
          entityId: uid,
          entityName: `Выход из системы (${email || uid})`,
          status: "success",
        });
      } catch {
        /* аудит не должен блокировать выход */
      }
      try {
        await removeAllFcmTokensForUser(uid);
      } catch {
        /* сеть / правила — выход всё равно выполняем */
      }
    }
    await firebaseSignOut(auth);
    void clearBadge();
  }, []);

  const refreshProfile = useCallback(async () => {
    const u = user;
    if (!u || !isFirebaseConfigured) return;
    try {
      const { db } = getFirebase();
      const ref = doc(db, "users", u.uid);
      let snap;
      try {
        snap = await getDocFromServer(ref);
      } catch {
        snap = await getDoc(ref);
      }
      if (!snap.exists()) return;
      setProfile(
        normalizeUserProfile(snap.data() as Record<string, unknown>, u.uid)
      );
    } catch {
      try {
        const p = await getUserProfile(u.uid);
        if (p) setProfile(p);
      } catch {
        /* ignore */
      }
    }
  }, [user]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      error,
      refreshProfile,
      signIn,
      signUp,
      signOut,
      clearError,
    }),
    [user, profile, loading, error, refreshProfile, signIn, signUp, signOut, clearError]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth вне AuthProvider");
  return ctx;
}
