import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/context/AuthContext";
import { useChatNav } from "@/context/ChatNavContext";
import { initialsFromFullName, avatarHueFromUid } from "@/admin/instructorAvatar";
import { formatShortFio } from "@/admin/formatShortFio";
import { CabinetClientKindBadge } from "@/components/CabinetClientKindBadge";
import { isValidRuMobilePhone, normalizeRuPhone } from "@/lib/phoneRu";
import { mapFirebaseError } from "@/firebase/errors";
import {
  attachStudentToInstructor,
  createTrainingGroup,
  deleteTrainingGroup,
  removeStudentFromInstructor,
  setStudentGroup,
  setUserAccountStatus,
  subscribeInstructors,
  subscribeStudents,
  subscribeTrainingGroups,
  updateTrainingGroup,
  updateUserProfileFields,
} from "@/firebase/admin";
import {
  linkTrainingGroupToChatGroup,
  subscribeChatRoomsForUser,
} from "@/firebase/chat";
import type {
  AccountStatus,
  ChatRoom,
  TrainingGroup,
  UserProfile,
  UserRole,
} from "@/types";
import { isPresenceEffectivelyOnline } from "@/utils/presence";

const statusLabel: Record<AccountStatus, string> = {
  pending: "Ожидает",
  active: "Активен",
  inactive: "Деактивирован",
  rejected: "Удалён",
};

const roleLabelRu: Record<UserRole, string> = {
  student: "Курсант",
  instructor: "Инструктор",
  admin: "Администратор",
};

function telHrefFromPhone(phone: string): string | undefined {
  const n = normalizeRuPhone(phone);
  return n && isValidRuMobilePhone(n) ? `tel:${n}` : undefined;
}

function formatRuDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDayFromInput(str: string): number {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d).getTime();
}

function endOfDayFromInput(str: string): number {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

function instructorShortForStudent(
  studentUid: string,
  instructors: UserProfile[]
): string | null {
  const uid = instructorUidForStudent(studentUid, instructors);
  if (!uid) return null;
  const ins = instructors.find((i) => i.uid === uid);
  return ins ? formatShortFio(ins.displayName) : null;
}

function instructorUidForStudent(
  studentUid: string,
  instructors: UserProfile[]
): string | null {
  for (const ins of instructors) {
    if (ins.role !== "instructor") continue;
    if (ins.accountStatus === "rejected") continue;
    if ((ins.attachedStudentIds ?? []).includes(studentUid)) {
      return ins.uid;
    }
  }
  return null;
}

function registeredInstructorsList(instructors: UserProfile[]): UserProfile[] {
  return instructors
    .filter(
      (u) =>
        u.role === "instructor" && u.accountStatus !== "rejected"
    )
    .slice()
    .sort((a, b) =>
      a.displayName.localeCompare(b.displayName, "ru", { sensitivity: "base" })
    );
}

function IconCollapseCard() {
  return (
    <svg className="instructor-ico-btn" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M7 14l5-5 5 5z" />
    </svg>
  );
}

function IconMinus() {
  return (
    <svg className="instructor-ico-btn" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M19 13H5v-2h14v2z" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg className="instructor-ico-btn" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"
      />
    </svg>
  );
}

function IconSave() {
  return (
    <svg className="instructor-ico-btn" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
      />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg className="instructor-ico-btn" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
      />
    </svg>
  );
}

function IconEmail() {
  return (
    <svg className="instructor-ico instructor-ico-line" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5L4 8V6l8 5 8-5v2z"
      />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg className="instructor-ico instructor-ico-line" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
      />
    </svg>
  );
}

function IconTalons() {
  return (
    <svg className="instructor-ico instructor-ico-line" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
      />
    </svg>
  );
}

function IconInstructorGlyph() {
  return (
    <svg className="instructor-ico instructor-ico-line" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
      />
    </svg>
  );
}

function IconDrives() {
  return (
    <svg className="instructor-ico instructor-ico-line" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"
      />
    </svg>
  );
}

function IconRole() {
  return (
    <svg className="instr-meta-ico" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
      />
    </svg>
  );
}

function IconStatusIco() {
  return (
    <svg className="instr-meta-ico" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
      />
    </svg>
  );
}

function IconChat() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
      />
    </svg>
  );
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`instr-chevron${open ? " is-open" : ""}`}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path fill="currentColor" d="M7 10l5 5 5-5z" />
    </svg>
  );
}

function GroupMemberStudentCard({
  student,
  instructorShort,
  instructors,
  busy,
  onRemoveFromGroup,
}: {
  student: UserProfile;
  instructorShort: string | null;
  instructors: UserProfile[];
  busy: boolean;
  onRemoveFromGroup: () => void;
}) {
  const chatNav = useChatNav();
  const [open, setOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState(student.displayName);
  const [editPhone, setEditPhone] = useState(student.phone);
  const [editRole, setEditRole] = useState<UserRole>(student.role);
  const [editInstructorUid, setEditInstructorUid] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [talonsDelta, setTalonsDelta] = useState(0);
  const [talonsBusy, setTalonsBusy] = useState(false);
  /** Сразу после сохранения показываем число из ответа, пока не придёт snapshot */
  const [talonsCommittedOverride, setTalonsCommittedOverride] = useState<number | null>(null);

  const instructorPickList = useMemo(
    () => registeredInstructorsList(instructors),
    [instructors]
  );

  const hue = avatarHueFromUid(student.uid);
  const initials = initialsFromFullName(student.displayName);
  const presenceOnline = isPresenceEffectivelyOnline(student.presence);
  const instructorText = instructorShort ?? "не назначен";
  const baseTalons = talonsCommittedOverride ?? student.talons;
  const telHref = telHrefFromPhone(student.phone);

  useEffect(() => {
    setEditDisplayName(student.displayName);
    setEditPhone(student.phone);
    setEditRole(student.role);
    setEditInstructorUid("");
    setEditMode(false);
    setLocalErr(null);
  }, [student]);

  useEffect(() => {
    setTalonsDelta(0);
    setTalonsCommittedOverride(null);
  }, [student.uid]);

  function enterEditMode() {
    setEditDisplayName(student.displayName);
    setEditPhone(student.phone);
    setEditRole(student.role);
    setEditInstructorUid(
      instructorUidForStudent(student.uid, instructors) ?? ""
    );
    setLocalErr(null);
    setEditMode(true);
  }

  async function saveProfileEdit() {
    const phoneNorm = normalizeRuPhone(editPhone);
    if (!phoneNorm || !isValidRuMobilePhone(phoneNorm)) {
      setLocalErr("Телефон: формат +7 и 10 цифр.");
      return;
    }
    if (!editDisplayName.trim()) {
      setLocalErr("Укажите ФИО.");
      return;
    }
    setCardBusy(true);
    setLocalErr(null);
    try {
      await updateUserProfileFields(student.uid, {
        displayName: editDisplayName.trim(),
        role: editRole,
        phone: phoneNorm,
      });
      const prevIns = instructorUidForStudent(student.uid, instructors);
      const nextIns = editInstructorUid.trim() || null;
      if (prevIns !== nextIns) {
        if (nextIns) {
          await attachStudentToInstructor(nextIns, student.uid);
        } else if (prevIns) {
          await removeStudentFromInstructor(prevIns, student.uid);
        }
      }
      setEditMode(false);
    } catch (e: unknown) {
      setLocalErr(mapFirebaseError(e));
    } finally {
      setCardBusy(false);
    }
  }

  async function saveTalons() {
    const next = Math.max(0, baseTalons + talonsDelta);
    setTalonsBusy(true);
    setLocalErr(null);
    try {
      await updateUserProfileFields(student.uid, { talons: next });
      setTalonsCommittedOverride(next);
      setTalonsDelta(0);
    } catch (e: unknown) {
      setLocalErr(e instanceof Error ? e.message : "Не удалось сохранить талоны");
    } finally {
      setTalonsBusy(false);
    }
  }

  async function deactivateStudent() {
    if (!confirm("Деактивировать курсанта? Вход будет закрыт.")) return;
    setCardBusy(true);
    try {
      await setUserAccountStatus(student.uid, "inactive");
    } finally {
      setCardBusy(false);
    }
  }

  async function removeStudentFromSystem() {
    if (
      !confirm(
        "Удалить курсанта из системы? Учётная запись будет закрыта, связи с инструкторами и группой снимутся."
      )
    )
      return;
    setCardBusy(true);
    try {
      for (const ins of instructors) {
        if (ins.role !== "instructor") continue;
        if ((ins.attachedStudentIds ?? []).includes(student.uid)) {
          await removeStudentFromInstructor(ins.uid, student.uid);
        }
      }
      await setStudentGroup(student.uid, null);
      await setUserAccountStatus(student.uid, "rejected");
    } finally {
      setCardBusy(false);
    }
  }

  const actionBusy = busy || cardBusy;
  const talonsDisabled = actionBusy || talonsBusy;
  const effectiveTalons = Math.max(0, baseTalons + talonsDelta);
  const zeroTalonsWarning = effectiveTalons === 0;

  return (
    <li className="instructor-card-outer">
      <div
        className={`instructor-card instructor-card--student ${open ? "is-expanded" : ""}`}
      >
        <div className="instructor-preview-bar">
          <button
            type="button"
            className="instructor-card-preview instructor-card-preview--student glossy-panel"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            <span className="instructor-avatar-wrap">
              <span
                className={
                  student.avatarDataUrl
                    ? "instructor-avatar instructor-avatar--photo"
                    : "instructor-avatar"
                }
                style={
                  student.avatarDataUrl ? undefined : { background: `hsl(${hue} 42% 40%)` }
                }
              >
                {student.avatarDataUrl ? (
                  <img
                    src={student.avatarDataUrl}
                    alt=""
                    className="instructor-avatar-img"
                  />
                ) : (
                  initials
                )}
              </span>
              <span
                className={
                  presenceOnline
                    ? "chat-contact-status-dot chat-contact-status-dot--online"
                    : "chat-contact-status-dot chat-contact-status-dot--offline"
                }
                aria-hidden
              />
            </span>
            <span className="instructor-preview-text">
              <span className="instructor-preview-name">
                {formatShortFio(student.displayName)}
                <CabinetClientKindBadge kind={student.lastCabinetClientKind} />
              </span>
              <span className="instructor-preview-role-row">
                <IconRole />
                <span>Роль: {roleLabelRu[student.role]}</span>
              </span>
              <span className="instructor-preview-status-row">
                <IconStatusIco />
                <span>Статус:</span>
                <span
                  className={`instructor-status instructor-status--${student.accountStatus}`}
                >
                  {statusLabel[student.accountStatus]}
                </span>
              </span>
              <span
                className={
                  zeroTalonsWarning
                    ? "instructor-preview-status-row instructor-preview-talons-zero"
                    : "instructor-preview-status-row"
                }
                title={
                  zeroTalonsWarning
                    ? "Нет талонов — необходимо пополнение"
                    : undefined
                }
              >
                <IconTalons />
                <span>Талоны: {effectiveTalons}</span>
              </span>
            </span>
            <IconChevron open={open} />
          </button>
          <div
            className="instructor-preview-actions"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            {telHref ? (
              <a
                href={telHref}
                className="instr-side-btn instr-side-call glossy-btn"
                aria-label="Позвонить"
              >
                <IconPhone />
              </a>
            ) : (
              <span
                className="instr-side-btn instr-side-call instr-side-btn--disabled"
                aria-hidden
              >
                <IconPhone />
              </span>
            )}
            {chatNav ? (
              <button
                type="button"
                className="instr-side-btn instr-side-chat glossy-btn"
                aria-label="Чат"
                onClick={() => chatNav.openChatWithUser(student.uid)}
              >
                <IconChat />
              </button>
            ) : (
              <span
                className="instr-side-btn instr-side-chat instr-side-btn--disabled"
                aria-hidden
              >
                <IconChat />
              </span>
            )}
            <button
              type="button"
              className="icon-pill icon-pill-talons-minus glossy-btn"
              title="Убрать из группы"
              disabled={actionBusy}
              onClick={() => onRemoveFromGroup()}
            >
              <IconMinus />
            </button>
          </div>
        </div>

        {open ? (
          <div className="instructor-card-expanded">
            {localErr ? (
              <div className="form-error" role="alert">
                {localErr}
              </div>
            ) : null}

            <div className="instructor-expanded-head">
              <span className="instructor-avatar-wrap">
                <span
                  className={
                    student.avatarDataUrl
                      ? "instructor-avatar instructor-avatar-lg instructor-avatar--photo"
                      : "instructor-avatar instructor-avatar-lg"
                  }
                  style={
                    student.avatarDataUrl ? undefined : { background: `hsl(${hue} 42% 40%)` }
                  }
                >
                  {student.avatarDataUrl ? (
                    <img
                      src={student.avatarDataUrl}
                      alt=""
                      className="instructor-avatar-img"
                    />
                  ) : (
                    initials
                  )}
                </span>
                <span
                  className={
                    presenceOnline
                      ? "chat-contact-status-dot chat-contact-status-dot--online"
                      : "chat-contact-status-dot chat-contact-status-dot--offline"
                  }
                  aria-hidden
                />
              </span>
              <div className="instructor-expanded-title">
                {editMode ? (
                  <input
                    className="input"
                    type="text"
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    placeholder="ФИО"
                  />
                ) : (
                  <h2 className="instructor-card-name instructor-card-name--full">
                    {student.displayName}
                  </h2>
                )}
                {editMode ? (
                  <p className="instructor-edit-role-only">
                    <select
                      className="input input-inline"
                      value={editRole}
                      onChange={(e) =>
                        setEditRole(e.target.value as UserRole)
                      }
                      aria-label="Роль"
                    >
                      <option value="student">Курсант</option>
                      <option value="instructor">Инструктор</option>
                    </select>
                  </p>
                ) : null}
              </div>
            </div>

            <dl className="instructor-dl">
              <div className="instr-row">
                <dt>
                  <span className="instr-dt-inner">
                    <IconEmail />
                    <span className="instr-dt-text">Email:</span>
                  </span>
                </dt>
                <dd className="instr-dd-fixed">
                  <span className="instr-field-readonly">{student.email}</span>
                </dd>
              </div>
              <div className="instr-row">
                <dt>
                  <span className="instr-dt-inner">
                    <IconPhone />
                    <span className="instr-dt-text">Телефон:</span>
                  </span>
                </dt>
                <dd className="instr-dd-fixed">
                  {editMode ? (
                    <input
                      className="input instr-input-fixed"
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                    />
                  ) : (
                    <span className="instr-field-readonly">
                      {student.phone || "—"}
                    </span>
                  )}
                </dd>
              </div>
              <div className="instr-row instr-row-talons">
                <dt>
                  <span className="instr-dt-inner">
                    <IconTalons />
                    <span className="instr-dt-text">Талоны:</span>
                  </span>
                </dt>
                <dd className="instr-dd-talons">
                  <span className="instr-talons-main instr-field-readonly">
                    {baseTalons}
                    {talonsDelta !== 0 ? (
                      <span className="instr-talons-delta">
                        {" "}
                        ({talonsDelta > 0 ? "+" : ""}
                        {talonsDelta})
                      </span>
                    ) : null}
                  </span>
                  <span className="instr-talons-actions">
                    <button
                      type="button"
                      className="icon-pill icon-pill-talons-minus glossy-btn"
                      disabled={talonsDisabled}
                      title="Списать"
                      onClick={() => setTalonsDelta((d) => d - 1)}
                    >
                      <IconMinus />
                    </button>
                    <button
                      type="button"
                      className="icon-pill icon-pill-talons-plus glossy-btn"
                      disabled={talonsDisabled}
                      title="Зачислить"
                      onClick={() => setTalonsDelta((d) => d + 1)}
                    >
                      <IconPlus />
                    </button>
                    <button
                      type="button"
                      className="icon-pill icon-pill-talons-save glossy-btn"
                      disabled={talonsDisabled || talonsDelta === 0}
                      title="Сохранить талоны"
                      onClick={() => void saveTalons()}
                    >
                      <IconSave />
                    </button>
                  </span>
                </dd>
              </div>
              <div className="instr-row">
                <dt>
                  <span className="instr-dt-inner">
                    <IconDrives />
                    <span className="instr-dt-text">Количество вождений:</span>
                  </span>
                </dt>
                <dd className="instr-dd-fixed">
                  <span className="instr-field-readonly">
                    {student.drivesCount}
                  </span>
                </dd>
              </div>
              <div className="instr-row">
                <dt>
                  <span className="instr-dt-inner">
                    <IconInstructorGlyph />
                    <span className="instr-dt-text">Инструктор:</span>
                  </span>
                </dt>
                <dd className="instr-dd-fixed">
                  {editMode ? (
                    <select
                      className="input instr-input-fixed"
                      value={editInstructorUid}
                      onChange={(e) => setEditInstructorUid(e.target.value)}
                      aria-label="Инструктор"
                    >
                      <option value="">Не назначен</option>
                      {instructorPickList.map((ins) => (
                        <option key={ins.uid} value={ins.uid}>
                          {ins.displayName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="instr-field-readonly">{instructorText}</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="instructor-edit-bar">
              <button
                type="button"
                className="btn btn-ghost btn-sm instructor-edit-toggle glossy-btn"
                disabled={actionBusy}
                onClick={() => {
                  if (editMode) void saveProfileEdit();
                  else enterEditMode();
                }}
              >
                {editMode ? (
                  <>
                    <IconSave /> Сохранить
                  </>
                ) : (
                  <>
                    <IconEdit /> Редактировать
                  </>
                )}
              </button>
            </div>

            <div className="instructor-card-actions">
              <div className="instructor-card-actions-left">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm glossy-btn"
                  disabled={actionBusy || student.accountStatus !== "active"}
                  onClick={() => void deactivateStudent()}
                >
                  Деактивировать
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm glossy-btn"
                  disabled={actionBusy}
                  onClick={() => void removeStudentFromSystem()}
                >
                  Удалить
                </button>
              </div>
              <button
                type="button"
                className="instructor-card-collapse-btn glossy-btn"
                title="Свернуть карточку"
                aria-label="Свернуть карточку"
                onClick={() => {
                  setEditMode(false);
                  setOpen(false);
                }}
              >
                <IconCollapseCard />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function GroupCard({
  group,
  members,
  instructors,
  busy,
  groupChats,
  onEdit,
  onDeleteRequest,
  onRemoveMember,
  onLinkedChatChange,
}: {
  group: TrainingGroup;
  members: UserProfile[];
  instructors: UserProfile[];
  busy: boolean;
  groupChats: ChatRoom[];
  onEdit: () => void;
  onDeleteRequest: () => void;
  onRemoveMember: (studentUid: string) => void;
  onLinkedChatChange: (trainingGroupId: string, chatId: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hue = avatarHueFromUid(group.id);
  const initials = initialsFromFullName(group.name);
  const periodText =
    group.hasTrainingPeriod &&
    group.trainingStartMs != null &&
    group.trainingEndMs != null
      ? `${formatRuDate(group.trainingStartMs)} — ${formatRuDate(group.trainingEndMs)}`
      : "Без срока";

  return (
    <li className="instructor-card-outer">
      <div
        className={`instructor-card instructor-card--student ${expanded ? "is-expanded" : ""}`}
      >
        <div className="instructor-preview-bar">
          <button
            type="button"
            className="instructor-card-preview instructor-card-preview--student glossy-panel"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
          >
            <span
              className="instructor-avatar"
              style={{ background: `hsl(${hue} 42% 40%)` }}
            >
              {initials}
            </span>
            <span className="instructor-preview-text">
              <span className="instructor-preview-name">{group.name}</span>
              <span className="instructor-preview-role-row">
                <span>{periodText}</span>
              </span>
              <span className="instructor-preview-status-row">
                <span>Курсантов: {members.length}</span>
              </span>
            </span>
            <IconChevron open={expanded} />
          </button>
        </div>

        {expanded ? (
          <div className="instructor-card-expanded">
            <div className="admin-group-linked-chat">
              <label className="admin-group-linked-chat-label" htmlFor={`linked-chat-${group.id}`}>
                Чат-группа для курсантов
              </label>
              <p className="field-hint admin-group-linked-chat-hint">
                Кого назначаете в эту учебную группу — автоматически добавим в участники выбранного чата
                (создайте чат в разделе «Чат», затем выберите его здесь).
              </p>
              <select
                id={`linked-chat-${group.id}`}
                className="input input-inline admin-group-linked-chat-select"
                disabled={busy}
                value={group.linkedChatGroupId ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  onLinkedChatChange(group.id, v.length > 0 ? v : null);
                }}
                aria-label="Привязать чат-группу"
              >
                <option value="">— не привязано —</option>
                {groupChats.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title?.trim() ? r.title.trim() : r.id}
                  </option>
                ))}
              </select>
            </div>

            <h3 className="instructor-subtitle">Курсанты в группе</h3>
            {members.length === 0 ? (
              <p className="admin-empty">В группе пока нет курсантов.</p>
            ) : (
              <ul className="instructor-card-list admin-group-members-nested">
                {members.map((s) => (
                  <GroupMemberStudentCard
                    key={s.uid}
                    student={s}
                    instructorShort={instructorShortForStudent(s.uid, instructors)}
                    instructors={instructors}
                    busy={busy}
                    onRemoveFromGroup={() => onRemoveMember(s.uid)}
                  />
                ))}
              </ul>
            )}

            <div className="instructor-card-actions">
              <div className="instructor-card-actions-left">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm glossy-btn"
                  disabled={busy}
                  onClick={onEdit}
                >
                  Редактировать
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm glossy-btn"
                  disabled={busy}
                  onClick={onDeleteRequest}
                >
                  Удалить
                </button>
              </div>
              <button
                type="button"
                className="instructor-card-collapse-btn glossy-btn"
                title="Свернуть карточку"
                aria-label="Свернуть карточку"
                onClick={() => setExpanded(false)}
              >
                <IconCollapseCard />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </li>
  );
}

type GroupFormProps = {
  open: boolean;
  mode: "create" | "edit";
  initial: TrainingGroup | null;
  busy: boolean;
  onSubmit: (payload: {
    name: string;
    hasTrainingPeriod: boolean;
    trainingStartMs: number | null;
    trainingEndMs: number | null;
  }) => void | Promise<void>;
  onRequestCancelConfirm: () => void;
};

function GroupFormModal({
  open,
  mode,
  initial,
  busy,
  onSubmit,
  onRequestCancelConfirm,
}: GroupFormProps) {
  const [name, setName] = useState("");
  /** true = срок обучения (слева), false = без срока (справа) */
  const [hasTrainingPeriod, setHasTrainingPeriod] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial && mode === "edit") {
      setName(initial.name);
      setHasTrainingPeriod(initial.hasTrainingPeriod);
      if (
        initial.hasTrainingPeriod &&
        initial.trainingStartMs != null &&
        initial.trainingEndMs != null
      ) {
        setDateFrom(toDateInputValue(initial.trainingStartMs));
        setDateTo(toDateInputValue(initial.trainingEndMs));
      } else {
        const t = Date.now();
        setDateFrom(toDateInputValue(t));
        setDateTo(toDateInputValue(t));
      }
    } else {
      setName("");
      setHasTrainingPeriod(true);
      const t = Date.now();
      setDateFrom(toDateInputValue(t));
      setDateTo(toDateInputValue(t));
    }
    setLocalError(null);
  }, [open, initial, mode]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    const n = name.trim();
    if (!n) {
      setLocalError("Укажите название группы.");
      return;
    }
    let trainingStartMs: number | null = null;
    let trainingEndMs: number | null = null;
    if (hasTrainingPeriod) {
      if (!dateFrom || !dateTo) {
        setLocalError("Укажите даты периода обучения: «С» и «По».");
        return;
      }
      trainingStartMs = startOfDayFromInput(dateFrom);
      trainingEndMs = endOfDayFromInput(dateTo);
      if (trainingStartMs > trainingEndMs) {
        setLocalError("Дата «С» не может быть позже даты «По».");
        return;
      }
    }
    void onSubmit({
      name: n,
      hasTrainingPeriod,
      trainingStartMs,
      trainingEndMs,
    });
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onRequestCancelConfirm}
    >
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="group-modal-title" className="modal-title">
          {mode === "create" ? "Новая группа" : "Редактировать группу"}
        </h2>
        {mode === "create" ? (
          <p className="modal-lead field-hint">
            Создаётся группа, в которую затем можно перевести курсантов из списка
            «Не в группе».
          </p>
        ) : null}
        {localError ? (
          <div className="form-error" role="alert">
            {localError}
          </div>
        ) : null}
        <form className="form group-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">Название группы</span>
            <input
              className="input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Группа А"
              autoComplete="off"
              disabled={busy}
            />
          </label>

          <div className="field field-switch group-period-field">
            <span className="field-label">Период обучения</span>
            <div className="group-period-toggle-row">
              <span className="group-period-label">Срок обучения</span>
              <label className="switch-stay switch-stay--group-period">
                <input
                  type="checkbox"
                  role="switch"
                  checked={!hasTrainingPeriod}
                  onChange={(e) =>
                    setHasTrainingPeriod(!e.target.checked)
                  }
                  disabled={busy}
                  aria-checked={!hasTrainingPeriod}
                  aria-label="Без срока обучения"
                />
                <span className="switch-stay-slider" aria-hidden />
              </label>
              <span className="group-period-label">Без срока</span>
            </div>
            {hasTrainingPeriod ? (
              <div className="group-date-row">
                <label className="field group-date-field">
                  <span className="field-label">С</span>
                  <input
                    className="input"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    disabled={busy}
                  />
                </label>
                <label className="field group-date-field">
                  <span className="field-label">По</span>
                  <input
                    className="input"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    disabled={busy}
                  />
                </label>
              </div>
            ) : null}
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={onRequestCancelConfirm}
            >
              Отменить
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {mode === "create" ? "Создать группу" : "Сохранить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type FeedbackState = { kind: "success" | "error"; text: string } | null;

export function AdminStudentsTab() {
  const { user } = useAuth();
  const authUid = (user?.uid ?? "").trim();
  const [groupChats, setGroupChats] = useState<ChatRoom[]>([]);
  const [groups, setGroups] = useState<TrainingGroup[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingGroup, setEditingGroup] = useState<TrainingGroup | null>(null);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TrainingGroup | null>(null);
  const [instructors, setInstructors] = useState<UserProfile[]>([]);

  useEffect(() => {
    const u1 = subscribeTrainingGroups(setGroups, () => {});
    const u2 = subscribeStudents(setStudents, () => {});
    const u3 = subscribeInstructors(setInstructors, () => {});
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  useEffect(() => {
    if (!authUid) {
      setGroupChats([]);
      return;
    }
    return subscribeChatRoomsForUser(
      authUid,
      (rooms) => {
        setGroupChats(
          rooms.filter((r) => r.kind === "group" || r.id.startsWith("group_"))
        );
      },
      () => {}
    );
  }, [authUid]);

  useEffect(() => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    if (feedback?.kind === "success") {
      feedbackTimerRef.current = setTimeout(() => setFeedback(null), 10000);
      return () => {
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      };
    }
    return undefined;
  }, [feedback]);

  const ungrouped = useMemo(
    () =>
      students.filter(
        (s) => !s.groupId || !groups.some((g) => g.id === s.groupId)
      ),
    [students, groups]
  );

  async function onCreateSubmit(payload: {
    name: string;
    hasTrainingPeriod: boolean;
    trainingStartMs: number | null;
    trainingEndMs: number | null;
  }) {
    setBusy(true);
    setFeedback(null);
    try {
      await createTrainingGroup(payload);
      setFormOpen(false);
      setEditingGroup(null);
      setFeedback({
        kind: "success",
        text: "Группа создана — откройте карточку ниже или переведите курсантов из «Не в группе».",
      });
    } catch (e) {
      setFeedback({
        kind: "error",
        text:
          e instanceof Error
            ? e.message
            : "Не удалось создать группу. Проверьте подключение и правила Firestore.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function onEditSubmit(payload: {
    name: string;
    hasTrainingPeriod: boolean;
    trainingStartMs: number | null;
    trainingEndMs: number | null;
  }) {
    if (!editingGroup) return;
    setBusy(true);
    try {
      await updateTrainingGroup(editingGroup.id, payload);
      setFormOpen(false);
      setEditingGroup(null);
    } catch {
      /* ошибка без показа блока в интерфейсе */
    } finally {
      setBusy(false);
    }
  }

  function openCreate() {
    setFormMode("create");
    setEditingGroup(null);
    setFormOpen(true);
  }

  function openEdit(g: TrainingGroup) {
    setFormMode("edit");
    setEditingGroup(g);
    setFormOpen(true);
  }

  function closeModal() {
    setFormOpen(false);
    setEditingGroup(null);
    setConfirmCancel(false);
  }

  async function runDeleteGroup(g: TrainingGroup) {
    setBusy(true);
    try {
      await deleteTrainingGroup(g.id);
    } catch {
      /* ошибка без показа блока в интерфейсе */
    } finally {
      setBusy(false);
    }
  }

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

  async function removeStudentFromGroup(studentUid: string) {
    setBusy(true);
    try {
      await setStudentGroup(studentUid, null);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  async function onLinkedChatChange(trainingGroupId: string, chatId: string | null) {
    setBusy(true);
    setFeedback(null);
    try {
      await linkTrainingGroupToChatGroup(trainingGroupId, chatId);
      setFeedback({
        kind: "success",
        text: chatId
          ? "Чат привязан: текущие курсанты группы добавлены в участники. Новых при назначении в группу — тоже."
          : "Привязка снята. Курсантов в чат больше не добавляем автоматически.",
      });
    } catch (e) {
      setFeedback({
        kind: "error",
        text:
          e instanceof Error
            ? e.message
            : "Не удалось привязать чат. Проверьте права и что выбран групповой чат.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-tab">
      <h1 className="admin-tab-title" id="groups-heading">
        Группы
      </h1>

      <section
        className="admin-students-groups"
        aria-labelledby="groups-heading"
      >
        <div className="admin-groups-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={openCreate}
          >
            Создать группу
          </button>
        </div>

        {feedback ? (
          <div
            className={
              feedback.kind === "success"
                ? "admin-feedback admin-feedback--success"
                : "admin-feedback admin-feedback--error"
            }
            role={feedback.kind === "error" ? "alert" : "status"}
          >
            {feedback.text}
          </div>
        ) : null}

        <h3
          id="created-groups-heading"
          className="admin-created-groups-title"
        >
          Созданные группы
        </h3>

        {groups.length === 0 ? (
          <p className="admin-empty admin-groups-empty">
            Пока нет групп. Нажмите «Создать группу», затем назначьте курсантов
            ниже.
          </p>
        ) : (
          <ul className="instructor-card-list">
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                members={students.filter((s) => s.groupId === g.id)}
                instructors={instructors}
                busy={busy}
                groupChats={groupChats}
                onEdit={() => openEdit(g)}
                onDeleteRequest={() => setDeleteTarget(g)}
                onRemoveMember={(uid) => void removeStudentFromGroup(uid)}
                onLinkedChatChange={(tid, cid) => void onLinkedChatChange(tid, cid)}
              />
            ))}
          </ul>
        )}
      </section>

      <section
        className="admin-students-ungrouped"
        aria-labelledby="ungrouped-heading"
      >
        <h2 id="ungrouped-heading" className="admin-subsection-title">
          Не в группе
        </h2>
        {groups.length === 0 ? (
          <p className="field-hint admin-ungrouped-hint">
            Сначала создайте группу в разделе выше — затем здесь появится выбор,
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
                  <span className="admin-ungrouped-name">
                    {formatShortFio(s.displayName)}
                  </span>
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

      <GroupFormModal
        open={formOpen}
        mode={formMode}
        initial={editingGroup}
        busy={busy}
        onSubmit={
          formMode === "create" ? onCreateSubmit : onEditSubmit
        }
        onRequestCancelConfirm={() => setConfirmCancel(true)}
      />

      <ConfirmDialog
        open={confirmCancel}
        title="Вы уверены?"
        message="Закрыть форму без сохранения?"
        confirmLabel="Да"
        cancelLabel="Нет"
        onConfirm={() => {
          setConfirmCancel(false);
          closeModal();
        }}
        onCancel={() => setConfirmCancel(false)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Вы уверены?"
        message={
          deleteTarget
            ? `Удалить группу «${deleteTarget.name}»? Курсанты будут отвязаны.`
            : undefined
        }
        confirmLabel="Да"
        cancelLabel="Нет"
        onConfirm={() => {
          const t = deleteTarget;
          setDeleteTarget(null);
          if (t) void runDeleteGroup(t);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
