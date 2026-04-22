import { useEffect, useMemo, useState } from "react";
import { useAdminGpsPing } from "@/context/AdminGpsPingContext";
import { useChatNav } from "@/context/ChatNavContext";
import { initialsFromFullName, avatarHueFromUid } from "@/admin/instructorAvatar";
import { INSTRUCTOR_VEHICLES } from "@/admin/vehicleOptions";
import { formatShortFio } from "@/admin/formatShortFio";
import { CabinetClientKindBadge } from "@/components/CabinetClientKindBadge";
import {
  attachStudentToInstructor,
  removeStudentFromInstructor,
  setInstructorAttachedStudents,
  setUserAccountStatus,
  subscribeInstructors,
  subscribeStudents,
  updateUserProfileFields,
} from "@/firebase/admin";
import { mapFirebaseError } from "@/firebase/errors";
import { isValidRuMobilePhone, normalizeRuPhone } from "@/lib/phoneRu";
import type { AccountStatus, UserProfile, UserRole } from "@/types";
import { isPresenceEffectivelyOnline } from "@/utils/presence";

const statusLabel: Record<AccountStatus, string> = {
  pending: "Ожидает",
  active: "Активен",
  inactive: "Деактивирован",
  rejected: "Удалён",
};

function telHrefFromPhone(phone: string): string | undefined {
  const n = normalizeRuPhone(phone);
  return n && isValidRuMobilePhone(n) ? `tel:${n}` : undefined;
}

type OwnerInfo = { uid: string; shortName: string };

function buildStudentOwners(instructors: UserProfile[]): Map<string, OwnerInfo> {
  const m = new Map<string, OwnerInfo>();
  for (const ins of instructors) {
    const shortName = formatShortFio(ins.displayName);
    for (const sid of ins.attachedStudentIds ?? []) {
      m.set(sid, { uid: ins.uid, shortName });
    }
  }
  return m;
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

/** Несколько человек — курсанты у инструктора */
function IconStudents() {
  return (
    <svg className="instr-meta-ico" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
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

function IconTalons({ className }: { className?: string } = {}) {
  return (
    <svg
      className={["instructor-ico instructor-ico-line", className].filter(Boolean).join(" ")}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
      />
    </svg>
  );
}

function IconCar() {
  return (
    <svg className="instructor-ico instructor-ico-line" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"
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

function IconCollapseCard() {
  return (
    <svg className="instructor-ico-btn" viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M7 14l5-5 5 5z" />
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

function InstructorCard({
  instructor,
  studentOwners,
  studentsById,
}: {
  instructor: UserProfile;
  studentOwners: Map<string, OwnerInfo>;
  studentsById: Map<string, UserProfile>;
}) {
  const chatNav = useChatNav();
  const [expanded, setExpanded] = useState(false);
  const [editMode, setEditMode] = useState(false);
  /** Талоны, профиль, деактивация — не смешивать с прикреплением курсантов. */
  const [busy, setBusy] = useState(false);
  /** Только прикрепить / открепить — отдельный флаг, чтобы кнопки не блокировались talons busy. */
  const [studentLinkBusy, setStudentLinkBusy] = useState(false);
  /** Индикатор только для операции «Прикрепить» (+). */
  const [attachLoading, setAttachLoading] = useState(false);

  const [editDisplayName, setEditDisplayName] = useState(instructor.displayName);
  const [editRole, setEditRole] = useState<UserRole>(instructor.role);
  const [editPhone, setEditPhone] = useState(instructor.phone);
  const [editVehicle, setEditVehicle] = useState(instructor.vehicleLabel);

  const [talonsDelta, setTalonsDelta] = useState(0);
  const [talonsCommittedOverride, setTalonsCommittedOverride] = useState<number | null>(null);
  const baseTalons = talonsCommittedOverride ?? instructor.talons;

  const [pickStudentId, setPickStudentId] = useState("");

  const [localErr, setLocalErr] = useState<string | null>(null);

  useEffect(() => {
    setEditDisplayName(instructor.displayName);
    setEditRole(instructor.role);
    setEditPhone(instructor.phone);
    setEditVehicle(instructor.vehicleLabel);
  }, [instructor]);

  useEffect(() => {
    setTalonsDelta(0);
    setTalonsCommittedOverride(null);
  }, [instructor.uid]);

  useEffect(() => {
    setStudentLinkBusy(false);
    setAttachLoading(false);
  }, [instructor.uid]);

  const vehicleSelectOptions = useMemo(() => {
    const set = new Set<string>([...INSTRUCTOR_VEHICLES]);
    if (instructor.vehicleLabel && !set.has(instructor.vehicleLabel)) {
      set.add(instructor.vehicleLabel);
    }
    if (editVehicle && !set.has(editVehicle)) {
      set.add(editVehicle);
    }
    return [...set];
  }, [instructor.vehicleLabel, editVehicle]);

  async function saveTalons() {
    const next = Math.max(0, baseTalons + talonsDelta);
    setBusy(true);
    setLocalErr(null);
    try {
      await updateUserProfileFields(instructor.uid, { talons: next });
      setTalonsCommittedOverride(next);
      setTalonsDelta(0);
    } catch (e: unknown) {
      setLocalErr(e instanceof Error ? e.message : "Не удалось сохранить талоны");
    } finally {
      setBusy(false);
    }
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
    if (!editVehicle.trim()) {
      setLocalErr("Выберите учебный автомобиль.");
      return;
    }
    setBusy(true);
    setLocalErr(null);
    try {
      await updateUserProfileFields(instructor.uid, {
        displayName: editDisplayName.trim(),
        role: editRole,
        phone: phoneNorm,
        vehicleLabel: editVehicle.trim(),
      });
      setEditMode(false);
    } finally {
      setBusy(false);
    }
  }

  function enterEditMode() {
    setEditDisplayName(instructor.displayName);
    setEditRole(instructor.role);
    setEditPhone(instructor.phone);
    setEditVehicle(instructor.vehicleLabel);
    setLocalErr(null);
    setEditMode(true);
  }

  async function toggleActivation() {
    const isActive = instructor.accountStatus === "active";
    if (isActive && !confirm("Деактивировать инструктора? Вход будет закрыт.")) return;
    setBusy(true);
    try {
      await setUserAccountStatus(instructor.uid, isActive ? "inactive" : "active");
    } finally {
      setBusy(false);
    }
  }

  async function removeInstructor() {
    if (
      !confirm(
        "Удалить инструктора из системы? Учётная запись будет закрыта, связи с курсантами снимутся."
      )
    )
      return;
    setBusy(true);
    try {
      await setInstructorAttachedStudents(instructor.uid, []);
      await setUserAccountStatus(instructor.uid, "rejected");
    } finally {
      setBusy(false);
    }
  }

  const attachedList = (instructor.attachedStudentIds ?? [])
    .map((id) => studentsById.get(id))
    .filter(Boolean) as UserProfile[];

  const pickOwner = pickStudentId ? studentOwners.get(pickStudentId) : undefined;
  const isMine = Boolean(
    pickStudentId &&
      (instructor.attachedStudentIds ?? []).includes(pickStudentId)
  );
  const isOther = Boolean(
    pickStudentId && pickOwner && pickOwner.uid !== instructor.uid
  );

  async function onAttachPick() {
    if (!pickStudentId || studentLinkBusy) return;
    setAttachLoading(true);
    setStudentLinkBusy(true);
    setLocalErr(null);
    try {
      await attachStudentToInstructor(instructor.uid, pickStudentId);
      setPickStudentId("");
    } catch (e: unknown) {
      setLocalErr(mapFirebaseError(e));
    } finally {
      setStudentLinkBusy(false);
      setAttachLoading(false);
    }
  }

  async function onDetachAttached(sid: string) {
    if (studentLinkBusy) return;
    setStudentLinkBusy(true);
    setLocalErr(null);
    try {
      await removeStudentFromInstructor(instructor.uid, sid);
    } catch (e: unknown) {
      setLocalErr(mapFirebaseError(e));
    } finally {
      setStudentLinkBusy(false);
    }
  }

  const { instructorHasGpsPingUnread } = useAdminGpsPing();
  const gpsPingUnread =
    instructor.accountStatus === "active" && instructorHasGpsPingUnread(instructor.uid);

  const hue = avatarHueFromUid(instructor.uid);
  const initials = initialsFromFullName(instructor.displayName);
  const presenceOnline = isPresenceEffectivelyOnline(instructor.presence);
  const telHref = telHrefFromPhone(instructor.phone);
  const attachedCount = (instructor.attachedStudentIds ?? []).length;
  const previewTalons = Math.max(0, baseTalons + talonsDelta);
  const zeroTalonsPreview = previewTalons === 0;

  return (
    <li className="instructor-card-outer">
      <div className={`instructor-card ${expanded ? "is-expanded" : ""}`}>
        <div className="instructor-preview-bar">
          <button
            type="button"
            className="instructor-card-preview instructor-card-preview--tint glossy-panel"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
          >
            <span className="instructor-avatar-wrap">
              <span
                className={
                  instructor.avatarDataUrl
                    ? "instructor-avatar instructor-avatar--photo"
                    : "instructor-avatar"
                }
                style={
                  instructor.avatarDataUrl ? undefined : { background: `hsl(${hue} 42% 40%)` }
                }
              >
                {instructor.avatarDataUrl ? (
                  <img
                    src={instructor.avatarDataUrl}
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
                {formatShortFio(instructor.displayName)}
                <CabinetClientKindBadge kind={instructor.lastCabinetClientKind} />
                {gpsPingUnread ? (
                  <span
                    className="admin-gps-instructor-badge admin-gps-instructor-badge--inline"
                    aria-label="Новые координаты в разделе GPS"
                  >
                    1
                  </span>
                ) : null}
              </span>
              <span className="instructor-preview-role-row">
                <IconRole />
                <span>Роль: Инструктор</span>
              </span>
              <span className="instructor-preview-status-row">
                <IconStatusIco />
                <span>Статус:</span>
                <span
                  className={`instructor-status instructor-status--${instructor.accountStatus}`}
                >
                  {statusLabel[instructor.accountStatus]}
                </span>
              </span>
              <span className="instructor-preview-status-row">
                <IconStudents />
                <span>Курсанты: {attachedCount}</span>
              </span>
              <span
                className={
                  zeroTalonsPreview
                    ? "instructor-preview-status-row instructor-preview-talons-zero"
                    : "instructor-preview-status-row"
                }
                title={
                  zeroTalonsPreview
                    ? "Нет талонов — необходимо пополнение"
                    : undefined
                }
              >
                <IconTalons className="instructor-ico--purple" />
                <span>Талоны: {previewTalons}</span>
              </span>
            </span>
            <IconChevron open={expanded} />
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
                onClick={() => chatNav.openChatWithUser(instructor.uid)}
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
          </div>
        </div>

        {expanded ? (
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
                    instructor.avatarDataUrl
                      ? "instructor-avatar instructor-avatar-lg instructor-avatar--photo"
                      : "instructor-avatar instructor-avatar-lg"
                  }
                  style={
                    instructor.avatarDataUrl ? undefined : { background: `hsl(${hue} 42% 40%)` }
                  }
                >
                  {instructor.avatarDataUrl ? (
                    <img
                      src={instructor.avatarDataUrl}
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
                    {instructor.displayName}
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
                      <option value="instructor">Инструктор</option>
                      <option value="student">Курсант</option>
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
                  <span className="instr-field-readonly">{instructor.email}</span>
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
                      {instructor.phone || "—"}
                    </span>
                  )}
                </dd>
              </div>
              <div className="instr-row instr-row-talons">
                <dt>
                  <span className="instr-dt-inner">
                    <IconTalons className="instructor-ico--purple" />
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
                      disabled={busy}
                      title="Списать"
                      onClick={() => setTalonsDelta((d) => d - 1)}
                    >
                      <IconMinus />
                    </button>
                    <button
                      type="button"
                      className="icon-pill icon-pill-talons-plus glossy-btn"
                      disabled={busy}
                      title="Зачислить"
                      onClick={() => setTalonsDelta((d) => d + 1)}
                    >
                      <IconPlus />
                    </button>
                    <button
                      type="button"
                      className="icon-pill icon-pill-talons-save glossy-btn"
                      disabled={busy || talonsDelta === 0}
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
                    <IconCar />
                    <span className="instr-dt-text">Учебное ТС:</span>
                  </span>
                </dt>
                <dd className="instr-dd-fixed">
                  {editMode ? (
                    <select
                      className="input instr-input-fixed"
                      value={
                        editVehicle && vehicleSelectOptions.includes(editVehicle)
                          ? editVehicle
                          : ""
                      }
                      onChange={(e) => setEditVehicle(e.target.value)}
                    >
                      <option value="">— выберите —</option>
                      {vehicleSelectOptions.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="instr-field-readonly">
                      {instructor.vehicleLabel || "—"}
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="instructor-edit-bar">
              <button
                type="button"
                className="btn btn-ghost btn-sm instructor-edit-toggle glossy-btn"
                disabled={busy}
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

            <div className="instructor-students-block">
              <h3 className="instructor-subtitle">Прикреплённые курсанты</h3>
              <p className="field-hint">
                У одного курсанта — один инструктор; при прикреплении здесь он
                открепляется у другого.
              </p>
              <div className="instr-pick-row">
                <select
                  className="input instr-pick-select"
                  value={pickStudentId}
                  disabled={studentLinkBusy}
                  onChange={(e) => setPickStudentId(e.target.value)}
                >
                  <option value="">Выберите курсанта…</option>
                  {pickStudentOptions(studentsById).map(
                    (s) => {
                      const o = studentOwners.get(s.uid);
                      const extra = o
                        ? o.uid === instructor.uid
                          ? " (у вас)"
                          : ` (Инстр.: ${o.shortName})`
                        : " (свободен)";
                      return (
                        <option key={s.uid} value={s.uid}>
                          {formatShortFio(s.displayName)}
                          {extra}
                        </option>
                      );
                    }
                  )}
                </select>
                {pickStudentId ? (
                  <span className="instr-pick-btns">
                    {isMine ? (
                      <span className="instr-pick-note">Уже прикреплён</span>
                    ) : (
                      <>
                        {isOther ? (
                          <span className="instr-pick-note">
                            Сейчас у другого инструктора — «+» переведёт курсанта сюда.
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className="icon-pill icon-pill-talons-plus glossy-btn"
                          title={
                            attachLoading
                              ? "Прикрепление…"
                              : isOther
                                ? "Перевести к этому инструктору"
                                : "Прикрепить"
                          }
                          disabled={studentLinkBusy}
                          aria-busy={attachLoading}
                          onClick={() => void onAttachPick()}
                        >
                          {attachLoading ? (
                            <span
                              className="instr-attach-spinner"
                              aria-hidden
                            />
                          ) : (
                            <IconPlus />
                          )}
                        </button>
                      </>
                    )}
                  </span>
                ) : null}
              </div>

              <ul className="instr-attached-list">
                {attachedList.map((s) => (
                  <li key={s.uid} className="instr-attached-item">
                    <span>{formatShortFio(s.displayName)}</span>
                    <button
                      type="button"
                      className="icon-pill icon-pill-talons-minus glossy-btn"
                      title="Открепить"
                      disabled={studentLinkBusy}
                      onClick={() => void onDetachAttached(s.uid)}
                    >
                      <IconMinus />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="instructor-card-actions">
              <div className="instructor-card-actions-left">
                <button
                  type="button"
                  className={`btn btn-sm glossy-btn ${
                    instructor.accountStatus === "active" ? "btn-ghost" : "btn-primary"
                  }`}
                  disabled={busy}
                  onClick={toggleActivation}
                >
                  {instructor.accountStatus === "active" ? "Деактивировать" : "Активировать"}
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm glossy-btn"
                  disabled={busy}
                  onClick={removeInstructor}
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
                  setExpanded(false);
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

/** Курсанты для выпадающего списка: активные студенты */
function pickStudentOptions(
  studentsById: Map<string, UserProfile>
): UserProfile[] {
  return [...studentsById.values()].filter(
    (u) => u.role === "student" && u.accountStatus === "active"
  );
}

export function AdminInstructorsTab() {
  const [instructors, setInstructors] = useState<UserProfile[]>([]);
  const [allStudents, setAllStudents] = useState<UserProfile[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeInstructors(setInstructors, (e) =>
      setErr(e.message)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    return subscribeStudents(
      (list) =>
        setAllStudents(list.filter((u) => u.accountStatus === "active")),
      (e) => setErr(e.message)
    );
  }, []);

  const studentOwners = useMemo(
    () => buildStudentOwners(instructors),
    [instructors]
  );

  const studentsById = useMemo(
    () => new Map(allStudents.map((s) => [s.uid, s])),
    [allStudents]
  );

  return (
    <div className="admin-tab admin-instructors-section">
      <h1 className="admin-tab-title">Инструкторы</h1>
      <p className="admin-tab-lead">Карточки инструкторов:</p>
      {err ? (
        <div className="form-error" role="alert">
          {err}
        </div>
      ) : null}
      {instructors.length === 0 ? (
        <p className="admin-empty">Нет инструкторов в системе.</p>
      ) : (
        <ul className="instructor-card-list">
          {instructors.map((ins) => (
            <InstructorCard
              key={ins.uid}
              instructor={ins}
              studentOwners={studentOwners}
              studentsById={studentsById}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

