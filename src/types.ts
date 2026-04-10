export type UserRole = "admin" | "instructor" | "student";

/** pending — ждёт решения админа; active — доступ; inactive — деактивирован; rejected — удалён из системы */
export type AccountStatus = "pending" | "active" | "inactive" | "rejected";

/** Последний тип клиента при входе в ЛК (пишет клиент в Firestore). */
export type CabinetClientKind = "ios" | "android" | "web" | "unknown";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: number;
  accountStatus: AccountStatus;
  /** Момент удаления из системы (при accountStatus === rejected), мс */
  rejectedAt?: number | null;
  /** Телефон (для инструкторов, редактирует админ) */
  phone: string;
  /** Учебный автомобиль (метка/номер) */
  vehicleLabel: string;
  /** Талоны (учётные единицы) */
  talons: number;
  /** Число завершённых вождений (слот completed: таймер до конца или досрочное завершение). */
  drivesCount: number;
  /** ID курсантов, закреплённых за инструктором */
  attachedStudentIds: string[];
  /** ID учебной группы (курсанты); пустая строка — не в группе */
  groupId: string;
  /** Круглое фото профиля (data URL), видно тем, кто видит карточку / контакт в чате. */
  avatarDataUrl?: string | null;
  /** Простое присутствие для чата (для UI "в сети/не в сети"). */
  presence?: {
    state: "online" | "offline";
    lastSeenAt: number | null;
    /** Периодически обновляется при открытом приложении (см. AppShell). */
    heartbeatAt?: number | null;
  };
  /** С какого устройства пользователь последний раз заходил в кабинет (для админ-превью). */
  lastCabinetClientKind?: CabinetClientKind;
}

/** Учебная группа (коллекция `groups`) */
/** Занятие вождений (коллекция `driveSlots`) */
export type DriveSlotStatus =
  | "pending_confirmation"
  | "scheduled"
  | "completed"
  | "cancelled";

export type DriveCancelledBy = "admin" | "instructor" | "student";

export interface DriveSlot {
  id: string;
  instructorId: string;
  /** Локальная дата YYYY-MM-DD */
  dateKey: string;
  /** Время начала HH:mm */
  startTime: string;
  studentId: string;
  /** ФИО из профиля на момент записи (для журнала без чтения users/{id}). */
  studentDisplayName: string;
  status: DriveSlotStatus;
  cancelledByRole: DriveCancelledBy | null;
  cancelReason: string;
  createdAt: number;
  /**
   * Момент нажатия «Начать вождение» (мс). Для завершённых слотов сохраняется как фактическое
   * начало (в т.ч. раньше графика); в активном слоте — до подтверждения курсантом таймер не идёт.
   */
  liveStartedAt: number | null;
  /** Курсант подтвердил — с этого момента идёт отсчёт таймера. */
  liveStudentAckAt: number | null;
  /** Накопленное время на паузе (мс). */
  liveTotalPausedMs: number;
  /** Начало текущей паузы (мс), иначе сессия идёт. */
  livePausedAt: number | null;
  /** Фактическое завершение вождения (мс), нужно для освобождения остатка 90-минутного окна. */
  liveEndedAt: number | null;
  /**
   * Инструктор нажал «Опаздываю»: сдвиг начала на 5/10/15 мин (для статуса у курсанта); при старте сессии сбрасывается.
   */
  instructorLateShiftMin: number | null;
}

export type FreeDriveWindowStatus = "open" | "reserved";

export interface FreeDriveWindow {
  id: string;
  instructorId: string;
  dateKey: string;
  startTime: string;
  /** uid курсанта, который забронировал окно; null — ещё никто. */
  studentId: string | null;
  status: FreeDriveWindowStatus;
  createdAt: number;
}

export interface TrainingGroup {
  id: string;
  name: string;
  /** true: задан период обучения (даты); false: без срока */
  hasTrainingPeriod: boolean;
  /** Начало периода (мс), только если hasTrainingPeriod */
  trainingStartMs: number | null;
  /** Конец периода (мс), только если hasTrainingPeriod */
  trainingEndMs: number | null;
  createdAt: number;
  /**
   * Опционально: id документа `chats/group_*` — курсанты с этим `users.groupId`
   * автоматически попадают в `participantIds`; инструкторы — если у них в закреплении
   * есть курсант из этой учебной группы.
   */
  linkedChatGroupId?: string;
}

/** Чат (коллекции `chats/*` и вложенные `messages`). */
export type ChatMessageType = "text" | "voice" | "image" | "file";

export type ChatReactionMap = Record<string, string[]>; // emoji -> userIds

export interface ChatRoom {
  id: string;
  participantIds: string[];
  /** Email участников (lowercase) для восстановления доступа при рассинхроне uid. */
  participantEmailsLower?: string[];
  /** По умолчанию пара 1:1; `group` — групповой чат */
  kind?: "pair" | "group";
  /**
   * manual — состав задаёт админ вручную (только отмеченные участники),
   * linkedGroup — состав синхронизируется от привязанной учебной группы.
   */
  membershipMode?: "manual" | "linkedGroup";
  /** Название группы */
  title?: string;
  /** Аватар группы (data URL) */
  avatarDataUrl?: string | null;
  createdAt: number;
  lastMessageAt: number | null;
  lastMessageText: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  type: ChatMessageType;
  text: string;
  /** Base64 data URL (MVP; без Storage). */
  payloadDataUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  replyToMessageId?: string | null;
  /** Сообщение создано пересылкой */
  forwarded?: boolean;
  createdAt: number;
  editedAt?: number | null;
  reactions?: ChatReactionMap;
  deletedForMeBy?: string[];
  deletedForAll?: boolean;
}
