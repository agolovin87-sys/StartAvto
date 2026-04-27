import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { PageLoading } from "@/components/PageLoading";
import { CabinetSubjectProvider } from "@/context/CabinetSubjectContext";
import { getUserProfile } from "@/firebase/users";
import { InstructorCabinet } from "@/pages/instructor/InstructorCabinet";
import { StudentCabinet } from "@/pages/student/StudentCabinet";

function PreviewGate({
  expectedRole,
  children,
}: {
  expectedRole: "instructor" | "student";
  children: ReactNode;
}) {
  const { uid } = useParams<{ uid: string }>();
  const [state, setState] = useState<"loading" | "ok" | "bad">("loading");

  useEffect(() => {
    const id = uid?.trim();
    if (!id) {
      setState("bad");
      return;
    }
    let cancelled = false;
    void (async () => {
      const p = await getUserProfile(id);
      if (cancelled) return;
      if (!p || p.role !== expectedRole) setState("bad");
      else setState("ok");
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, expectedRole]);

  const id = uid?.trim() ?? "";
  if (!id) return <Navigate to="/app/admin" replace />;
  if (state === "loading") return <PageLoading />;
  if (state === "bad")
    return (
      <div className="admin-dashboard">
        <div className="admin-dashboard-content" style={{ padding: "1rem" }}>
          <p className="form-error" role="alert">
            Не удалось открыть кабинет: пользователь не найден или роль не совпадает.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => (window.location.href = "/app/admin")}>
            На главную админки
          </button>
        </div>
      </div>
    );

  return <CabinetSubjectProvider uid={id}>{children}</CabinetSubjectProvider>;
}

export function AdminStudentCabinetPreview() {
  return (
    <PreviewGate expectedRole="student">
      <StudentCabinet />
    </PreviewGate>
  );
}

export function AdminInstructorCabinetPreview() {
  return (
    <PreviewGate expectedRole="instructor">
      <InstructorCabinet />
    </PreviewGate>
  );
}
