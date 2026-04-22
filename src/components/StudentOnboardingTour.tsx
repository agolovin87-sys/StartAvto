import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { useStudentOnboarding } from "@/context/StudentOnboardingContext";

const STORAGE_KEY = "startavto_student_onboarding_v1";

export function hasStudentOnboardingCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markStudentOnboardingCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

type NavTarget = "home" | "chat" | "tickets" | "history" | "settings";

type TourStep = {
  key: string;
  title: string;
  body: string;
  details?: string[];
  navTarget: NavTarget | null;
};

const STEPS: TourStep[] = [
  {
    key: "welcome",
    title: "Кабинет курсанта: как пользоваться",
    body: "Пошагово покажем все разделы и базовые действия, чтобы сразу работать без ошибок.",
    details: [
      "Личный кабинет: профиль, талоны, история вождений, экзамены.",
      "Запись и подтверждение занятий выполняйте только в приложении.",
      "Не передавайте аккаунт третьим лицам: действия фиксируются в системе.",
      "Тур можно пропустить и запустить снова позже в настройках/подсказках.",
    ],
    navTarget: null,
  },
  {
    key: "home",
    title: "Главная",
    body: "Здесь вы работаете с ежедневными задачами и расписанием.",
    details: [
      "Карточка курсанта: статус, баланс талонов, переход в личный кабинет.",
      "Мой инструктор: быстрый звонок и переход в чат.",
      "Свободные окна: бронирование/отмена, статус подтверждения.",
      "График вождения: подтвержденные уроки на неделю, переносы и уведомления.",
      "Во время урока: подтвердите старт вождения, следите за таймером.",
    ],
    navTarget: "home",
  },
  {
    key: "chat",
    title: "Чат",
    body: "Официальный канал общения с инструктором и администрацией.",
    details: [
      "Пишите по занятиям, переносам, документам и организационным вопросам.",
      "Индикатор на вкладке показывает непрочитанные сообщения.",
      "На Android системная кнопка «Назад» возвращает из чата на предыдущую вкладку.",
    ],
    navTarget: "chat",
  },
  {
    key: "tickets",
    title: "Билеты",
    body: "Тренажер теории ПДД для регулярной подготовки к экзаменам.",
    details: [
      "Решайте билеты последовательно и отмечайте сложные темы.",
      "Тренируйтесь короткими сессиями каждый день для стабильного прогресса.",
    ],
    navTarget: "tickets",
  },
  {
    key: "history",
    title: "История",
    body: "Проверяйте факты по занятиям и учету талонов.",
    details: [
      "Журнал вождений: дата, статус, оценки и детали уроков.",
      "История талонов: пополнения, списания, возвраты.",
      "Используйте раздел для сверки спорных ситуаций по расписанию и оплатам.",
    ],
    navTarget: "history",
  },
  {
    key: "settings",
    title: "Настройки",
    body: "Управление профилем и параметрами приложения.",
    details: [
      "Проверьте корректность профиля и контактов.",
      "Включите уведомления, чтобы не пропускать сообщения и напоминания о занятиях.",
      "При проблемах со входом обращайтесь администратору автошколы.",
    ],
    navTarget: "settings",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function readNavButtonRect(navTarget: NavTarget | null): Rect | null {
  if (navTarget == null || typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>(
    `[data-student-onboarding-nav="${navTarget}"]`
  );
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

type Props = {
  suppressed?: boolean;
};

export function StudentOnboardingTour({ suppressed = false }: Props) {
  const onboarding = useStudentOnboarding();
  const tourRequestId = onboarding?.tourRequestId ?? 0;
  const lastHandledRequestId = useRef(0);

  const [open, setOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      !hasStudentOnboardingCompleted() &&
      !suppressed
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [spotRect, setSpotRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (tourRequestId === 0) return;
    if (tourRequestId === lastHandledRequestId.current) return;
    lastHandledRequestId.current = tourRequestId;
    setStepIndex(0);
    setOpen(true);
  }, [tourRequestId]);

  const step = STEPS[stepIndex] ?? STEPS[0];
  const isLast = stepIndex >= STEPS.length - 1;

  const close = useCallback(() => {
    markStudentOnboardingCompleted();
    setOpen(false);
  }, []);

  const skip = useCallback(() => {
    close();
  }, [close]);

  const next = useCallback(() => {
    if (isLast) {
      close();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }, [close, isLast]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") skip();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, skip]);

  useLayoutEffect(() => {
    if (!open || suppressed) return;

    const update = () => {
      const r = readNavButtonRect(step.navTarget);
      setSpotRect(r);
    };

    update();
    const t = window.setTimeout(update, 80);

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, suppressed, step.navTarget, stepIndex]);

  const tooltipStyle = useMemo((): CSSProperties => {
    if (!open) return {};
    const pad = 12;
    const cardMaxW = Math.min(340, typeof window !== "undefined" ? window.innerWidth - 24 : 340);

    if (step.navTarget == null || !spotRect) {
      return {
        position: "fixed",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: cardMaxW,
        maxWidth: "calc(100vw - 1.5rem)",
      };
    }

    const spaceBelow = window.innerHeight - (spotRect.top + spotRect.height);
    const placeAbove = spaceBelow < 200;
    const left = Math.min(
      Math.max(pad, spotRect.left + spotRect.width / 2 - cardMaxW / 2),
      window.innerWidth - cardMaxW - pad
    );

    if (placeAbove) {
      return {
        position: "fixed",
        left,
        bottom: Math.max(pad + 8, window.innerHeight - spotRect.top + pad),
        width: cardMaxW,
        maxWidth: "calc(100vw - 1.5rem)",
      };
    }

    return {
      position: "fixed",
      left,
      top: Math.min(spotRect.top + spotRect.height + pad, window.innerHeight - 220),
      width: cardMaxW,
      maxWidth: "calc(100vw - 1.5rem)",
    };
  }, [open, spotRect, step.navTarget]);

  const spotlightStyle = useMemo((): CSSProperties | null => {
    if (!open || step.navTarget == null || !spotRect) return null;
    const pad = 6;
    return {
      position: "fixed",
      top: spotRect.top - pad,
      left: spotRect.left - pad,
      width: spotRect.width + pad * 2,
      height: spotRect.height + pad * 2,
      borderRadius: 14,
      boxShadow:
        "0 0 0 3px rgba(56, 189, 248, 0.95), 0 0 0 9999px rgba(15, 23, 42, 0.78)",
      pointerEvents: "none",
      zIndex: 100001,
      transition: "top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease",
    };
  }, [open, spotRect, step.navTarget]);

  if (suppressed) {
    return null;
  }

  if (!open) {
    return null;
  }

  const blockerBg =
    step.navTarget == null
      ? "rgba(15, 23, 42, 0.78)"
      : "rgba(15, 23, 42, 0.01)";

  const ui = (
    <div
      className="instructor-onboarding-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-onboarding-title"
      aria-describedby="student-onboarding-desc"
    >
      <div
        className="instructor-onboarding-blocker"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100000,
          background: blockerBg,
          pointerEvents: "auto",
        }}
        aria-hidden
      />
      {step.navTarget != null && spotlightStyle ? (
        <div className="instructor-onboarding-spotlight" style={spotlightStyle} aria-hidden />
      ) : null}

      <div
        className="instructor-onboarding-card glossy-panel"
        style={{
          ...tooltipStyle,
          zIndex: 100002,
          padding: "1rem 1.1rem",
          border: "1px solid rgba(56, 189, 248, 0.35)",
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.45)",
        }}
      >
        <h2 id="student-onboarding-title" className="instructor-onboarding-title">
          {step.title}
        </h2>
        <p id="student-onboarding-desc" className="instructor-onboarding-body">
          {step.body}
        </p>
        {step.details && step.details.length > 0 ? (
          <ul className="instructor-onboarding-list">
            {step.details.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        <div className="instructor-onboarding-footer">
          <span className="instructor-onboarding-step">
            {stepIndex + 1} / {STEPS.length}
          </span>
          <div className="instructor-onboarding-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={skip}>
              Пропустить
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={next}>
              {isLast ? "Понятно" : "Далее"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(ui, document.body);
}
