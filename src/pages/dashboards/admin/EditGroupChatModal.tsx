import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChatRoom, TrainingGroup, UserProfile } from "@/types";
import { formatShortFio } from "@/admin/formatShortFio";
import { AVATAR_EXPORT_SIZE, drawCircularAvatar } from "@/admin/drawCircularAvatar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { fetchStudentUidsInTrainingGroup } from "@/firebase/admin";
import { deleteGroupChat, updateGroupChat } from "@/firebase/chat";

function IconAddPhoto({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M3 4V1h2v3h3v2H5v3H3V6H0V4h3zm3 6V7h3V4h7l1.83 2H21c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V10h3zm7 9c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-3.2-5c0 1.77 1.43 3.2 3.2 3.2s3.2-1.43 3.2-3.2-1.43-3.2-3.2-3.2-3.2 1.43-3.2 3.2z"
      />
    </svg>
  );
}

export type EditGroupChatModalProps = {
  open: boolean;
  onClose: () => void;
  room: ChatRoom | null;
  contacts: UserProfile[];
  currentUserId: string;
  trainingGroups?: TrainingGroup[];
  roleLabel: Record<UserProfile["role"], string>;
  onSaved: () => void;
  onDeleted: () => void;
};

type AvatarIntent = "keep" | "replace" | "remove";

export function EditGroupChatModal({
  open,
  onClose,
  room,
  contacts,
  currentUserId,
  trainingGroups = [],
  roleLabel,
  onSaved,
  onDeleted,
}: EditGroupChatModalProps) {
  const [title, setTitle] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imgReady, setImgReady] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarScale, setAvatarScale] = useState(1.2);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [trainingGroupPick, setTrainingGroupPick] = useState("");
  const [avatarIntent, setAvatarIntent] = useState<AvatarIntent>("keep");
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open || !room) return;
    setTitle(room.title?.trim() ?? "");
    const me = currentUserId.trim();
    const others = room.participantIds.filter((id) => id.trim() !== me);
    setMemberIds(others);
    setTrainingGroupPick("");
    setAvatarScale(1.2);
    setAvatarIntent("keep");
    setLocalErr(null);
    setBusy(false);
    setDeleteConfirmOpen(false);
    if (room.avatarDataUrl) {
      setPreviewUrl(room.avatarDataUrl);
      setImgReady(true);
    } else {
      setPreviewUrl(null);
      setImgReady(false);
    }
  }, [open, room, currentUserId]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) {
      setLocalErr("Выберите изображение");
      return;
    }
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
    setImgReady(false);
    setAvatarIntent("replace");
    setLocalErr(null);
  };

  const clearAvatar = () => {
    if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImgReady(false);
    setAvatarIntent("remove");
  };

  const toggleMember = (uid: string) => {
    setMemberIds((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]
    );
  };

  const removeOrphan = (uid: string) => {
    setMemberIds((prev) => prev.filter((x) => x !== uid));
  };

  const handleSave = async () => {
    if (!room) return;
    const t = title.trim();
    if (!t) {
      setLocalErr("Укажите название группы");
      return;
    }
    const unique = [
      ...new Set(
        [currentUserId, ...memberIds]
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter(Boolean)
      ),
    ];
    if (unique.length < 2) {
      setLocalErr("Добавьте хотя бы одного участника");
      return;
    }
    setBusy(true);
    setLocalErr(null);
    try {
      let avatarDataUrl: string | null = null;
      if (avatarIntent === "remove") {
        avatarDataUrl = null;
      } else if (avatarIntent === "replace") {
        if (!previewUrl || !imgRef.current || !imgReady) {
          setLocalErr("Дождитесь загрузки изображения");
          return;
        }
        avatarDataUrl = drawCircularAvatar(imgRef.current, avatarScale, AVATAR_EXPORT_SIZE);
        if (!avatarDataUrl) throw new Error("Не удалось обработать изображение");
      } else {
        avatarDataUrl = room.avatarDataUrl ?? null;
      }

      await updateGroupChat({
        chatId: room.id,
        title: t,
        avatarDataUrl,
        participantIds: unique,
        participantEmailsLower: [
          ...(room.participantEmailsLower ?? []),
          ...contacts
            .filter((c) => unique.includes(c.uid))
            .map((c) => c.email.trim().toLowerCase())
            .filter(Boolean),
        ],
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      setLocalErr(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!room) return;
    setBusy(true);
    setLocalErr(null);
    try {
      await deleteGroupChat(room.id);
      setDeleteConfirmOpen(false);
      onDeleted();
      onClose();
    } catch (e: unknown) {
      setLocalErr(e instanceof Error ? e.message : "Ошибка удаления группы");
    } finally {
      setBusy(false);
    }
  };

  const orphanNotInContacts = memberIds.filter((id) => !contacts.some((c) => c.uid === id));

  if (!room) return null;

  const portal =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <>
        <div className="chat-group-modal-overlay">
          <div
            className="chat-group-modal-backdrop"
            role="presentation"
            onClick={() => !busy && !deleteConfirmOpen && onClose()}
          />
          <div
            className="chat-group-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-group-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="edit-group-modal-title" className="chat-group-modal-title">
              Редактировать группу
            </h2>

            <label className="chat-group-modal-field">
              <span className="chat-group-modal-label">Название</span>
              <input
                type="text"
                className="input chat-group-modal-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Название группы"
                maxLength={120}
                autoComplete="off"
              />
            </label>

            <div className="chat-group-modal-field">
              <span className="chat-group-modal-label">Аватар</span>
              <div className="chat-group-avatar-block">
                <div className="chat-group-avatar-preview-wrap">
                  <div className="chat-group-avatar-ring">
                    {previewUrl ? (
                      <img
                        ref={imgRef}
                        src={previewUrl}
                        alt=""
                        className="chat-group-avatar-img"
                        style={{ transform: `scale(${avatarScale})` }}
                        onLoad={() => setImgReady(true)}
                      />
                    ) : (
                      <div className="chat-group-avatar-placeholder">Нет фото</div>
                    )}
                  </div>
                </div>
                <div className="chat-group-avatar-controls">
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/*"
                    className="chat-file-input"
                    onChange={onPickFile}
                    id="edit-group-avatar-file"
                  />
                  <button
                    type="button"
                    className="chat-ico-btn chat-group-avatar-upload-btn"
                    title="Загрузить фото"
                    aria-label="Загрузить фото"
                    disabled={busy}
                    onClick={() => avatarFileInputRef.current?.click()}
                  >
                    <IconAddPhoto className="chat-ico" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={!previewUrl}
                    onClick={() => clearAvatar()}
                  >
                    Убрать фото
                  </button>
                  <div className="chat-group-scale">
                    <span className="chat-group-scale-label">Масштаб</span>
                    <input
                      type="range"
                      min={1}
                      max={3}
                      step={0.05}
                      value={avatarScale}
                      onChange={(e) => setAvatarScale(Number(e.target.value))}
                      disabled={!previewUrl}
                      aria-label="Масштаб аватара в круге"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="chat-group-modal-field">
              <span className="chat-group-modal-label">Участники</span>
              <p className="chat-group-modal-hint">
                Учебная группа в карточке курсанта и этот чат не синхронизируются сами — добавьте курсантов
                галочками или кнопкой ниже.
              </p>
              {trainingGroups.length > 0 ? (
                <div className="chat-group-training-pick">
                  <span className="chat-group-modal-label">Добавить курсантов из учебной группы</span>
                  <div className="chat-group-training-row">
                    <select
                      className="input chat-group-modal-input"
                      value={trainingGroupPick}
                      onChange={(e) => setTrainingGroupPick(e.target.value)}
                      aria-label="Учебная группа"
                    >
                      <option value="">Выберите группу…</option>
                      {trainingGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name.trim() || g.id}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={busy || !trainingGroupPick}
                      onClick={() => {
                        void (async () => {
                          setBusy(true);
                          setLocalErr(null);
                          try {
                            const ids = await fetchStudentUidsInTrainingGroup(trainingGroupPick);
                            if (ids.length === 0) {
                              setLocalErr("В этой учебной группе нет курсантов (активных или на модерации).");
                              return;
                            }
                            setMemberIds((prev) => [...new Set([...prev, ...ids])]);
                          } catch (err) {
                            setLocalErr(
                              err instanceof Error ? err.message : "Не удалось загрузить состав группы"
                            );
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    >
                      В список участников
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="chat-group-members">
                {contacts.length === 0 ? (
                  <div className="chat-group-modal-empty">Нет доступных контактов</div>
                ) : (
                  contacts.map((c) => (
                    <label key={c.uid} className="chat-group-member-row">
                      <input
                        type="checkbox"
                        checked={memberIds.includes(c.uid)}
                        onChange={() => toggleMember(c.uid)}
                      />
                      <span className="chat-group-member-name">{formatShortFio(c.displayName)}</span>
                      <span className="chat-group-member-role">{roleLabel[c.role]}</span>
                    </label>
                  ))
                )}
              </div>
              {orphanNotInContacts.length > 0 ? (
                <div className="chat-group-orphan-section">
                  <span className="chat-group-modal-label">Не в списке контактов</span>
                  <ul className="chat-group-orphan-list">
                    {orphanNotInContacts.map((uid) => (
                      <li key={uid} className="chat-group-orphan-row">
                        <span className="chat-group-orphan-id">{uid.slice(0, 10)}…</span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          onClick={() => removeOrphan(uid)}
                        >
                          Удалить из группы
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {localErr ? (
              <div className="form-error chat-group-modal-err" role="alert">
                {localErr}
              </div>
            ) : null}

            <div className="chat-group-modal-actions">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
                Отмена
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void handleSave()}>
                {busy ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
            <div className="chat-group-modal-delete-row">
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                Удалить группу
              </button>
            </div>
          </div>
        </div>
        <ConfirmDialog
          open={deleteConfirmOpen}
          title="Удалить группу?"
          message="Чат и все сообщения будут удалены безвозвратно."
          confirmLabel="Удалить"
          cancelLabel="Назад"
          onConfirm={() => void handleDelete()}
          onCancel={() => !busy && setDeleteConfirmOpen(false)}
        />
      </>,
      document.body
    );

  return portal ?? null;
}
