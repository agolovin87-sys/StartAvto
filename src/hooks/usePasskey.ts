import { useCallback, useMemo, useState } from "react";
import {
  deletePasskey as deletePasskeyFromStore,
  getPrimaryPasskeyForUser,
  isPasskeySupported,
  loginWithPasskey,
  registerPasskey,
} from "@/utils/passkey";

export type UsePasskeyOptions = {
  userId?: string;
  email?: string;
};

export function usePasskey(opts?: UsePasskeyOptions) {
  const userId = opts?.userId?.trim() || undefined;
  const email = opts?.email?.trim() || undefined;
  const [rev, setRev] = useState(0);

  const refresh = useCallback(() => setRev((x) => x + 1), []);

  const registration = useMemo(() => {
    if (!userId) return null;
    return getPrimaryPasskeyForUser(userId);
  }, [userId, rev]);

  const register = useCallback(async () => {
    if (!email || !userId) {
      throw new Error("Для регистрации нужны email и идентификатор пользователя.");
    }
    await registerPasskey(email, userId);
    refresh();
  }, [email, userId, refresh]);

  const login = useCallback(async () => {
    const r = await loginWithPasskey();
    refresh();
    return r;
  }, [refresh]);

  const deletePasskey = useCallback(async () => {
    if (!registration) return;
    await deletePasskeyFromStore(registration.credentialId);
    refresh();
  }, [registration, refresh]);

  return {
    register,
    login,
    delete: deletePasskey,
    isAvailable: isPasskeySupported(),
    hasRegisteredPasskey: registration != null,
    registeredAt: registration?.registeredAt ?? null,
    credentialId: registration?.credentialId ?? null,
    refresh,
  };
}
