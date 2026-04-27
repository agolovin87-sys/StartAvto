import { useEffect, useMemo, useState } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import { setStudentGroup, subscribeStudents, subscribeTrainingGroups } from "@/firebase/admin";
import type { TrainingGroup, UserProfile } from "@/types";

/**
 * Блок «Не в группе» для главной админки — сразу под «Новые пользователи».
 */
export function AdminUngroupedStudentsSection() {
  const [groups, setGroups] = useState<TrainingGroup[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const u1 = subscribeTrainingGroups(setGroups, () => {});
    const u2 = subscribeStudents(setStudents, () => {});
    return () => {
      u1();
      u2();
    };
  }, []);

  const ungrouped = useMemo(
    () =>
      students.filter((s) => !s.groupId || !groups.some((g) => g.id === s.groupId)),
    [students, groups]
  );

  async function onStudentGroupChange(uid: string, value: string) {
    setBusy(true);
    try {
      await setStudentGroup(uid, value || null);
    } catch {
      /* ошибка без показа блока в интерфейсе */
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="admin-students-ungrouped"
      aria-labelledby="ungrouped-heading"
    >
      <h2 id="ungrouped-heading" className="admin-subsection-title">
        Не в группе
      </h2>
      {groups.length === 0 ? (
        <p className="field-hint admin-ungrouped-hint">
          Сначала создайте группу во вкладке «Группы» ниже — затем здесь появится выбор,
          куда перевести курсанта.
        </p>
      ) : null}
      {ungrouped.length === 0 ? (
        <p className="admin-empty">Нет курсантов без группы.</p>
      ) : (
        <ul className="admin-ungrouped-list">
          {ungrouped.map((s) => (
            <li key={s.uid} className="admin-ungrouped-row">
              <div className="admin-ungrouped-text">
                <span className="admin-ungrouped-name">{formatShortFio(s.displayName)}</span>
                <span className="admin-ungrouped-email">{s.email}</span>
              </div>
              {groups.length > 0 ? (
                <select
                  className="input input-inline admin-ungrouped-select"
                  value=""
                  disabled={busy}
                  onChange={(e) => {
                    const v = e.target.value;
                    e.target.value = "";
                    if (v) void onStudentGroupChange(s.uid, v);
                  }}
                  aria-label="Назначить группу"
                >
                  <option value="">В группу…</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
