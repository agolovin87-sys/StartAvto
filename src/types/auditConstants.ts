import type { ActionType } from "./audit";

/** Все значения для фильтров и выпадающих списков. */
export const ALL_ACTION_TYPES: ActionType[] = [
  "LOGIN",
  "LOGOUT",
  "LOGIN_FAILED",
  "CREATE_USER",
  "UPDATE_USER",
  "DELETE_USER",
  "CREATE_LESSON",
  "UPDATE_LESSON",
  "DELETE_LESSON",
  "CANCEL_LESSON",
  "COMPLETE_LESSON",
  "CREATE_CAR",
  "UPDATE_CAR",
  "DELETE_CAR",
  "CREATE_PAYMENT",
  "UPDATE_PAYMENT",
  "DELETE_PAYMENT",
  "EXPORT_REPORT",
  "PRINT_SCHEDULE",
  "UPDATE_SETTINGS",
  "SEND_PUSH",
];
