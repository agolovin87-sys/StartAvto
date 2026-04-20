import { useCallback, useEffect, useState } from "react";
import type { TrainingGroup } from "@/types";
import type { AdminScheduledExam, AdminScheduledExamType } from "@/types/scheduledExam";
import { ADMIN_SCHEDULED_EXAM_TYPE_LABEL } from "@/types/scheduledExam";
import {
  createAdminScheduledExam,
  deleteAdminScheduledExam,
  subscribeAdminScheduledExamsByGroup,
} from "@/services/scheduledExamService";
import { ConfirmDialog } from "@/components/ConfirmDialog";

function formatRuDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

type Props = {
  groups: TrainingGroup[];
  groupId: string;
};

export function AdminScheduledExamsSubsection({ groups, groupId }: Props) {
  const [rows, setRows] = useState<AdminScheduledExam[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [formGroupId, setFormGroupId] = useState("");
  const [formType, setFormType] = useState<AdminScheduledExamType>("internal_theory");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("09:00");

  const openModal = useCallback(() => {
    setErr(null);
    setFormGroupId(groupId.trim() || (groups[0]?.id ?? ""));
    setFormType("internal_theory");
    setFormDate("");
    setFormTime("09:00");
    setModalOpen(true);
  }, [groupId, groups]);

  useEffect(() => {
    const gid = groupId.trim();
    if (!gid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    const unsub = subscribeAdminScheduledExamsByGroup(
      gid,
      (list) => {
        setRows(list);
        setLoading(false);
      },
      (e) => {
        setErr(e.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [groupId]);

  async function onCreate() {
    const gid = formGroupId.trim();
    if (!gid || !formDate.trim()) {
      setErr("Укажите группу и дату.");
      return;
    }
    const g = groups.find((x) => x.id === gid);
    setCreateBusy(true);
    setErr(null);
    try {
      await createAdminScheduledExam({
        groupId: gid,
        groupName: g?.name?.trim() ?? "",
        examType: formType,
        examDate: formDate.trim(),
        examTime: formTime.trim() || "09:00",
      });
      setModalOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось создать");
    } finally {
      setCreateBusy(false);
    }
  }

  async function onConfirmDelete() {
    if (!deleteId) return;
    setDeleteBusy(true);
    setErr(null);
    try {
      await deleteAdminScheduledExam(deleteId);
      setDeleteId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось удалить");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="admin-scheduled-exams-sub">
      <div className="admin-scheduled-exams-sub__head">
        <h3 className="admin-scheduled-exams-sub__title">Экзамены</h3>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!groupId.trim()}
          onClick={openModal}
        >
          Создать
        </button>
      </div>
      {!groupId.trim() ? (
        <p className="admin-settings-section-desc">Выберите учебную группу выше, чтобы видеть и создавать записи.</p>
      ) : loading ? (
        <p className="admin-settings-section-desc">Загрузка…</p>
      ) : (
        <div className="admin-schedule-table-wrap admin-internal-exam-table-wrap">
          <table className="admin-schedule-table">
            <thead>
              <tr>
                <th>Тип экзамена</th>
                <th>Дата и время</th>
                <th style={{ width: "6rem" }} aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="admin-schedule-table-empty">
                    Нет запланированных экзаменов для этой группы.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>{ADMIN_SCHEDULED_EXAM_TYPE_LABEL[r.examType]}</td>
                    <td>
                      {formatRuDate(r.examDate)} · {r.examTime}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => setDeleteId(r.id)}
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
      {err ? (
        <p className="form-error" role="alert">
          {err}
        </p>
      ) : null}

      {modalOpen ? (
        <div
          className="confirm-dialog-backdrop"
          role="presentation"
          onClick={() => !createBusy && setModalOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !createBusy) setModalOpen(false);
          }}
        >
          <div
            className="confirm-dialog admin-scheduled-exams-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-sched-exam-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="admin-sched-exam-modal-title" className="confirm-dialog-title">
              Новая запись экзамена
            </h2>
            <div className="admin-scheduled-exams-modal__fields">
              <label className="field">
                <span className="field-label">Группа</span>
                <select
                  className="input"
                  value={formGroupId}
                  onChange={(e) => setFormGroupId(e.target.value)}
                >
                  <option value="">— Выберите группу —</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Тип экзамена</span>
                <select
                  className="input"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as AdminScheduledExamType)}
                >
                  <option value="internal_theory">{ADMIN_SCHEDULED_EXAM_TYPE_LABEL.internal_theory}</option>
                  <option value="gibdd_reo">{ADMIN_SCHEDULED_EXAM_TYPE_LABEL.gibdd_reo}</option>
                </select>
              </label>
              <label className="field">
                <span className="field-label">Дата</span>
                <input
                  className="input"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">Время</span>
                <input
                  className="input"
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                />
              </label>
            </div>
            <div className="confirm-dialog-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={createBusy}
                onClick={() => setModalOpen(false)}
              >
                Отменить
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={createBusy || !formGroupId.trim() || !formDate.trim()}
                onClick={() => void onCreate()}
              >
                {createBusy ? "Создание…" : "Создать"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={deleteId != null}
        title="Удалить запись?"
        message="Запись будет удалена для всей группы. Продолжить?"
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        onConfirm={() => {
          if (!deleteBusy) void onConfirmDelete();
        }}
        onCancel={() => {
          if (!deleteBusy) setDeleteId(null);
        }}
      />
    </div>
  );
}
