import { FormEvent, useEffect, useState } from "react";
import type {
  ErrorTemplate,
  ErrorTemplateCategory,
  ErrorTemplateSeverity,
} from "@/types/errorTemplate";

export const CATEGORY_OPTIONS: { value: ErrorTemplateCategory; label: string }[] = [
  { value: "traffic", label: "ПДД" },
  { value: "technique", label: "Техника вождения" },
  { value: "attention", label: "Внимание" },
  { value: "other", label: "Другое" },
];

export const SEVERITY_OPTIONS: { value: ErrorTemplateSeverity; label: string }[] = [
  { value: "low", label: "Низкая" },
  { value: "medium", label: "Средняя" },
  { value: "high", label: "Высокая" },
];

type ErrorTemplateFormProps = {
  open: boolean;
  title: string;
  /** Редактирование существующего шаблона */
  initial?: ErrorTemplate | null;
  submitLabel?: string;
  onSubmit: (data: {
    name: string;
    category: ErrorTemplateCategory;
    severity: ErrorTemplateSeverity;
    description: string;
    points: number;
  }) => Promise<void>;
  onClose: () => void;
};

/**
 * Модалка создания / редактирования пользовательского шаблона ошибки.
 */
export function ErrorTemplateForm({
  open,
  title,
  initial,
  submitLabel = "Сохранить",
  onSubmit,
  onClose,
}: ErrorTemplateFormProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ErrorTemplateCategory>("traffic");
  const [severity, setSeverity] = useState<ErrorTemplateSeverity>("medium");
  const [points, setPoints] = useState(3);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLocalErr(null);
    if (initial) {
      setName(initial.name);
      setCategory(initial.category);
      setSeverity(initial.severity);
      setPoints(initial.points);
      setDescription(initial.description ?? "");
    } else {
      setName("");
      setCategory("traffic");
      setSeverity("medium");
      setPoints(3);
      setDescription("");
    }
  }, [open, initial]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setLocalErr("Укажите название ошибки.");
      return;
    }
    const p = Math.max(0, Math.min(10, Math.floor(Number(points) || 0)));
    setBusy(true);
    setLocalErr(null);
    try {
      await onSubmit({
        name: n,
        category,
        severity,
        description: description.trim(),
        points: p,
      });
      onClose();
    } catch (err) {
      setLocalErr(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="confirm-dialog-backdrop instructor-error-template-form-backdrop"
      role="presentation"
      onClick={() => !busy && onClose()}
    >
      <div
        className="confirm-dialog instructor-error-template-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="error-template-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="error-template-form-title" className="confirm-dialog-title">
          {title}
        </h2>
        <form className="instructor-error-template-form__body" onSubmit={(e) => void handleSubmit(e)}>
          {localErr ? (
            <p className="form-error" role="alert">
              {localErr}
            </p>
          ) : null}
          <label className="field">
            <span className="field-label">Название ошибки</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span className="field-label">Категория</span>
            <select
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value as ErrorTemplateCategory)}
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Серьёзность</span>
            <select
              className="input"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as ErrorTemplateSeverity)}
            >
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Штрафные баллы (0–10)</span>
            <input
              className="input"
              type="number"
              min={0}
              max={10}
              step={1}
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span className="field-label">Описание (необязательно)</span>
            <textarea
              className="input instructor-error-template-form__textarea"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </label>
          <div className="confirm-dialog-actions">
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy ? "Сохранение…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
