type IconInstallAppProps = {
  className?: string;
};

/** Значок «установить / скачать приложение» (как в шапке кабинета). */
export function IconInstallApp({ className = "shell-install-ico" }: IconInstallAppProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
    </svg>
  );
}
