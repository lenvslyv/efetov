import { createRoutesFromElements, Navigate, Route } from "react-router-dom";
import { AppShell } from "@/app/layout/AppShell";
import { GuestOnly, RequireAuth, RequirePermission } from "@/features/auth/guards";
import { AdminPage } from "@/pages/AdminPage";
import { AuditPage } from "@/pages/AuditPage";
import { FilesPage } from "@/pages/FilesPage";
import { JournalPage } from "@/pages/JournalPage";
import { LoginPage } from "@/pages/LoginPage";
import { PatientCardPage } from "@/pages/PatientCardPage";
import { PatientNewPage } from "@/pages/PatientNewPage";

export function appRoutes() {
  return createRoutesFromElements(
    <>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="/journal" element={<JournalPage />} />
          <Route element={<RequirePermission permission="patient.create" />}>
            <Route path="/patients/new" element={<PatientNewPage />} />
          </Route>
          <Route path="/patients/:id" element={<PatientCardPage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route element={<RequirePermission permission="audit.view" />}>
            <Route path="/audit" element={<AuditPage />} />
          </Route>
          <Route element={<RequirePermission permission="users.manage" />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="/" element={<Navigate to="/journal" replace />} />
      <Route path="*" element={<Navigate to="/journal" replace />} />
    </>
  );
}
