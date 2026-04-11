import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { isFirebaseConfigured } from "@/firebase/config";
import { useAuth } from "@/context/AuthContext";
import { SetupFirebase } from "@/pages/SetupFirebase";
import { LoginPage } from "@/pages/LoginPage";
import { RegisterPage } from "@/pages/RegisterPage";
import { InstallAppPage } from "@/pages/InstallAppPage";
import { AdminDashboard } from "@/pages/dashboards/AdminDashboard";
import { InstructorDashboard } from "@/pages/dashboards/InstructorDashboard";
import { StudentDashboard } from "@/pages/dashboards/StudentDashboard";
import {
  InactiveAccountScreen,
  PendingApprovalScreen,
  RejectedAccountScreen,
} from "@/pages/AccountScreens";
import { AppShell } from "@/components/AppShell";
import { PageLoading } from "@/components/PageLoading";
import { ChatUnreadProvider } from "@/context/ChatUnreadContext";
import { InstructorOnboardingProvider } from "@/context/InstructorOnboardingContext";
import { StudentOnboardingProvider } from "@/context/StudentOnboardingContext";
import { GlobalIncomingChatAlerts } from "@/chat/GlobalIncomingChatAlerts";
import type { UserRole } from "@/types";

function RoleHome() {
  const { profile } = useAuth();
  if (!profile) return <Navigate to="/login" replace />;
  switch (profile.role) {
    case "admin":
      return <Navigate to="/app/admin" replace />;
    case "instructor":
      return <Navigate to="/app/instructor" replace />;
    case "student":
      return <Navigate to="/app/student" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
}

function ProtectedApp({ role }: { role: UserRole }) {
  const { profile, loading } = useAuth();
  if (loading) return <PageLoading />;
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.role !== role) return <RoleHome />;

  if (profile.role !== "admin") {
    if (profile.accountStatus === "rejected") {
      return (
        <AppShell>
          <RejectedAccountScreen />
        </AppShell>
      );
    }
    if (profile.accountStatus === "pending") {
      return (
        <AppShell>
          <PendingApprovalScreen />
        </AppShell>
      );
    }
    if (profile.accountStatus === "inactive") {
      return (
        <AppShell>
          <InactiveAccountScreen />
        </AppShell>
      );
    }
  }

  return (
    <AppShell>
      <ChatUnreadProvider>
        <GlobalIncomingChatAlerts />
        {role === "admin" && <AdminDashboard />}
        {role === "instructor" && <InstructorDashboard />}
        {role === "student" && <StudentDashboard />}
      </ChatUnreadProvider>
    </AppShell>
  );
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  if (!isFirebaseConfigured) return <>{children}</>;
  if (loading || (user && !profile)) {
    return <PageLoading />;
  }
  if (user && profile) return <RoleHome />;
  return <>{children}</>;
}

export default function App() {
  if (!isFirebaseConfigured) {
    return (
      <Routes>
        <Route path="*" element={<SetupFirebase />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <GuestOnly>
            <Navigate to="/login" replace />
          </GuestOnly>
        }
      />
      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/register"
        element={
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        }
      />
      <Route path="/install" element={<InstallAppPage />} />
      <Route path="/app" element={<RoleHome />} />
      <Route
        path="/app/admin"
        element={<ProtectedApp role="admin" />}
      />
      <Route
        path="/app/instructor"
        element={
          <InstructorOnboardingProvider>
            <ProtectedApp role="instructor" />
          </InstructorOnboardingProvider>
        }
      />
      <Route
        path="/app/student"
        element={
          <StudentOnboardingProvider>
            <ProtectedApp role="student" />
          </StudentOnboardingProvider>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
