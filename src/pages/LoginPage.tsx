import { FormEvent, useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { Link, useSearchParams } from "react-router-dom";
import { AppBrandIcon } from "@/components/AppBrandIcon";
import { IconInstallApp } from "@/components/IconInstallApp";
import { RequiredMark } from "@/components/RequiredMark";
import { WebAppInstallCallout } from "@/components/WebAppInstallCallout";
import { useAuth } from "@/context/AuthContext";
import { mapFirebaseError } from "@/firebase/errors";
import { getFirebase, isFirebaseConfigured } from "@/firebase/config";

function IconEye({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
      />
    </svg>
  );
}

function IconEyeOff({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"
      />
    </svg>
  );
}

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const installFromLink =
    searchParams.get("install") === "1" ||
    searchParams.get("install") === "true" ||
    searchParams.get("install") === "yes";
  const { signIn, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetErr, setResetErr] = useState<string | null>(null);
  const [resetOk, setResetOk] = useState<string | null>(null);

  async function onPasswordReset() {
    clearError();
    setResetErr(null);
    setResetOk(null);
    const em = email.trim();
    if (!em) {
      setResetErr("Укажите email — на него придёт письмо со ссылкой для сброса пароля.");
      return;
    }
    if (!isFirebaseConfigured) {
      setResetErr("Сервис временно недоступен.");
      return;
    }
    setResetBusy(true);
    try {
      const { auth } = getFirebase();
      await sendPasswordResetEmail(auth, em);
      setResetOk(
        "Если этот адрес зарегистрирован, на почту отправлено письмо со ссылкой для восстановления пароля. Проверьте «Входящие» и папку «Спам»."
      );
    } catch (e: unknown) {
      setResetErr(mapFirebaseError(e));
    } finally {
      setResetBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    setResetErr(null);
    setResetOk(null);
    setSubmitting(true);
    try {
      await signIn(email, password, stayLoggedIn);
    } catch {
      /* сообщение в context */
    } finally {
      setSubmitting(false);
    }
  }

  const message = error ?? "";

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
            <div className="auth-password-wrap">
              <input
                className="input auth-password-input"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                aria-pressed={showPassword}
              >
                {showPassword ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
          </label>
          <div className="auth-reset-password-row">
            <button
              type="button"
              className="auth-reset-password-link"
              disabled={submitting || resetBusy}
              onClick={() => void onPasswordReset()}
            >
              {resetBusy ? "Отправка письма…" : "Восстановить пароль"}
            </button>
          </div>
          {resetErr ? (
            <div className="form-error" role="alert">
              {resetErr}
            </div>
          ) : null}
          {resetOk ? (
            <div className="form-hint form-hint--reset-ok" role="status">
              {resetOk}
            </div>
          ) : null}
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
