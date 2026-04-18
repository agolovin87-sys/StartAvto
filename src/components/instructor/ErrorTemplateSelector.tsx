import { useMemo, useState } from "react";
import { CATEGORY_OPTIONS } from "@/components/instructor/ErrorTemplateForm";
import type { ErrorTemplate, LessonDriveError } from "@/types/errorTemplate";

function categoryLabel(c: ErrorTemplate["category"]): string {
  return CATEGORY_OPTIONS.find((x) => x.value === c)?.label ?? c;
}

type ErrorTemplateSelectorProps = {
  /** Список шаблонов (системные + кастомные) с актуальными счётчиками */
  templates: ErrorTemplate[];
  /** Уже отмеченные ошибки в этом уроке */
  lessonErrors: LessonDriveError[];
  /** Выбор шаблона: добавить в урок и обновить счётчик на сервере */
  onPickTemplate: (template: ErrorTemplate) => void | Promise<void>;
  onRemoveError: (errorId: string) => void;
  /** Текстовая ошибка без шаблона (не увеличивает счётчики шаблонов) */
  onAddManualError: (name: string, points: number) => void;
};

/**
 * Панель быстрого выбора ошибок при оценке текущего урока вождения.
 */
export function ErrorTemplateSelector({
  templates,
  lessonErrors,
  onPickTemplate,
  onRemoveError,
  onAddManualError,
}: ErrorTemplateSelectorProps) {
  const [q, setQ] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPoints, setCustomPoints] = useState(2);

  const popular = useMemo(() => {
    return [...templates]
      .sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name))
      .slice(0, 5);
  }, [templates]);

  const suggestions = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return templates
      .filter((t) => t.name.toLowerCase().includes(s))
      .slice(0, 12);
  }, [templates, q]);

  function submitManual() {
    const n = customName.trim();
    if (!n) return;
    const p = Math.max(0, Math.min(10, Math.floor(Number(customPoints) || 0)));
    onAddManualError(n, p);
    setCustomName("");
    setCustomPoints(2);
    setCustomOpen(false);
  }

  return (
    <section className="instructor-error-template-selector" aria-label="Ошибки курсанта на уроке">
      <h3 className="instructor-error-template-selector__title">Ошибки на уроке</h3>

      {lessonErrors.length > 0 ? (
        <ul className="instructor-error-template-selector__list">
          {lessonErrors.map((e) => (
            <li key={e.id} className="instructor-error-template-selector__chip">
              <span className="instructor-error-template-selector__chip-text">
                {e.name}
                <span className="instructor-error-template-selector__chip-points">−{e.points}</span>
              </span>
              <button
                type="button"
                className="instructor-error-template-selector__chip-remove"
                aria-label={`Убрать: ${e.name}`}
                onClick={() => onRemoveError(e.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="instructor-error-template-selector__empty">Пока нет отмеченных ошибок.</p>
      )}

      <div className="instructor-error-template-selector__popular">
        <span className="instructor-error-template-selector__label">Популярные</span>
        <div className="instructor-error-template-selector__popular-btns">
          {popular.map((t) => (
            <button
              key={t.id}
              type="button"
              className="btn btn-ghost btn-sm instructor-error-template-selector__pop-btn"
              title={t.description || t.name}
              onClick={() => void onPickTemplate(t)}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <label className="field instructor-error-template-selector__search">
        <span className="field-label">Найти шаблон</span>
        <input
          className="input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Начните вводить название…"
          autoComplete="off"
        />
      </label>

      {suggestions.length > 0 ? (
        <ul className="instructor-error-template-selector__suggest" role="listbox">
          {suggestions.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className="instructor-error-template-selector__suggest-item"
                onClick={() => {
                  void onPickTemplate(t);
                  setQ("");
                }}
              >
                <span>{t.name}</span>
                <span className="instructor-error-template-selector__suggest-meta">
                  {categoryLabel(t.category)} · {t.points} б.
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="instructor-error-template-selector__manual">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setCustomOpen((v) => !v)}
        >
          {customOpen ? "Скрыть форму" : "+ Своя ошибка"}
        </button>
        {customOpen ? (
          <div className="instructor-error-template-selector__manual-form">
            <input
              className="input"
              placeholder="Кратко опишите ошибку"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              maxLength={200}
            />
            <div className="instructor-error-template-selector__manual-row">
              <label>
                Баллы
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={10}
                  value={customPoints}
                  onChange={(e) => setCustomPoints(Number(e.target.value))}
                />
              </label>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!customName.trim()}
                onClick={submitManual}
              >
                Добавить
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
