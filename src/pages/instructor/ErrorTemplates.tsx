import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  CATEGORY_OPTIONS,
  ErrorTemplateForm,
  SEVERITY_OPTIONS,
} from "@/components/instructor/ErrorTemplateForm";
import { useAuth } from "@/context/AuthContext";
import { useErrorTemplates } from "@/hooks/useErrorTemplates";
import { incrementUsage } from "@/services/errorTemplateService";
import type { ErrorTemplate, ErrorTemplateCategory, ErrorTemplateSeverity } from "@/types/errorTemplate";
import { hapticSuccess } from "@/utils/haptics";

function categoryLabel(c: ErrorTemplateCategory): string {
  return CATEGORY_OPTIONS.find((x) => x.value === c)?.label ?? c;
}

function severityLabel(s: ErrorTemplateSeverity): string {
  return SEVERITY_OPTIONS.find((x) => x.value === s)?.label ?? s;
}

function categoryClass(c: ErrorTemplateCategory): string {
  switch (c) {
    case "traffic":
      return "instructor-error-template-tag--traffic";
    case "technique":
      return "instructor-error-template-tag--technique";
    case "attention":
      return "instructor-error-template-tag--attention";
    default:
      return "instructor-error-template-tag--other";
  }
}

/**
 * Страница управления шаблонами ошибок (системные + свои) для инструктора.
 */
export function ErrorTemplates() {
  const { user } = useAuth();
  const instructorId = user?.uid ?? "";
  const { templates, loading, addTemplate, updateTemplate, deleteTemplate } =
    useErrorTemplates(instructorId);

  const [tab, setTab] = useState<"all" | "mine">("all");
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<ErrorTemplateCategory | "">("");
  const [sevFilter, setSevFilter] = useState<ErrorTemplateSeverity | "">("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ErrorTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ErrorTemplate | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list =
      tab === "mine" ? templates.filter((t) => t.isCustom) : [...templates];
    if (q) {
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }
    if (catFilter) {
      list = list.filter((t) => t.category === catFilter);
    }
    if (sevFilter) {
      list = list.filter((t) => t.severity === sevFilter);
    }
    return list;
  }, [templates, tab, search, catFilter, sevFilter]);

  async function onUse(t: ErrorTemplate) {
    if (!instructorId) return;
    await incrementUsage(instructorId, t.id);
    hapticSuccess();
    setToast(`Учтено использование: «${t.name}»`);
    window.setTimeout(() => setToast(null), 2500);
  }

  return (
    <div className="admin-tab instructor-error-templates-page">
      <h1 className="admin-tab-title">Шаблоны ошибок</h1>
      <p className="instructor-error-templates-lead">
        Готовые формулировки для оценки урока. Системные шаблоны нельзя изменить; свои можно
        редактировать и удалять. Счётчик «использований» растёт при выборе шаблона на уроке или
        кнопкой «Использовать» ниже.
      </p>

      <div className="instructor-error-templates-toolbar" role="tablist" aria-label="Раздел шаблонов">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          className={tab === "all" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
          onClick={() => setTab("all")}
        >
          Все шаблоны
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "mine"}
          className={tab === "mine" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
          onClick={() => setTab("mine")}
        >
          Мои шаблоны
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm instructor-error-templates-create"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Создать шаблон
        </button>
      </div>

      <div className="instructor-error-templates-filters">
        <label className="instructor-error-templates-filter">
          <input
            className="input"
            type="search"
            placeholder="Поиск по названию…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Поиск по названию"
          />
        </label>
        <label className="instructor-error-templates-filter">
          <span className="field-label">Категория</span>
          <select
            className="input"
            value={catFilter}
            onChange={(e) => setCatFilter((e.target.value || "") as ErrorTemplateCategory | "")}
          >
            <option value="">Все</option>
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="instructor-error-templates-filter">
          <span className="field-label">Серьёзность</span>
          <select
            className="input"
            value={sevFilter}
            onChange={(e) => setSevFilter((e.target.value || "") as ErrorTemplateSeverity | "")}
          >
            <option value="">Все</option>
            {SEVERITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {toast ? (
        <p className="form-hint instructor-error-templates-toast" role="status">
          {toast}
        </p>
      ) : null}

      {loading ? (
        <p className="admin-settings-section-desc">Загрузка шаблонов…</p>
      ) : filtered.length === 0 ? (
        <p className="admin-settings-section-desc">Нет шаблонов по выбранным условиям.</p>
      ) : (
        <ul className="instructor-error-template-cards">
          {filtered.map((t) => (
            <li key={t.id} className="instructor-error-template-card">
              <div className="instructor-error-template-card__head">
                <h3 className="instructor-error-template-card__title">{t.name}</h3>
                <span
                  className={`instructor-error-template-tag ${categoryClass(t.category)}`}
                  title={categoryLabel(t.category)}
                >
                  {categoryLabel(t.category)}
                </span>
              </div>
              {t.description ? (
                <p className="instructor-error-template-card__desc">{t.description}</p>
              ) : null}
              <div className="instructor-error-template-card__meta">
                <span>Серьёзность: {severityLabel(t.severity)}</span>
                <span>Баллы: {t.points}</span>
                <span>Использований: {t.usageCount}</span>
                {!t.isCustom ? <span className="instructor-error-template-card__sys">Системный</span> : null}
              </div>
              <div className="instructor-error-template-card__actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => void onUse(t)}
                >
                  Использовать
                </button>
                {t.isCustom ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setEditing(t);
                        setFormOpen(true);
                      }}
                    >
                      Редактировать
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => setDeleteTarget(t)}
                    >
                      Удалить
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ErrorTemplateForm
        open={formOpen}
        title={editing ? "Редактировать шаблон" : "Новый шаблон"}
        initial={editing}
        submitLabel={editing ? "Сохранить" : "Создать"}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={async (data) => {
          if (editing) {
            await updateTemplate(editing.id, data);
          } else {
            await addTemplate(data);
          }
        }}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        title="Удалить шаблон?"
        message={
          deleteTarget
            ? `Шаблон «${deleteTarget.name}» будет удалён. Счётчик использований для него тоже сбросится.`
            : ""
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        onConfirm={() => {
          const id = deleteTarget?.id;
          setDeleteTarget(null);
          if (id) void deleteTemplate(id);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
