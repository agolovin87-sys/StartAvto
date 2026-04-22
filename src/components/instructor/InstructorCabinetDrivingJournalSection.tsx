import { useEffect, useMemo, useState } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import { dateKeyToRuDisplay } from "@/admin/scheduleFormat";
import { useAuth } from "@/context/AuthContext";
import { subscribeTrainingGroups } from "@/firebase/admin";
import { subscribeDriveSlotsForInstructor } from "@/firebase/drives";
import { subscribeUsersByIds } from "@/firebase/instructorData";
import { IconInstructorCabinetDrivingJournal } from "@/components/instructor/instructorCabinetSectionIcons";
import { loadDriveSlotLessonErrors } from "@/services/errorTemplateService";
import type { DriveSlot, TrainingGroup, UserProfile } from "@/types";

type StudentGroupBucket = {
  id: string;
  name: string;
  students: UserProfile[];
};

function groupNameById(groups: TrainingGroup[], groupId: string): string {
  const found = groups.find((g) => g.id === groupId);
  return found?.name?.trim() || "Без группы";
}

function slotSortKey(s: DriveSlot): string {
  return `${s.dateKey}T${s.startTime}:00`;
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg className={`instr-chevron${open ? " is-open" : ""}`} viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M7 10l5 5 5-5z" />
    </svg>
  );
}

export function InstructorCabinetDrivingJournalSection() {
  const { user, profile } = useAuth();
  const uid = (user?.uid ?? profile?.uid ?? "").trim();
  const attachedIds = useMemo(() => profile?.attachedStudentIds ?? [], [profile?.attachedStudentIds]);

  const [groups, setGroups] = useState<TrainingGroup[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [slots, setSlots] = useState<DriveSlot[]>([]);
  const [errorsBySlot, setErrorsBySlot] = useState<Record<string, string>>({});
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [errorsModalOpen, setErrorsModalOpen] = useState(false);
  const [errorsModalTitle, setErrorsModalTitle] = useState("");
  const [errorsModalText, setErrorsModalText] = useState("—");
  const [journalOpen, setJournalOpen] = useState(false);

  useEffect(() => subscribeTrainingGroups(setGroups, () => setGroups([])), []);

  useEffect(() => subscribeUsersByIds(attachedIds, setStudents), [attachedIds]);

  useEffect(() => {
    if (!uid) {
      setSlots([]);
      return;
    }
    return subscribeDriveSlotsForInstructor(uid, setSlots, () => setSlots([]));
  }, [uid]);

  const groupBuckets = useMemo<StudentGroupBucket[]>(() => {
    const map = new Map<string, UserProfile[]>();
    for (const s of students) {
      const gid = s.groupId?.trim() || "__no_group__";
      if (!map.has(gid)) map.set(gid, []);
      map.get(gid)?.push(s);
    }
    const buckets: StudentGroupBucket[] = [];
    for (const [id, list] of map.entries()) {
      buckets.push({
        id,
        name: id === "__no_group__" ? "Без группы" : groupNameById(groups, id),
        students: [...list].sort((a, b) => a.displayName.localeCompare(b.displayName, "ru")),
      });
    }
    buckets.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    return buckets;
  }, [groups, students]);

  useEffect(() => {
    if (groupBuckets.length === 0) {
      setSelectedGroupId("");
      return;
    }
    if (groupBuckets.some((g) => g.id === selectedGroupId)) return;
    setSelectedGroupId(groupBuckets[0]?.id ?? "");
  }, [groupBuckets, selectedGroupId]);

  const studentsInGroup = useMemo(
    () => groupBuckets.find((g) => g.id === selectedGroupId)?.students ?? [],
    [groupBuckets, selectedGroupId]
  );

  useEffect(() => {
    if (studentsInGroup.length === 0) {
      setSelectedStudentId("");
      return;
    }
    if (studentsInGroup.some((s) => s.uid === selectedStudentId)) return;
    setSelectedStudentId(studentsInGroup[0]?.uid ?? "");
  }, [studentsInGroup, selectedStudentId]);

  const studentSlots = useMemo(
    () =>
      slots
        .filter((s) => s.studentId === selectedStudentId && s.status === "completed")
        .sort((a, b) => slotSortKey(b).localeCompare(slotSortKey(a))),
    [slots, selectedStudentId]
  );
  const selectedStudentName = useMemo(
    () => studentsInGroup.find((s) => s.uid === selectedStudentId)?.displayName ?? "—",
    [studentsInGroup, selectedStudentId]
  );

  useEffect(() => {
    const ids = studentSlots.map((s) => s.id);
    if (ids.length === 0) {
      setErrorsBySlot({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const patch: Record<string, string> = {};
      for (const id of ids) {
        try {
          const rows = await loadDriveSlotLessonErrors(id);
          const names = [...new Set(rows.map((r) => r.name.trim()).filter(Boolean))];
          patch[id] = names.length > 0 ? names.join(", ") : "—";
        } catch {
          patch[id] = "—";
        }
      }
      if (!cancelled) setErrorsBySlot(patch);
    })();
    return () => {
      cancelled = true;
    };
  }, [studentSlots]);

  return (
    <section
      className="student-cabinet-card instructor-cabinet-block-surface instructor-cabinet-driving-journal-section"
      aria-labelledby="instructor-cabinet-driving-journal-title"
    >
      <button
        type="button"
        id="instructor-cabinet-driving-journal-title"
        className="instructor-home-section-toggle glossy-panel instructor-cabinet-driving-journal-toggle"
        aria-expanded={journalOpen}
        onClick={() => setJournalOpen((v) => !v)}
      >
        <span className="instructor-home-section-toggle-label">
          <span className="student-cab-toggle-label-inner">
            <IconInstructorCabinetDrivingJournal className="instructor-cab-section-ico" />
            <span>Журнал вождений</span>
          </span>
        </span>
        <IconChevron open={journalOpen} />
      </button>

      {!journalOpen ? null : groupBuckets.length === 0 ? (
        <p className="field-hint instructor-cabinet-block-lead">Закреплённые курсанты пока не найдены.</p>
      ) : (
        <>
          <div className="instructor-cabinet-driving-journal-group-select-wrap">
            <label className="instructor-cabinet-driving-journal-label" htmlFor="instructor-driving-group-select">
              Группа
            </label>
            <select
              id="instructor-driving-group-select"
              className="select instructor-cabinet-driving-journal-group-select"
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              {groupBuckets.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.students.length})
                </option>
              ))}
            </select>
          </div>

          <div className="instructor-cabinet-driving-journal-students">
            {studentsInGroup.map((s) => (
              <button
                key={s.uid}
                type="button"
                className={
                  "instructor-cabinet-driving-journal-student-btn" +
                  (s.uid === selectedStudentId ? " is-active" : "")
                }
                onClick={() => setSelectedStudentId(s.uid)}
              >
                {formatShortFio(s.displayName)}
              </button>
            ))}
          </div>

          <div className="instructor-cabinet-driving-journal-table-wrap">
            <table className="student-cabinet-talon-table instructor-cabinet-driving-journal-table">
              <thead>
                <tr>
                  <th>№ п/п</th>
                  <th>Фамилия И.О.</th>
                  <th>Дата и время</th>
                  <th>Ошибки</th>
                  <th>Оценка</th>
                </tr>
              </thead>
              <tbody>
                {studentSlots.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="student-cabinet-talon-table-empty">
                      По выбранному курсанту завершённых вождений пока нет.
                    </td>
                  </tr>
                ) : (
                  studentSlots.map((s, idx) => (
                    <tr key={s.id}>
                      <td>{idx + 1}</td>
                      <td>{formatShortFio(s.studentDisplayName || selectedStudentName)}</td>
                      <td>
                        {dateKeyToRuDisplay(s.dateKey)} · {s.startTime}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="student-cabinet-text-link instructor-cabinet-driving-journal-errors-btn"
                          onClick={() => {
                            const studentLabel = formatShortFio(
                              s.studentDisplayName || selectedStudentName
                            );
                            setErrorsModalTitle(
                              `${studentLabel} · ${dateKeyToRuDisplay(s.dateKey)} · ${s.startTime}`
                            );
                            setErrorsModalText(errorsBySlot[s.id] ?? "—");
                            setErrorsModalOpen(true);
                          }}
                        >
                          Посмотреть
                        </button>
                      </td>
                      <td>{s.instructorRatingStudent ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {errorsModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setErrorsModalOpen(false)}>
          <div
            className="modal-panel student-cabinet-modal instructor-cabinet-driving-journal-errors-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="instructor-driving-errors-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="instructor-driving-errors-title" className="modal-title">
              Ошибки вождения
            </h2>
            <p className="instructor-cabinet-driving-journal-errors-meta">{errorsModalTitle}</p>
            <p className="instructor-cabinet-driving-journal-errors-text">{errorsModalText}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setErrorsModalOpen(false)}
              >
                Ок
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
