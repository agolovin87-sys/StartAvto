import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppBrandIcon } from "@/components/AppBrandIcon";
import { IconInstallApp } from "@/components/IconInstallApp";
import { RequiredMark } from "@/components/RequiredMark";
import { WebAppInstallCallout } from "@/components/WebAppInstallCallout";
import { useAuth } from "@/context/AuthContext";
import { usePasskey } from "@/hooks/usePasskey";

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const installFromLink =
    searchParams.get("install") === "1" ||
    searchParams.get("install") === "true" ||
    searchParams.get("install") === "yes";
  const { signIn, error, clearError } = useAuth();
  const { login: passkeyLogin, isAvailable: passkeyAvailable } = usePasskey();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyLocalError, setPasskeyLocalError] = useState<string | null>(null);
  /** После успешного WebAuthn — нужен пароль для Firebase (сессия / токен). */
  const [passkeyVerifiedEmail, setPasskeyVerifiedEmail] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    setSubmitting(true);
    try {
      await signIn(email, password, stayLoggedIn);
      setPasskeyVerifiedEmail(null);
    } catch {
      /* сообщение в context */
    } finally {
      setSubmitting(false);
    }
  }

  async function onPasskeyLogin() {
    clearError();
    setPasskeyLocalError(null);
    setPasskeyBusy(true);
    try {
      const { email: em } = await passkeyLogin();
      setEmail(em);
      setPasskeyVerifiedEmail(em);
    } catch (err) {
      setPasskeyLocalError(err instanceof Error ? err.message : "Ошибка входа по биометрии");
    } finally {
      setPasskeyBusy(false);
    }
  }

  const message = error ?? "";
  const passkeyHint =
    passkeyVerifiedEmail != null
      ? "Биометрия подтверждена. Введите пароль этого аккаунта — после входа сессия Firebase будет активна (как при обычном входе)."
      : null;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-app-icon-wrap">
          <AppBrandIcon size={72} alt="" />
        </div>
        <h1 className="auth-title">Вход</h1>
        <p className="auth-lead">Автошкола StartAvto</p>
        {installFromLink ? <WebAppInstallCallout /> : null}
        <form className="form" onSubmit={onSubmit} noValidate>
          {message ? (
            <div className="form-error" role="alert">
              {message}
            </div>
          ) : null}
          {passkeyLocalError ? (
            <div className="form-error" role="alert">
              {passkeyLocalError}
            </div>
          ) : null}
          {passkeyHint ? (
            <div className="form-hint form-hint--passkey" role="status">
              {passkeyHint}
            </div>
          ) : null}
          <label className="field">
            <span className="field-label">
              Email <RequiredMark />
            </span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span className="field-label">
              Пароль <RequiredMark />
            </span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <div className="field field-switch">
            <label className="switch-stay">
              <input
                type="checkbox"
                role="switch"
                checked={stayLoggedIn}
                onChange={(e) => setStayLoggedIn(e.target.checked)}
                aria-checked={stayLoggedIn}
              />
              <span className="switch-stay-slider" aria-hidden />
              <span className="switch-stay-text">Оставаться в системе</span>
            </label>
            <span className="field-hint">
              Если выключено, сессия сбросится после закрытия браузера
            </span>
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Вход…" : "Войти"}
          </button>
          {passkeyAvailable ? (
            <button
              type="button"
              className="btn btn-ghost auth-passkey-btn"
              disabled={submitting || passkeyBusy}
              onClick={onPasskeyLogin}
            >
              {passkeyBusy ? "Биометрия…" : "🔐 Войти по биометрии"}
            </button>
          ) : (
            <p className="auth-footer auth-footer--secondary">
              Биометрический вход недоступен (нужен HTTPS и поддержка браузера).
            </p>
          )}
        </form>
        <p className="auth-footer">
          Нет аккаунта?{" "}
          <Link
            to={installFromLink ? "/register?install=1" : "/register"}
            className={installFromLink ? "install-app-invite-link" : undefined}
          >
            {installFromLink ? (
              <>
                <IconInstallApp className="install-app-invite-ico" />
                <span>Регистрация</span>
              </>
            ) : (
              "Регистрация"
            )}
          </Link>
        </p>
        <p className="auth-footer auth-footer--secondary">
          <Link to="/install">Как установить приложение</Link> (iPhone, Android, ПК)
        </p>
      </div>
    </div>
  );
}
