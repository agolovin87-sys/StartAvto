import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatShortFio } from "@/admin/formatShortFio";
import { useDriveLocationSharingUi } from "@/context/DriveLocationSharingUiContext";
import { useAdminGpsPing } from "@/context/AdminGpsPingContext";
import { mapFirebaseError } from "@/firebase/errors";
import { setDriveLocationSharingSettings } from "@/firebase/driveLocationSharingSettings";
import { AdminGpsYandexMap } from "@/components/AdminGpsYandexMap";
import { subscribeInstructors, subscribeStudents, subscribeTrainingGroups } from "@/firebase/admin";
import {
  fetchInstructorLiveLocationFromServer,
  requestInstructorLiveLocationRefresh,
  subscribeInstructorLiveLocation,
  type InstructorLiveLocation,
} from "@/firebase/instructorLiveLocation";
import {
  fetchStudentLiveLocationFromServer,
  requestStudentLiveLocationRefresh,
  subscribeStudentLiveLocation,
} from "@/firebase/studentLiveLocation";
import type { TrainingGroup, UserProfile } from "@/types";
import { hasYandexMapsApiKey } from "@/yandexMapsApi";

const STALE_MS = 12 * 60 * 1000;

function formatAgo(ms: number | null): string {
  if (ms == null) return "";
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} дн назад`;
}

function AdminGpsMapModal({
  open,
  mode,
  subjectUid,
  subscriptionLocation,
  title,
  onClose,
}: {
  open: boolean;
  mode: "instructor" | "student";
  subjectUid: string;
  subscriptionLocation: InstructorLiveLocation | null;
  title: string;
  onClose: () => void;
}) {
  const [display, setDisplay] = useState<InstructorLiveLocation | null>(null);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshHint, setRefreshHint] = useState<string | null>(null);
  const [mapNonce, setMapNonce] = useState(0);
  const displayRef = useRef(display);
  const subscriptionRef = useRef(subscriptionLocation);
  useEffect(() => {
    displayRef.current = display;
  }, [display]);
  useEffect(() => {
    subscriptionRef.current = subscriptionLocation;
  }, [subscriptionLocation]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setDisplay(subscriptionLocation);
    setRefreshHint(null);
  }, [open, subscriptionLocation]);

  const handleRefresh = useCallback(async () => {
    const uid = subjectUid.trim();
    if (!uid) return;
    setRefreshBusy(true);
    setRefreshHint(null);
    const beforeMs =
      displayRef.current?.updatedAtMs ?? subscriptionRef.current?.updatedAtMs ?? null;
    try {
      if (mode === "instructor") {
        await requestInstructorLiveLocationRefresh(uid);
      } else {
        await requestStudentLiveLocationRefresh(uid);
      }
      const deadline = Date.now() + 22_000;
      let next: InstructorLiveLocation | null = null;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 700));
        const cand =
          mode === "instructor"
            ? await fetchInstructorLiveLocationFromServer(uid)
            : await fetchStudentLiveLocationFromServer(uid);
        if (
          cand != null &&
          cand.updatedAtMs != null &&
          (beforeMs == null || cand.updatedAtMs > beforeMs)
        ) {
          next = cand;
          break;
        }
      }
      const latest =
        next ??
        (mode === "instructor"
          ? await fetchInstructorLiveLocationFromServer(uid)
          : await fetchStudentLiveLocationFromServer(uid));
      setDisplay(latest);
      setMapNonce((n) => n + 1);
      if (
        beforeMs != null &&
        latest?.updatedAtMs != null &&
        latest.updatedAtMs <= beforeMs
      ) {
        setRefreshHint(
          mode === "instructor"
            ? "Запрос ушёл на устройство инструктора, но время координат в базе не изменилось. Нужен открытый кабинет инструктора, разрешённая геолокация и сеть."
            : "Запрос ушёл на устройство курсанта, но время координат в базе не изменилось. Нужен открытый кабинет курсанта, разрешённая геолокация и сеть."
        );
      }
    } catch (e) {
      setRefreshHint(e instanceof Error ? e.message : "Не удалось отправить запрос");
    } finally {
      setRefreshBusy(false);
    }
  }, [subjectUid, mode]);

  if (!open) return null;

  const { lat, lng, updatedAtMs, accuracyM } = display ?? {
    lat: 0,
    lng: 0,
    updatedAtMs: null,
    accuracyM: null,
  };
  const hasPoint = display != null && Number.isFinite(lat) && Number.isFinite(lng);
  const stale = updatedAtMs != null && Date.now() - updatedAtMs > STALE_MS;

  return (
    <div
      className="confirm-dialog-backdrop"
      role="presentation"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="confirm-dialog admin-gps-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-gps-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-gps-modal-head">
          <h2 id="admin-gps-modal-title" className="confirm-dialog-title">
            {title}
          </h2>
          <button
            type="button"
            className="btn btn-secondary btn-sm admin-gps-refresh-btn"
            disabled={refreshBusy}
            onClick={() => void handleRefresh()}
            aria-busy={refreshBusy}
            title={
              mode === "instructor"
                ? "Запросить новое местоположение с телефона/браузера инструктора (нужен открытый кабинет)"
                : "Запросить новое местоположение с телефона/браузера курсанта (нужен открытый кабинет)"
            }
          >
            {refreshBusy ? "…" : "Обновить"}
          </button>
        </div>
        {refreshHint ? (
          <p className="form-error admin-gps-refresh-hint" role="status">
            {refreshHint}
          </p>
        ) : null}
        {!hasPoint ? (
          <p className="confirm-dialog-message admin-gps-modal-hint">
            {mode === "instructor"
              ? "Нет данных о местоположении. Инструктору нужно открыть кабинет и разрешить доступ к геолокации в браузере. Точность зависит от GPS телефона; метр и меньше в вебе недостижимы без спец. оборудования."
              : "Нет данных о местоположении. Курсанту нужно открыть кабинет и разрешить доступ к геолокации в браузере. Точность зависит от GPS телефона."}
          </p>
        ) : (
          <>
            <p className={`admin-gps-meta${stale ? " admin-gps-meta--stale" : ""}`}>
              Обновлено: {formatAgo(updatedAtMs)}
              {stale ? " — данные могли устареть" : ""}
              {accuracyM != null ? (
                <>
                  {" "}
                  · браузер сообщил погрешность: ±{Math.round(accuracyM)} м (не всегда совпадает с реальностью)
                </>
              ) : null}
            </p>
            <p className="admin-gps-coords" title="WGS84 — как в GPS-навигаторах">
              WGS84: {lat.toFixed(6)}, {lng.toFixed(6)}
            </p>
            <p className="admin-gps-reality-hint">
              {mode === "instructor"
                ? "Координаты с устройства инструктора; карта — те же WGS84. Погрешность в километры обычно значит сеть/Wi‑Fi вместо GPS — на улице с включённой точной геолокацией обычно лучше."
                : "Координаты с устройства курсанта в кабинете; карта в тех же WGS84. Погрешность в километры обычно значит сеть/Wi‑Fi вместо GPS."}
              {!hasYandexMapsApiKey() ? (
                <>
                  {" "}
                  Без ключа <code>VITE_YANDEX_MAPS_API_KEY</code> в <code>.env</code> и пересборки карта не
                  подгрузится.
                </>
              ) : null}
            </p>
            <div className="admin-gps-map-wrap">
              <AdminGpsYandexMap
                key={`${lat}-${lng}-${accuracyM ?? "x"}-${mapNonce}`}
                lat={lat}
                lng={lng}
                accuracyM={accuracyM}
              />
            </div>
          </>
        )}
        <div className="confirm-dialog-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

function AdminGpsDriveLocationSharingSettings() {
  const { instructorsEnabled, studentsEnabled, ready } = useDriveLocationSharingUi();
  const [settingsErr, setSettingsErr] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);

  async function save(nextInstructors: boolean, nextStudents: boolean) {
    setSettingsErr(null);
    setSettingsBusy(true);
    try {
      await setDriveLocationSharingSettings({
        instructorsEnabled: nextInstructors,
        studentsEnabled: nextStudents,
      });
    } catch (e: unknown) {
      setSettingsErr(mapFirebaseError(e));
    } finally {
      setSettingsBusy(false);
    }
  }

  return (
    <div className="admin-gps-settings-panel glossy-panel">
      <h2 className="admin-gps-settings-title">Настройки</h2>
      <p className="admin-gps-settings-lead">
        Показывать геолокацию у пользователей: инструкторы и курсанты (кнопки в графике вождения). При
        выключении соответствующая кнопка скрывается.
      </p>
      {settingsErr ? (
        <div className="form-error admin-gps-settings-err" role="alert">
          {settingsErr}
        </div>
      ) : null}
      <div className="admin-settings-toggle-row admin-gps-settings-toggle-row">
        <div className="admin-settings-toggle-label" id="admin-gps-loc-instructors-label">
          Инструкторы
          <span className="admin-settings-toggle-hint">Кнопка «Посмотреть геолокацию» в «Мой график»</span>
        </div>
        <label className="switch-stay">
          <input
            type="checkbox"
            role="switch"
            checked={instructorsEnabled}
            disabled={!ready || settingsBusy}
            onChange={(e) => void save(e.target.checked, studentsEnabled)}
            aria-labelledby="admin-gps-loc-instructors-label"
            aria-checked={instructorsEnabled}
          />
          <span className="switch-stay-slider" aria-hidden />
        </label>
      </div>
      <div className="admin-settings-toggle-row admin-gps-settings-toggle-row">
        <div className="admin-settings-toggle-label" id="admin-gps-loc-students-label">
          Курсанты
          <span className="admin-settings-toggle-hint">Кнопка «Отправить геолокацию» в «График вождения»</span>
        </div>
        <label className="switch-stay">
          <input
            type="checkbox"
            role="switch"
            checked={studentsEnabled}
            disabled={!ready || settingsBusy}
            onChange={(e) => void save(instructorsEnabled, e.target.checked)}
            aria-labelledby="admin-gps-loc-students-label"
            aria-checked={studentsEnabled}
          />
          <span className="switch-stay-slider" aria-hidden />
        </label>
      </div>
    </div>
  );
}

export function AdminGpsTab() {
  const { totalGpsPingUnread, instructorHasGpsPingUnread, ackInstructorGpsPing } =
    useAdminGpsPing();
  const [instructors, setInstructors] = useState<UserProfile[]>([]);
  const [listErr, setListErr] = useState<string | null>(null);
  const [groups, setGroups] = useState<TrainingGroup[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [cadetsErr, setCadetsErr] = useState<string | null>(null);
  const [selectedInstructor, setSelectedInstructor] = useState<UserProfile | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [live, setLive] = useState<InstructorLiveLocation | null>(null);
  const [studentLive, setStudentLive] = useState<InstructorLiveLocation | null>(null);

  useEffect(() => {
    return subscribeInstructors(
      (list) => {
        setListErr(null);
        const active = list.filter((u) => u.accountStatus === "active");
        active.sort((a, b) =>
          a.displayName.localeCompare(b.displayName, "ru", { sensitivity: "base" })
        );
        setInstructors(active);
      },
      (e) => setListErr(e.message)
    );
  }, []);

  useEffect(() => {
    return subscribeTrainingGroups(
      (list) => {
        setCadetsErr(null);
        setGroups(list);
      },
      (e) => setCadetsErr(e.message)
    );
  }, []);

  useEffect(() => {
    return subscribeStudents(
      (list) => {
        setCadetsErr(null);
        setStudents(list);
      },
      (e) => setCadetsErr(e.message)
    );
  }, []);

  useEffect(() => {
    const uid = selectedInstructor?.uid?.trim() ?? "";
    if (!uid) {
      setLive(null);
      return () => {};
    }
    return subscribeInstructorLiveLocation(uid, setLive);
  }, [selectedInstructor?.uid]);

  useEffect(() => {
    const uid = selectedStudent?.uid?.trim() ?? "";
    if (!uid) {
      setStudentLive(null);
      return () => {};
    }
    return subscribeStudentLiveLocation(uid, setStudentLive);
  }, [selectedStudent?.uid]);

  useEffect(() => {
    const uid = selectedInstructor?.uid?.trim();
    if (!uid) return;
    ackInstructorGpsPing(uid);
  }, [selectedInstructor?.uid, ackInstructorGpsPing]);

  const activeStudents = useMemo(
    () => students.filter((s) => s.accountStatus === "active" && s.role === "student"),
    [students]
  );

  const groupsSorted = useMemo(
    () =>
      [...groups].sort((a, b) =>
        a.name.localeCompare(b.name, "ru", { sensitivity: "base" })
      ),
    [groups]
  );

  const studentsByGroup = useMemo(() => {
    const m = new Map<string, UserProfile[]>();
    for (const g of groups) {
      m.set(
        g.id,
        activeStudents.filter((s) => s.groupId === g.id)
      );
    }
    return m;
  }, [groups, activeStudents]);

  const ungroupedStudents = useMemo(
    () =>
      activeStudents.filter(
        (s) => !s.groupId || !groups.some((g) => g.id === s.groupId)
      ),
    [activeStudents, groups]
  );

  const instructorModalTitle = selectedInstructor
    ? `Геолокация: ${formatShortFio(selectedInstructor.displayName)}`
    : "";

  const studentModalTitle = selectedStudent
    ? `Геолокация: ${formatShortFio(selectedStudent.displayName)}`
    : "";

  return (
    <div className="admin-tab admin-gps-tab">
      <h1 className="admin-tab-title admin-tab-title--with-badge">
        GPS
        {totalGpsPingUnread > 0 ? (
          <span
            className="admin-gps-tab-title-badge"
            aria-label={`Новых уведомлений по геолокации: ${totalGpsPingUnread}`}
          >
            {totalGpsPingUnread > 99 ? "99+" : totalGpsPingUnread}
          </span>
        ) : null}
      </h1>
      <p className="admin-tab-lead">
        Координаты в режиме высокой точности (GPS). У инструкторов и курсантов — с открытого кабинета
        (живые координаты).
      </p>
      {listErr ? (
        <div className="form-error" role="alert">
          {listErr}
        </div>
      ) : null}

      <section className="admin-gps-section glossy-panel" aria-labelledby="admin-gps-instructors-heading">
        <h2 id="admin-gps-instructors-heading" className="admin-gps-section-title">
          Инструкторы
        </h2>
        <p className="admin-gps-section-lead">
          Живая геолокация с устройства инструктора (как в кабинете). Нажмите на ФИО, чтобы открыть карту.
        </p>
        {instructors.length === 0 ? (
          <p className="admin-empty">Нет активных инструкторов.</p>
        ) : (
          <div className="admin-gps-btn-grid" role="list">
            {instructors.map((ins) => {
              const unread = instructorHasGpsPingUnread(ins.uid);
              return (
                <span key={ins.uid} className="admin-gps-instructor-btn-wrap">
                  <button
                    type="button"
                    className="btn btn-secondary admin-gps-instructor-btn"
                    onClick={() => {
                      setSelectedStudent(null);
                      setSelectedInstructor(ins);
                    }}
                  >
                    {formatShortFio(ins.displayName)}
                  </button>
                  {unread ? (
                    <span
                      className="admin-gps-instructor-badge"
                      aria-label="Новые координаты с устройства инструктора"
                    >
                      1
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
        )}
      </section>

      <section className="admin-gps-section glossy-panel" aria-labelledby="admin-gps-cadets-heading">
        <h2 id="admin-gps-cadets-heading" className="admin-gps-section-title">
          Курсанты
        </h2>
        {cadetsErr ? (
          <div className="form-error" role="alert">
            {cadetsErr}
          </div>
        ) : null}
        {groupsSorted.length === 0 && ungroupedStudents.length === 0 ? (
          <p className="admin-empty">Нет курсантов с активным доступом.</p>
        ) : (
          <div className="admin-gps-cadets-by-group">
            {groupsSorted.map((g) => {
              const members = studentsByGroup.get(g.id) ?? [];
              return (
                <div key={g.id} className="admin-gps-cadet-group">
                  <h3 className="admin-gps-cadet-group-title">{g.name}</h3>
                  {members.length === 0 ? (
                    <p className="admin-empty admin-gps-cadet-group-empty">В группе пока никого нет.</p>
                  ) : (
                    <div className="admin-gps-btn-grid" role="list">
                      {members.map((st) => (
                        <button
                          key={st.uid}
                          type="button"
                          className="btn btn-secondary admin-gps-instructor-btn"
                          onClick={() => {
                            setSelectedInstructor(null);
                            setSelectedStudent(st);
                          }}
                        >
                          {formatShortFio(st.displayName)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {ungroupedStudents.length > 0 ? (
              <div className="admin-gps-cadet-group">
                <h3 className="admin-gps-cadet-group-title">Не в группе</h3>
                <div className="admin-gps-btn-grid" role="list">
                  {ungroupedStudents.map((st) => (
                    <button
                      key={st.uid}
                      type="button"
                      className="btn btn-secondary admin-gps-instructor-btn"
                      onClick={() => {
                        setSelectedInstructor(null);
                        setSelectedStudent(st);
                      }}
                    >
                      {formatShortFio(st.displayName)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <AdminGpsDriveLocationSharingSettings />
      <AdminGpsMapModal
        open={selectedInstructor != null}
        mode="instructor"
        subjectUid={selectedInstructor?.uid ?? ""}
        subscriptionLocation={live}
        title={instructorModalTitle}
        onClose={() => setSelectedInstructor(null)}
      />
      <AdminGpsMapModal
        open={selectedStudent != null}
        mode="student"
        subjectUid={selectedStudent?.uid ?? ""}
        subscriptionLocation={studentLive}
        title={studentModalTitle}
        onClose={() => setSelectedStudent(null)}
      />
    </div>
  );
}
