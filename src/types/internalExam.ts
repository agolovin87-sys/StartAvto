/**
 * Внутренний экзамен по вождению (до ГИБДД): сессии, листы, представления для курсанта.
 */

/** Упражнения на площадке / маршруте (отметка «выполнено»). */
export const INTERNAL_EXAM_EXERCISES: { id: string; label: string }[] = [
  {
    id: "ex_park_90_rev",
    label:
      "Постановка транспортного средства на место стоянки при движении задним ходом с поворотом на 90 градусов",
  },
  {
    id: "ex_park_parallel_rev",
    label:
      "Постановка транспортного средства на место стоянки параллельно тротуару (краю проезжей части) при движении задним ходом",
  },
  {
    id: "ex_turnaround_narrow_rev",
    label:
      "Разворот транспортного средства в ограниченном пространстве (при ограниченной ширине проезжей части) с использованием движения задним ходом",
  },
  {
    id: "ex_hill_start",
    label: "Остановка и начало движения на подъеме",
  },
  {
    id: "ex_park_parallel_fwd",
    label:
      "Постановка транспортного средства параллельно тротуару (краю проезжей части) при движении по направлению вперед",
  },
  {
    id: "ex_intersection_regulated",
    label: "Проезд регулируемого перекрестка (при его наличии)",
  },
];

export type InternalExamErrorPoints = 7 | 4 | 3 | 2 | 1;

/** Штрафные нарушения по подразделам (баллы фиксированы для каждого пункта). */
export const INTERNAL_EXAM_ERRORS: {
  id: string;
  label: string;
  points: InternalExamErrorPoints;
}[] = [
  // — 7 баллов —
  {
    id: "e7_intervention",
    points: 7,
    label:
      "Действие или бездействие кандидата в водители, вызвавшее необходимость вмешательства в процесс управления экзаменационным транспортным средством с целью предотвращения возникновения дорожно-транспортного происшествия",
  },
  {
    id: "e7_yield_vehicle",
    points: 7,
    label: "Не уступил дорогу (создал помеху) транспортному средству, имеющему преимущество",
  },
  {
    id: "e7_yield_ped",
    points: 7,
    label: "Не уступил дорогу (создал помеху) пешеходам, имеющим преимущество",
  },
  {
    id: "e7_oncoming_tram",
    points: 7,
    label:
      "Выехал на полосу встречного движения (кроме разрешенных случаев) или на трамвайные пути встречного направления",
  },
  {
    id: "e7_forbid_signal",
    points: 7,
    label: "Осуществлял движение на запрещающий сигнал светофора или регулировщика",
  },
  {
    id: "e7_signs_priority",
    points: 7,
    label:
      "Не выполнил требования знаков приоритета, запрещающих и предписывающих знаков, дорожной разметки 1.1, 1.11 (разделяющей потоки противоположенного или попутного направления), 1.3, а также знаков особых предписаний",
  },
  {
    id: "e7_quit_exam",
    points: 7,
    label: "Покинул экзамен (отказался от сдачи экзамена) после его начала",
  },
  {
    id: "e7_overtake",
    points: 7,
    label: "Нарушил правила выполнения обгона",
  },
  {
    id: "e7_turn",
    points: 7,
    label: "Нарушил правила выполнения поворота",
  },
  {
    id: "e7_uturn",
    points: 7,
    label: "Нарушил правила выполнения разворота",
  },
  {
    id: "e7_reverse",
    points: 7,
    label: "Нарушил правила движения задним ходом",
  },
  {
    id: "e7_railway",
    points: 7,
    label: "Нарушил правила проезда железнодорожных переездов",
  },
  {
    id: "e7_speed",
    points: 7,
    label: "Превысил разрешенную максимальную скорость движения",
  },
  {
    id: "e7_phone",
    points: 7,
    label: "Использовал во время движения телефон и (или) иное средство связи",
  },
  // — 4 балла —
  {
    id: "e4_seatbelt",
    points: 4,
    label: "Осуществлял движение, не пристегнувшись ремнём безопасности",
  },
  {
    id: "e4_jam_crossing",
    points: 4,
    label:
      "Выехал на перекресток или остановился на пешеходном переходе при образовавшемся заторе",
  },
  {
    id: "e4_slow_stop",
    points: 4,
    label: "В установленных случаях не снизил скорость и (или) не остановился",
  },
  {
    id: "e4_passengers",
    points: 4,
    label: "Нарушил правила перевозки пассажиров",
  },
  {
    id: "e4_ignore_examiner",
    points: 4,
    label: "Не приступил к выполнению (проигнорировал) задания экзаменатора",
  },
  {
    id: "e4_stop_line",
    points: 4,
    label:
      "Пересек стоп-линию (разметка 1.12) при остановке (при наличии знака 2.5 или при запрещающем сигнале светофора (регулировщика)",
  },
  // — 3 балла —
  {
    id: "e3_stop_parking",
    points: 3,
    label: "Нарушил правила остановки или стоянки",
  },
  {
    id: "e3_turn_signal",
    points: 3,
    label:
      "Не подал сигнал световым указателем поворота перед началом движения, перестроением, поворотом (разворотом) или остановкой",
  },
  {
    id: "e3_hazard_lights",
    points: 3,
    label: "Нарушил правила применения аварийной сигнализации",
  },
  {
    id: "e3_err_park_90",
    points: 3,
    label:
      "Допустил ошибку при выполнении постановки транспортного средства на место стоянки при движении задним ходом с поворотом на 90 градусов",
  },
  {
    id: "e3_err_park_parallel_rev",
    points: 3,
    label:
      "Допустил ошибку при выполнении постановки транспортного средства на место стоянки параллельно тротуару (краю проезжей части) при движении задним ходом",
  },
  {
    id: "e3_err_turnaround",
    points: 3,
    label:
      "Допустил ошибку при выполнении разворота транспортного средства в ограниченном пространстве (при ограниченной ширине проезжей части) с использованием движения задним ходом",
  },
  {
    id: "e3_err_hill",
    points: 3,
    label:
      "Допустил ошибку при выполнении остановки и начале движения на подъеме",
  },
  // — 2 балла —
  {
    id: "e2_marking",
    points: 2,
    label:
      "Не выполнил требования дорожной разметки (кроме разметки 1.1, 1.11, 1.3, 1.12 в случаях, указанных в пунктах 2.6 и 3.6 экзаменационного листа)",
  },
  {
    id: "e2_lane_position",
    points: 2,
    label: "Нарушил правила расположения транспортного средства на проезжей части",
  },
  {
    id: "e2_lights_horn",
    points: 2,
    label:
      "Нарушил правила пользования внешними световыми приборами и звуковым сигналом",
  },
  {
    id: "e2_slow_obstruction",
    points: 2,
    label:
      "Двигался без необходимости со слишком малой скоростью, создавая помехи другим транспортным средствам",
  },
  // — 1 балл —
  {
    id: "e1_signal_untimely",
    points: 1,
    label: "Несвоевременно подал сигнал поворота",
  },
  {
    id: "e1_signal_late_on",
    points: 1,
    label:
      "Незаблаговременно подал (включил) сигнал указателя поворота при начале или в процессе совершения маневра",
  },
  {
    id: "e1_signal_off_early",
    points: 1,
    label: "Выключил сигнал указателя поворота до завершения маневра",
  },
  {
    id: "e1_signal_stay_on",
    points: 1,
    label: "Не выключил сигнал указателя поворота по завершении маневра",
  },
  {
    id: "e1_road_assessment",
    points: 1,
    label:
      "Неправильно оценил дорожную обстановку (не воспользовался преимуществом проезда)",
  },
  {
    id: "e1_controls",
    points: 1,
    label: "Неуверенно пользовался органами управления транспортного средства",
  },
  {
    id: "e1_harsh_start",
    points: 1,
    label: "При начале движения допустил резкий старт (рывок)",
  },
  {
    id: "e1_harsh_brake",
    points: 1,
    label:
      "Резко затормозил при отсутствии необходимости предотвращения дорожно-транспортного происшествия",
  },
  {
    id: "e1_gear",
    points: 1,
    label:
      "Начал движение, включив неверную передачу; двигался на передаче, не соответствующей скорости движения",
  },
  {
    id: "e1_extra_controls",
    points: 1,
    label:
      "Без необходимости задействовал другие органы управления либо не использовал стеклоочиститель при необходимости",
  },
  {
    id: "e1_handbrake",
    points: 1,
    label: "Начал движение с включенным стояночным тормозом",
  },
  {
    id: "e1_engine_stall",
    points: 1,
    label: "Допустил остановку двигателя",
  },
  {
    id: "e1_rollback",
    points: 1,
    label:
      "Допустил неконтролируемый откат транспортного средства назад на участке подъема без угрозы совершения дорожно-транспортного происшествия (за исключением пункта 4.7 экзаменационного листа)",
  },
  {
    id: "e1_other_pdd",
    points: 1,
    label: "Допустил иные нарушения ПДД",
  },
];

/** Порядок подразделов в листе и в экспорте. */
export const INTERNAL_EXAM_ERROR_POINT_ORDER: readonly InternalExamErrorPoints[] = [
  7, 4, 3, 2, 1,
];

/** Заголовок группы нарушений по числу баллов (грамматика для русского UI). */
export function internalExamErrorSubsectionTitle(points: InternalExamErrorPoints): string {
  switch (points) {
    case 7:
      return "7 баллов";
    case 4:
      return "4 балла";
    case 3:
      return "3 балла";
    case 2:
      return "2 балла";
    default:
      return "1 балл";
  }
}

/**
 * При сумме штрафных баллов ≥ этого значения экзамен не сдан (зачёт при сумме строго меньше).
 */
export const INTERNAL_EXAM_FAIL_MIN_POINTS = 7;

export interface InternalExamStudent {
  studentId: string;
  studentName: string;
  studentGroup: string;
  status: "pending" | "in_progress" | "passed" | "failed";
  examSheetId?: string;
  /** Момент нажатия «Начать экзамен» (мс, Unix). */
  examStartedAt?: number;
  totalPoints?: number;
  completedAt?: number;
}

export interface InternalExamSession {
  id: string;
  groupId: string;
  groupName: string;
  examDate: string;
  examTime: string;
  instructorId: string;
  instructorName: string;
  students: InternalExamStudent[];
  /** Для запросов array-contains по курсанту */
  studentIds: string[];
  createdAt: number;
  completedAt?: number;
  /** Скрыто из основного списка у инструктора; курсант и админ видят сессию как обычно. */
  instructorArchivedAt?: number;
  /** Скрыто из основной таблицы у админа (раздел «Архив» внизу). */
  adminArchivedAt?: number;
  /** Админ убрал сессию из своего списка архива (документ не удаляется). */
  adminArchiveDismissedAt?: number;
  /** Инструктор убрал сессию из своего архива (у курсанта без изменений). */
  instructorArchiveDismissedAt?: number;
}

export interface InternalExamSheet {
  id: string;
  examSessionId: string;
  studentId: string;
  studentName: string;
  instructorId: string;
  instructorName: string;
  /** Марка, модель, госномер (из профиля инструктора при начале экзамена). */
  trainingVehicleLabel?: string;
  examDate: string;
  examTime: string;
  exercises: Record<string, boolean>;
  errors: Record<string, boolean | number>;
  totalPoints: number;
  isPassed: boolean;
  examinerComment: string;
  /** PNG data URL (после завершения экзамена), для вставки в Word/PDF. */
  instructorSignatureDataUrl?: string;
  studentSignatureDataUrl?: string;
  createdAt: number;
  isDraft?: boolean;
}

export interface StudentExamView {
  id: string;
  examSessionId: string;
  studentId: string;
  studentName: string;
  instructorId: string;
  instructorName: string;
  examDate: string;
  examTime: string;
  status: "pending" | "in_progress" | "passed" | "failed";
  totalPoints?: number;
  examSheetId?: string;
  /** Не хранится в БД — только для клиента после генерации */
  examSheetUrl?: string;
  completedAt?: number;
}

export function emptyExerciseState(): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  for (const e of INTERNAL_EXAM_EXERCISES) o[e.id] = false;
  return o;
}

export function emptyErrorState(): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  for (const e of INTERNAL_EXAM_ERRORS) o[e.id] = false;
  return o;
}

/** Сумма баллов по отмеченным нарушениям. */
export function sumInternalExamPenaltyPoints(errors: Record<string, boolean | number>): number {
  let sum = 0;
  for (const def of INTERNAL_EXAM_ERRORS) {
    const v = errors[def.id];
    if (v === true || v === 1) sum += def.points;
  }
  return sum;
}

/** Зачёт при сумме меньше 7 баллов, незачёт при 7 и более баллах. */
export function isInternalExamPassed(totalPoints: number): boolean {
  return totalPoints < INTERNAL_EXAM_FAIL_MIN_POINTS;
}
