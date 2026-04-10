export const INSTRUCTOR_VEHICLES = [
  "Lada Granta Х180ТА 102RUS",
  "Renault Logan А525ВО 102RUS",
] as const;

export type InstructorVehicle = (typeof INSTRUCTOR_VEHICLES)[number];
