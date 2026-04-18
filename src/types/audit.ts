/**
 * Типы журнала аудита (безопасность и разбор споров).
 * Хранение: Firestore `auditLogs`.
 */

export type ActionType =
  | "LOGIN"
  | "LOGOUT"
  | "LOGIN_FAILED"
  | "CREATE_USER"
  | "UPDATE_USER"
  | "DELETE_USER"
  | "CREATE_LESSON"
  | "UPDATE_LESSON"
  | "DELETE_LESSON"
  | "CANCEL_LESSON"
  | "COMPLETE_LESSON"
  | "CREATE_CAR"
  | "UPDATE_CAR"
  | "DELETE_CAR"
  | "CREATE_PAYMENT"
  | "UPDATE_PAYMENT"
  | "DELETE_PAYMENT"
  | "EXPORT_REPORT"
  | "PRINT_SCHEDULE"
  | "UPDATE_SETTINGS"
  | "SEND_PUSH";

export type EntityType =
  | "user"
  | "lesson"
  | "car"
  | "payment"
  | "schedule"
  | "settings"
  | "system";

export type AuditUserRole = "admin" | "instructor" | "student";

/** Полезная нагрузка для `addDoc` (id задаётся Firestore, timestamp опционален). */
export type AuditLogWritePayload = Omit<AuditLog, "id" | "timestamp"> & {
  timestamp?: number;
};

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: AuditUserRole;
  action: ActionType;
  entityType: EntityType;
  entityId?: string;
  /** Краткое человекочитаемое описание (шаблоны из ТЗ). */
  entityName?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  timestamp: number;
  status: "success" | "failed";
  errorMessage?: string;
}

export type AuditLogFilters = {
  dateFrom?: number;
  dateTo?: number;
  userId?: string;
  action?: ActionType | "";
  status?: "success" | "failed" | "";
  search?: string;
};
