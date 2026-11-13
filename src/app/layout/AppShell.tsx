import { useEffect, useState, type CSSProperties } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Header } from "./Header";
import { IdleTimeout } from "./IdleTimeout";
import { Sidebar } from "./Sidebar";
import { Modal, Toast } from "@/shared/ui";
import { useToast } from "@/shared/ui/toast";

export function AppShell() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("efetov:sidebar-collapsed") === "true"; } catch { return false; }
  });
  const location = useLocation();
  useEffect(() => { try { localStorage.setItem("efetov:sidebar-collapsed", String(collapsed)); } catch { /* Preference storage is optional. */ } }, [collapsed]);
  useEffect(() => {
    const desktop = matchMedia("(min-width: 1280px)");
    const close = () => { if (desktop.matches) setMobileMenu(false); };
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);
  const { toast } = useToast();

  return (
    <div className="flex min-h-screen bg-slate-50/80" style={{ "--app-sidebar-width": collapsed ? "80px" : "256px" } as CSSProperties}>
      <IdleTimeout />
      <aside id="desktop-sidebar" aria-label="Боковое меню" className={`sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-950 text-white xl:flex ${collapsed ? "w-20 p-3" : "w-64 p-5"}`}>
        <div className={`mb-4 flex ${collapsed ? "justify-center" : "justify-end"}`}><button type="button" className="touch-target flex size-9 items-center justify-center rounded-md text-slate-300 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" title={collapsed ? "Развернуть меню" : "Свернуть меню"} aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"} aria-expanded={!collapsed} aria-controls="desktop-sidebar" onClick={() => setCollapsed(!collapsed)}>{collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</button></div>
        <Sidebar collapsed={collapsed} />
      </aside>
      {mobileMenu ? (
        <Modal title="Навигация" onClose={() => setMobileMenu(false)} className="left-0 top-0 h-dvh max-h-dvh w-[min(320px,calc(100vw-2rem))] max-w-none translate-x-0 translate-y-0 rounded-none border-slate-800 bg-slate-950 text-white">
          <aside className="flex min-h-full flex-col p-6 pt-12 text-white">
            <Sidebar onNavigate={() => setMobileMenu(false)} />
          </aside>
        </Modal>
      ) : null}
      <main className="min-w-0 flex-1">
        <Header onOpenMenu={() => setMobileMenu(true)} />
        <section className={`mx-auto p-4 sm:p-6 2xl:p-8 ${location.pathname === "/files" ? "workspace-files w-full" : "max-w-[1760px]"}`}>
          <Outlet />
        </section>
      </main>
      <Toast message={toast} />
    </div>
  );
}
