import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";
import { AuthProvider } from "@/features/auth/AuthProvider";
import { ToastProvider } from "@/shared/ui/toast";
import { appRoutes } from "./router";
import { NavigationGuard } from "@/features/patient/NavigationGuard";

function RootProviders() {
  return (
      <ToastProvider>
        <AuthProvider>
          <NavigationGuard><Outlet /></NavigationGuard>
        </AuthProvider>
      </ToastProvider>
  );
}
const router = createBrowserRouter([{ element: <RootProviders />, children: appRoutes() }]);
export function AppProviders() { return <RouterProvider router={router} />; }
