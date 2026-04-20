/** Иконки заголовков блоков личного кабинета инструктора (currentColor, тема — небо/акцент). */

export function IconInstructorCabinetTalon(props: { className?: string }) {
  return (
    <svg
      className={props.className ?? "instructor-cab-section-ico"}
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

export function IconInstructorCabinetOps(props: { className?: string }) {
  return (
    <svg
      className={props.className ?? "instructor-cab-section-ico"}
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

export function IconInstructorCabinetRating(props: { className?: string }) {
  return (
    <svg
      className={props.className ?? "instructor-cab-section-ico"}
      viewBox="0 0 24 24"
      width={22}
      height={22}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
      />
    </svg>
  );
}

export function IconInstructorCabinetVehicle(props: { className?: string }) {
  return (
    <svg
      className={props.className ?? "instructor-cab-section-ico"}
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
