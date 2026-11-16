import { useEffect, useState, type CSSProperties } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Header } from "./Header";
import { IdleTimeout } from "./IdleTimeout";
import { UiActivity } from "./UiActivity";
import { Sidebar } from "./Sidebar";
import { Modal, Toast } from "@/shared/ui";
import { useToast } from "@/shared/ui/toast";

export function AppShell() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 1279px)").matches);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("efetov:sidebar-collapsed") === "true"; } catch { return false; }
  });
  const location = useLocation();
  useEffect(() => { try { localStorage.setItem("efetov:sidebar-collapsed", String(collapsed)); } catch { /* Preference storage is optional. */ } }, [collapsed]);
  useEffect(() => {
    const media = matchMedia("(max-width: 1279px)");
    const update = () => { setCompact(media.matches); if (!media.matches) setMobileMenu(false); };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const { toast } = useToast();
  const railCollapsed = compact || collapsed;

  return (
    <div className="flex min-h-screen bg-slate-50/80" style={{ "--app-sidebar-width": railCollapsed ? "80px" : "304px" } as CSSProperties}>
      <IdleTimeout />
      <UiActivity />
      <aside id="desktop-sidebar" aria-label="Боковое меню" className={`sticky top-0 z-30 flex h-dvh shrink-0 flex-col overflow-y-auto border-r border-[#23334d] bg-[#09162e] text-white ${railCollapsed ? "w-20 p-3" : "w-[304px] p-5"}`}>
        <div className={`mb-4 flex ${railCollapsed ? "justify-center" : "justify-end"}`}><button type="button" className="touch-target flex size-9 items-center justify-center rounded-md text-blue-100 hover:bg-[#162b49] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300" title={railCollapsed ? "Развернуть меню" : "Свернуть меню"} aria-label={railCollapsed ? "Развернуть меню" : "Свернуть меню"} aria-expanded={compact ? mobileMenu : !collapsed} aria-controls={compact && mobileMenu ? "compact-navigation" : "desktop-sidebar"} onClick={() => compact ? setMobileMenu(true) : setCollapsed(value => !value)}>{railCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}</button></div>
        <Sidebar collapsed={railCollapsed} />
      </aside>
      {compact && mobileMenu ? (
        <Modal title="Навигация" onClose={() => setMobileMenu(false)} className="left-0 top-0 h-dvh max-h-dvh w-[min(320px,calc(100vw-2rem))] max-w-none translate-x-0 translate-y-0 rounded-none border-[#23334d] bg-[#09162e] text-white [&>button]:text-blue-100 [&>button:hover]:bg-[#162b49]">
          <aside id="compact-navigation" className="flex min-h-full flex-col p-5 text-white">
            <button type="button" className="touch-target mb-4 flex size-9 items-center justify-center rounded-md text-blue-100 hover:bg-[#162b49] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300" title="Свернуть меню" aria-label="Свернуть меню" aria-expanded="true" aria-controls="compact-navigation" onClick={() => setMobileMenu(false)}><PanelLeftClose className="size-4" /></button>
            <Sidebar onNavigate={() => setMobileMenu(false)} />
          </aside>
        </Modal>
      ) : null}
      <main className="min-w-0 flex-1">
        <Header />
        <section className={`mx-auto p-4 sm:p-6 2xl:p-8 ${location.pathname === "/files" ? "workspace-files w-full" : "max-w-[1760px]"}`}>
          <Outlet />
        </section>
      </main>
      <Toast message={toast} />
    </div>
  );
}
