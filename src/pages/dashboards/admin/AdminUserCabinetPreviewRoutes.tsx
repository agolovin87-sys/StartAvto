import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { PageLoading } from "@/components/PageLoading";
import { CabinetSubjectProvider } from "@/context/CabinetSubjectContext";
import { useAuth } from "@/context/AuthContext";
import { InstructorCabinet } from "@/pages/instructor/InstructorCabinet";
import { StudentCabinet } from "@/pages/student/StudentCabinet";

function PreviewGate({
  children,
}: {
  children: ReactNode;
}) {
  const { uid } = useParams<{ uid: string }>();
  const { user, loading } = useAuth();
  const [state, setState] = useState<"ok" | "bad">("ok");

  useEffect(() => {
    if (loading) return;
    if (!user?.uid) {
      setState("bad");
      return;
    }
    const id = uid?.trim();
    if (!id) {
      setState("bad");
      return;
    }
    setState("ok");
  }, [uid, user?.uid, loading]);

  const id = uid?.trim() ?? "";
  if (!id) return <Navigate to="/app/admin" replace />;
  if (loading) return <PageLoading />;
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
    <PreviewGate>
      <StudentCabinet />
    </PreviewGate>
  );
}

export function AdminInstructorCabinetPreview() {
  return (
    <PreviewGate>
      <InstructorCabinet />
    </PreviewGate>
  );
}
