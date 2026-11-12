import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { IdleTimeout } from "./IdleTimeout";
import { Sidebar } from "./Sidebar";
import { Modal, Toast } from "@/shared/ui";
import { useToast } from "@/shared/ui/toast";

export function AppShell() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const { toast } = useToast();

  return (
    <div className="flex min-h-screen bg-slate-50/80">
      <IdleTimeout />
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-800 bg-slate-950 p-5 text-white xl:flex">
        <Sidebar />
      </aside>
      {mobileMenu ? (
        <Modal title="Навигация" onClose={() => setMobileMenu(false)}>
          <aside className="rounded-xl bg-slate-950 p-6 text-white">
            <Sidebar onNavigate={() => setMobileMenu(false)} />
          </aside>
        </Modal>
      ) : null}
      <main className="min-w-0 flex-1">
        <Header onOpenMenu={() => setMobileMenu(true)} />
        <section className="mx-auto max-w-[1760px] p-4 sm:p-6 2xl:p-8">
          <Outlet />
        </section>
      </main>
      <Toast message={toast} />
    </div>
  );
}
