import { useNavigate } from "react-router-dom";

/** К «Главной» родительского раздела (`..` от `/app/…/cabinet`). */
export function CabinetBackToDashboardButton() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="student-cab-back-ico-btn"
      onClick={() => navigate("..")}
      aria-label="Назад к главной"
      title="Назад"
    >
      <svg className="student-cab-back-ico" viewBox="0 0 24 24" aria-hidden>
        <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
      </svg>
    </button>
  );
}
