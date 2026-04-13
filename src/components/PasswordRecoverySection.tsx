import { type FormEvent, useState } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { useAuth } from "@/context/AuthContext";
import { mapFirebaseError } from "@/firebase/errors";
import { isFirebaseConfigured } from "@/firebase/config";
import { hapticError, hapticSuccess } from "@/utils/haptics";

const MIN_LEN = 6;

/**
 * Смена пароля для аккаунта с провайдером email/password.
 * Новый пароль может совпадать с предыдущим — Firebase это допускает.
 */
export function PasswordRecoverySection() {
  const { user } = useAuth();
  const email = user?.email?.trim() ?? "";
  const hasPasswordProvider =
    user?.providerData.some((p) => p.providerId === "password") ?? false;

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  if (!isFirebaseConfigured || !user) {
    return (
      <p className="admin-settings-section-desc" role="status">
        Войдите в аккаунт, чтобы сменить пароль.
      </p>
    );
  }

  if (!email) {
    return (
      <p className="form-error" role="status">
        У аккаунта не указан email — смена пароля недоступна.
      </p>
    );
  }

  if (!hasPasswordProvider) {
    return (
      <p className="admin-settings-section-desc" role="status">
        Вход выполнен не через email и пароль (например, другой способ авторизации). Смена пароля в этом
        разделе недоступна.
      </p>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setErr(null);
    setOk(false);
    if (next.length < MIN_LEN) {
      setErr(`Новый пароль: минимум ${MIN_LEN} символов.`);
      return;
    }
    if (next !== repeat) {
      setErr("Новый пароль и повтор не совпадают.");
      return;
    }
    if (!current) {
      setErr("Введите текущий пароль.");
      return;
    }

    setBusy(true);
    try {
      const cred = EmailAuthProvider.credential(email, current);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, next);
      setCurrent("");
      setNext("");
      setRepeat("");
      setOk(true);
      hapticSuccess();
    } catch (e: unknown) {
      setErr(mapFirebaseError(e));
      hapticError();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-settings-password-panel">
      <h3 className="admin-settings-subtitle">Восстановление и смена пароля</h3>
      <p className="admin-settings-section-desc">
        Укажите текущий пароль и новый. Можно задать тот же пароль, что был раньше — ограничений на «повтор
        старого» со стороны приложения нет.
      </p>
      <form className="admin-settings-password-form" onSubmit={(ev) => void onSubmit(ev)}>
        <label className="admin-settings-password-field">
          <span className="admin-settings-password-label">Текущий пароль</span>
          <input
            type="password"
            className="input"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="admin-settings-password-field">
          <span className="admin-settings-password-label">Новый пароль</span>
          <input
            type="password"
            className="input"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            disabled={busy}
            minLength={MIN_LEN}
          />
        </label>
        <label className="admin-settings-password-field">
          <span className="admin-settings-password-label">Повторите новый пароль</span>
          <input
            type="password"
            className="input"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            disabled={busy}
            minLength={MIN_LEN}
          />
        </label>
        {err ? (
          <p className="form-error" role="alert">
            {err}
          </p>
        ) : null}
        {ok ? (
          <p className="admin-settings-saved-hint" role="status">
            Пароль обновлён. При следующем входе используйте новый пароль.
          </p>
        ) : null}
        <div className="admin-settings-password-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? "Сохранение…" : "Сохранить пароль"}
          </button>
        </div>
      </form>
    </div>
  );
}
