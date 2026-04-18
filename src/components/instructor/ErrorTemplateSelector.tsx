import { useMemo, useState } from "react";
import { CATEGORY_OPTIONS } from "@/components/instructor/ErrorTemplateForm";
import type { ErrorTemplate, LessonDriveError } from "@/types/errorTemplate";
import { LESSON_TEMPLATE_ALLOWED_POINTS } from "@/types/errorTemplate";
import type { InternalExamErrorPoints } from "@/types/internalExam";
import {
  INTERNAL_EXAM_ERROR_POINT_ORDER,
  internalExamErrorSubsectionTitle,
} from "@/types/internalExam";

function categoryLabel(c: ErrorTemplate["category"]): string {
  return CATEGORY_OPTIONS.find((x) => x.value === c)?.label ?? c;
}

const TIER_POINT_SET = new Set<number>([...INTERNAL_EXAM_ERROR_POINT_ORDER]);

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
 * Панель выбора ошибок при оценке текущего урока: пункты как в экзаменационном листе, по группам баллов.
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
  const [customPoints, setCustomPoints] =
    useState<(typeof LESSON_TEMPLATE_ALLOWED_POINTS)[number]>(1);
  /** Развёрнутые блоки по баллам (по умолчанию все свёрнуты). */
  const [expandedPointTiers, setExpandedPointTiers] = useState<Set<number>>(() => new Set());
  const [offscaleOpen, setOffscaleOpen] = useState(false);
  /** Вся панель «Ошибки на уроке» (по умолчанию свёрнута). */
  const [panelOpen, setPanelOpen] = useState(false);

  const pickedTemplateIds = useMemo(
    () => new Set(lessonErrors.map((e) => e.templateId)),
    [lessonErrors]
  );

  const templatesByTier = useMemo(() => {
    return INTERNAL_EXAM_ERROR_POINT_ORDER.map((pts) => {
      const list = templates
        .filter((t) => t.points === pts)
        .sort((a, b) => a.name.localeCompare(b.name, "ru"));
      return { pts, list };
    }).filter((x) => x.list.length > 0);
  }, [templates]);

  const offTierTemplates = useMemo(() => {
    return templates
      .filter((t) => !TIER_POINT_SET.has(t.points))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [templates]);

  const suggestions = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return templates
      .filter(
        (t) =>
          t.name.toLowerCase().includes(s) ||
          (t.description && t.description.toLowerCase().includes(s))
      )
      .slice(0, 16);
  }, [templates, q]);

  function submitManual() {
    const n = customName.trim();
    if (!n) return;
    onAddManualError(n, customPoints);
    setCustomName("");
    setCustomPoints(1);
    setCustomOpen(false);
  }

  function togglePointTier(pts: number) {
    setExpandedPointTiers((prev) => {
      const n = new Set(prev);
      if (n.has(pts)) n.delete(pts);
      else n.add(pts);
      return n;
    });
  }

  const panelBodyId = "instructor-lesson-errors-panel";

  return (
    <section className="instructor-error-template-selector" aria-label="Ошибки курсанта на уроке">
      <button
        type="button"
        className="instructor-error-template-selector__panel-toggle instructor-home-section-toggle"
        aria-expanded={panelOpen}
        aria-controls={panelBodyId}
        id="instructor-lesson-errors-heading"
        onClick={() => setPanelOpen((v) => !v)}
      >
        <span className="instructor-home-section-toggle-label">Ошибки на уроке</span>
        {lessonErrors.length > 0 ? (
          <span className="instructor-home-section-toggle-meta">{lessonErrors.length}</span>
        ) : null}
        <span className="instructor-error-template-selector__panel-chevron" aria-hidden>
          {panelOpen ? "▼" : "▶"}
        </span>
      </button>

      <div
        id={panelBodyId}
        className="instructor-error-template-selector__panel-body"
        hidden={!panelOpen}
        role="region"
        aria-labelledby="instructor-lesson-errors-heading"
      >
        <label className="field instructor-error-template-selector__search">
          <span className="field-label">Найти шаблон</span>
          <input
            className="input"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Начните вводить текст пункта…"
            autoComplete="off"
          />
        </label>

        {suggestions.length > 0 ? (
          <ul className="instructor-error-template-selector__suggest" role="listbox">
            {suggestions.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`instructor-error-template-selector__suggest-item${pickedTemplateIds.has(t.id) ? " instructor-error-template-selector__suggest-item--picked" : ""}`}
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

        {lessonErrors.length > 0 ? (
          <ul className="instructor-error-template-selector__list">
            {lessonErrors.map((e) => (
              <li
                key={e.id}
                className="instructor-error-template-selector__chip instructor-error-template-selector__chip--picked"
              >
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

        <p className="instructor-error-template-selector__exam-hint field-hint">
          Те же формулировки и штрафные баллы, что в экзаменационном листе. Сначала 7, затем 5, 4, 3, 2, 1
          балл.
        </p>

        <div className="instructor-error-template-selector__tiers">
        {templatesByTier.map(({ pts, list }) => {
          const open = expandedPointTiers.has(pts);
          return (
            <div key={pts} className="instructor-error-template-selector__tier">
              <button
                type="button"
                className="instructor-error-template-selector__tier-head"
                aria-expanded={open}
                onClick={() => togglePointTier(pts)}
              >
                <span className="instructor-error-template-selector__tier-title">
                  {internalExamErrorSubsectionTitle(pts)}
                </span>
                <span className="instructor-error-template-selector__tier-count">{list.length}</span>
                <span className="instructor-error-template-selector__tier-chevron" aria-hidden>
                  {open ? "▼" : "▶"}
                </span>
              </button>
              {open ? (
                <div className="instructor-error-template-selector__tier-btns">
                  {list.map((t) => {
                    const picked = pickedTemplateIds.has(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`btn btn-ghost btn-sm instructor-error-template-selector__tier-btn${picked ? " instructor-error-template-selector__tier-btn--picked" : ""}`}
                        title={t.description || t.name}
                        onClick={() => void onPickTemplate(t)}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {offTierTemplates.length > 0 ? (
        <div className="instructor-error-template-selector__tier instructor-error-template-selector__tier--offscale">
          <button
            type="button"
            className="instructor-error-template-selector__tier-head"
            aria-expanded={offscaleOpen}
            onClick={() => setOffscaleOpen((v) => !v)}
          >
            <span className="instructor-error-template-selector__tier-title">
              Свои шаблоны (другие баллы)
            </span>
            <span className="instructor-error-template-selector__tier-count">{offTierTemplates.length}</span>
            <span className="instructor-error-template-selector__tier-chevron" aria-hidden>
              {offscaleOpen ? "▼" : "▶"}
            </span>
          </button>
          {offscaleOpen ? (
            <div className="instructor-error-template-selector__tier-btns">
              {offTierTemplates.map((t) => {
                const picked = pickedTemplateIds.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`btn btn-ghost btn-sm instructor-error-template-selector__tier-btn${picked ? " instructor-error-template-selector__tier-btn--picked" : ""}`}
                    title={t.description || t.name}
                    onClick={() => void onPickTemplate(t)}
                  >
                    <span className="instructor-error-template-selector__tier-btn-name">{t.name}</span>
                    <span className="instructor-error-template-selector__tier-btn-meta">{t.points} б.</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
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
              <label className="instructor-error-template-selector__manual-points">
                <span className="field-label">Баллы</span>
                <select
                  className="input"
                  value={customPoints}
                  onChange={(e) =>
                    setCustomPoints(
                      Number(e.target.value) as (typeof LESSON_TEMPLATE_ALLOWED_POINTS)[number]
                    )
                  }
                >
                  {LESSON_TEMPLATE_ALLOWED_POINTS.map((p) => (
                    <option key={p} value={p}>
                      {internalExamErrorSubsectionTitle(p as InternalExamErrorPoints)}
                    </option>
                  ))}
                </select>
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
      </div>
    </section>
  );
}
