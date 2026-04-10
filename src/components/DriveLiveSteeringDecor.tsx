/**
 * Декоративный автомобильный руль (3 спицы) справа в карточке при активном вождении.
 */
export function DriveLiveSteeringDecor() {
  return (
    <span className="drive-live-steering-decor" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="9.35" stroke="currentColor" strokeWidth="1.75" />
        <g
          stroke="currentColor"
          strokeWidth="2.05"
          strokeLinecap="round"
          strokeLinejoin="round"
          transform="translate(12 12)"
        >
          <line x1="0" y1="-3.4" x2="0" y2="-9" />
          <g transform="rotate(120)">
            <line x1="0" y1="-3.4" x2="0" y2="-9" />
          </g>
          <g transform="rotate(240)">
            <line x1="0" y1="-3.4" x2="0" y2="-9" />
          </g>
        </g>
        <circle cx="12" cy="12" r="3.15" stroke="currentColor" strokeWidth="1.45" />
        <circle cx="12" cy="12" r="1.25" fill="currentColor" opacity="0.4" />
      </svg>
    </span>
  );
}
