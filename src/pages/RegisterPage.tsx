import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { RequiredMark } from "@/components/RequiredMark";
import { useAuth } from "@/context/AuthContext";
import { isValidRuMobilePhone, normalizeRuPhone } from "@/lib/phoneRu";
import type { UserRole } from "@/types";

const roles: { value: UserRole; label: string }[] = [
  { value: "student", label: "Курсант" },
  { value: "instructor", label: "Инструктор" },
];

function isFullFio(value: string): boolean {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.length >= 3;
}

export function RegisterPage() {
  const { signUp, error, clearError } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("student");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    setLocalError("");
    if (!isFullFio(displayName)) {
      setLocalError(
        "Укажите ФИО полностью: фамилия, имя и отчество (минимум три слова). Это обязательно для всех, в том числе для администраторов."
      );
      return;
    }
    const phoneNorm = normalizeRuPhone(phone);
    if (!phoneNorm || !isValidRuMobilePhone(phoneNorm)) {
      setLocalError(
        "Укажите телефон России: +7 и 10 цифр (например +79001234567 или 8 900 123-45-67)."
      );
      return;
    }
    setSubmitting(true);
    try {
      await signUp(email, password, displayName, role, phoneNorm);
    } finally {
      setSubmitting(false);
    }
  }

  const message = error ?? localError;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Регистрация</h1>
        <p className="auth-lead">Создайте аккаунт в StartAvto</p>
        <form className="form" onSubmit={onSubmit} noValidate>
          {message ? (
            <div className="form-error" role="alert">
              {message}
            </div>
          ) : null}
          <label className="field">
            <span className="field-label">
              ФИО <RequiredMark />
            </span>
            <input
              className="input"
              type="text"
              autoComplete="name"
              name="fullName"
              placeholder="Фамилия Имя Отчество"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setLocalError("");
              }}
              required
            />
            <span className="field-hint">
              Полностью: фамилия, имя и отчество
            </span>
          </label>
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
              Телефон <RequiredMark />
            </span>
            <input
              className="input"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              name="phone"
              placeholder="+7 (900) 123-45-67"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setLocalError("");
              }}
              required
            />
            <span className="field-hint">
              Формат России: код +7 и мобильный номер (10 цифр после +7)
            </span>
          </label>
          <label className="field">
            <span className="field-label">
              Пароль <RequiredMark />
            </span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <span className="field-hint">Минимум 6 символов</span>
          </label>
          <fieldset className="role-fieldset" aria-required>
            <legend className="field-label">
              Роль <RequiredMark />
            </legend>
            <div className="role-options">
              {roles.map((r) => (
                <label key={r.value} className="role-option">
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={role === r.value}
                    onChange={() => setRole(r.value)}
                  />
                  <span className="role-option-body">
                    <span className="role-option-title">{r.label}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? "Регистрация…" : "Зарегистрироваться"}
          </button>
        </form>
        <p className="auth-footer">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </div>
    </div>
  );
}
