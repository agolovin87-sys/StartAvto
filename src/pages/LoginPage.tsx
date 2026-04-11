import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppBrandIcon } from "@/components/AppBrandIcon";
import { IconInstallApp } from "@/components/IconInstallApp";
import { RequiredMark } from "@/components/RequiredMark";
import { WebAppInstallCallout } from "@/components/WebAppInstallCallout";
import { useAuth } from "@/context/AuthContext";

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const installFromLink =
    searchParams.get("install") === "1" ||
    searchParams.get("install") === "true" ||
    searchParams.get("install") === "yes";
  const { signIn, error, clearError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
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
