/** Компактные SVG для заголовков блоков личного кабинета курсанта (currentColor). */

export function IconCabinetTalon(props: { className?: string }) {
  return (
    <svg
      className={props.className ?? "student-cab-section-ico"}
      viewBox="0 0 24 24"
      width={22}
      height={22}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-4h16v4zm0-6H4V6h16v6z"
      />
    </svg>
  );
}

export function IconCabinetOps(props: { className?: string }) {
  return (
    <svg
      className={props.className ?? "student-cab-section-ico"}
      viewBox="0 0 24 24"
      width={22}
      height={22}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"
      />
    </svg>
  );
}

export function IconCabinetProgress(props: { className?: string }) {
  return (
    <svg
      className={props.className ?? "student-cab-section-ico"}
      viewBox="0 0 24 24"
      width={22}
      height={22}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93s3.06-7.44 7-7.93v15.86zm2-15.86c3.94.49 7 3.85 7 7.93s-3.06 7.44-7 7.93V4.07z"
      />
    </svg>
  );
}

export function IconCabinetHistory(props: { className?: string }) {
  return (
    <svg
      className={props.className ?? "student-cab-section-ico"}
      viewBox="0 0 24 24"
      width={22}
      height={22}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.25 2.52.72-1.21-3.47-2.06V8H12z"
      />
    </svg>
  );
}

export function IconCabinetExams(props: { className?: string }) {
  return (
    <svg
      className={props.className ?? "student-cab-section-ico"}
      viewBox="0 0 24 24"
      width={22}
      height={22}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3 1 9l11 6 9-4.91V17h2V9L12 3z"
      />
    </svg>
  );
}

export function IconCabinetDrivingExam(props: { className?: string }) {
  return (
    <svg
      className={props.className ?? "student-cab-section-ico"}
      viewBox="0 0 24 24"
      width={22}
      height={22}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"
      />
    </svg>
  );
}

/** Внутренний экзамен — теория (ЛК курсанта). */
export function IconStudentCabExamTheory(props: { className?: string }) {
  return (
    <svg
      className={props.className ?? "student-cab-exams-ico"}
      viewBox="0 0 24 24"
      width={20}
      height={20}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M18 2H6a2 2 0 00-2 2v16c0 1.1.9 2 2 2h12a2 2 0 002-2V4a2 2 0 00-2-2zM9 4h2v8.17l-1-.6-1 .6V4zm9 16H6v-2h12v2zm0-4H6v-2h12v2zm0-4H6V8h12v4z"
      />
    </svg>
  );
}

/** Экзамен в РЭО ГИБДД (ЛК курсанта). */
export function IconStudentCabExamGibdd(props: { className?: string }) {
  return (
    <svg
      className={props.className ?? "student-cab-exams-ico"}
      viewBox="0 0 24 24"
      width={20}
      height={20}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 6h2v5h-2V7zm0 7h2v2h-2v-2z"
      />
    </svg>
  );
}
