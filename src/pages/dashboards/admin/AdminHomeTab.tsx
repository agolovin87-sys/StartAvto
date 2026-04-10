import { useEffect, useState } from "react";
import {
  setUserAccountStatus,
  setUserRole,
  subscribePendingNewUsers,
} from "@/firebase/admin";
import type { UserProfile, UserRole } from "@/types";

const roleOptions: { value: UserRole; label: string }[] = [
  { value: "student", label: "Курсант" },
  { value: "instructor", label: "Инструктор" },
];

export function AdminHomeTab() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribePendingNewUsers(
      setUsers,
      (e) => setErr(e.message)
    );
    return () => unsub();
  }, []);

  async function approve(uid: string) {
    setBusy(uid + "a");
    try {
      await setUserAccountStatus(uid, "active");
    } finally {
      setBusy(null);
    }
  }

  async function reject(uid: string) {
    if (!confirm("Удалить пользователя из системы? Вход будет закрыт.")) return;
    setBusy(uid + "r");
    try {
      await setUserAccountStatus(uid, "rejected");
    } finally {
      setBusy(null);
    }
  }

  async function changeRole(uid: string, role: UserRole) {
    setBusy(uid + "role");
    try {
      await setUserRole(uid, role);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-tab">
      <section
        className="admin-pending-users-section"
        aria-labelledby="pending-users-heading"
      >
        <h1 className="admin-tab-title" id="pending-users-heading">
          Новые пользователи
        </h1>
        {err ? (
          <div className="form-error" role="alert">
            {err}
          </div>
        ) : null}
        {users.length === 0 ? (
          <p className="admin-empty">Нет заявок на подтверждение.</p>
        ) : (
          <ul className="admin-user-list">
            {users.map((u) => (
              <li key={u.uid} className="admin-user-card">
                <div className="admin-user-head">
                  <strong className="admin-user-name">{u.displayName}</strong>
                  <span className="admin-user-email">{u.email}</span>
                </div>
                <label className="admin-inline-field">
                  <span className="field-label">Роль</span>
                  <select
                    className="input input-inline"
                    value={u.role}
                    disabled={!!busy}
                    onChange={(e) =>
                      changeRole(u.uid, e.target.value as UserRole)
                    }
                  >
                    {roleOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="admin-user-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!!busy}
                    onClick={() => approve(u.uid)}
                  >
                    {busy === u.uid + "a" ? "…" : "Активировать"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={!!busy}
                    onClick={() => reject(u.uid)}
                  >
                    {busy === u.uid + "r" ? "…" : "Удалить"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
