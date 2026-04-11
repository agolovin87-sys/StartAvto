import { appIconUrl } from "@/lib/appAssetVersion";

type AppBrandIconProps = {
  className?: string;
  /** Сторона квадрата в пикселях */
  size?: number;
  /** Пустая строка — декоративная иконка (рядом уже есть текст) */
  alt?: string;
};

export function AppBrandIcon({ className = "", size = 64, alt = "" }: AppBrandIconProps) {
  return (
    <img
      src={appIconUrl()}
      alt={alt}
      width={size}
      height={size}
      className={className ? `app-brand-icon ${className}` : "app-brand-icon"}
      decoding="async"
    />
  );
}
