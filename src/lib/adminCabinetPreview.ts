/** Полный URL предпросмотра ЛК под админом (новая вкладка). */
export function adminPreviewCabinetHref(role: "instructor" | "student", uid: string): string {
  const path = `/app/admin/view/${role}/${encodeURIComponent(uid.trim())}`;
  return new URL(path, window.location.origin).href;
}

export function openAdminPreviewCabinet(role: "instructor" | "student", uid: string): void {
  const href = adminPreviewCabinetHref(role, uid);
  window.open(href, "_blank", "noopener,noreferrer");
}
