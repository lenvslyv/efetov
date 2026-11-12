import { Navigate, Outlet, useLocation } from "react-router-dom";
import { can, type Permission } from "@/entities/user/roles";
import { restoredPath } from "./recovery";
import { useAuth } from "./useAuth";

export function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function GuestOnly() {
  const { user } = useAuth();
  if (user) {
    return <Navigate to={restoredPath(user.id)} replace />;
  }
  return <Outlet />;
}

export function RequirePermission({ permission }: { permission: Permission }) {
  const { user } = useAuth();
  if (!can(user?.role, permission)) {
    return <Navigate to="/journal" replace />;
  }
  return <Outlet />;
}
