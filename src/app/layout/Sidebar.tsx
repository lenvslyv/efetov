import { NavLink } from "react-router-dom";
import { visibleNav } from "@/shared/config/nav";
import { APP_MARK, APP_NAME } from "@/shared/config/brand";
import { cn } from "@/shared/lib/cn";
import { useAuth } from "@/features/auth/useAuth";
import { Activity, ClipboardList, FolderOpen, History, UsersRound } from "lucide-react";

const icons = { "/journal": ClipboardList, "/files": FolderOpen, "/audit": History, "/admin": UsersRound };

export function Sidebar({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const { user, roleName } = useAuth();
  const items = visibleNav(user?.role);

  return (
    <>
      <div className="mb-5 flex size-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm"><Activity className="size-6" /></div>
      <div className={cn("text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-300", collapsed && "hidden")}>
        {APP_MARK}
      </div>
      <div className={cn("mt-2 text-lg font-semibold leading-6 tracking-tight", collapsed && "hidden")}>{APP_NAME}</div>
      <div className={cn("mt-6 rounded-lg border border-slate-800 bg-slate-900/70 p-3", collapsed && "hidden")}>
        <div className="text-xs text-slate-400">Текущая роль</div>
        <div className="mt-1 font-semibold">{roleName}</div>
        <div className="mt-1 text-xs text-slate-400">
          {user?.id} · {user?.login}
        </div>
      </div>
      <nav aria-label="Основная навигация" className="mt-6 space-y-1">
        {items.map((item) => {
          const Icon = icons[item.to as keyof typeof icons];
          return (
          <NavLink
            key={item.to}
            to={item.to}
            title={collapsed ? item.label : undefined}
            aria-label={collapsed ? item.label : undefined}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-slate-400 transition-colors hover:bg-slate-900 hover:text-white",
                collapsed && "justify-center px-2",
                isActive && "bg-blue-600 text-white shadow-sm hover:bg-blue-600 hover:text-white"
              )
            }
          >
            {Icon && <Icon aria-hidden="true" className="size-[18px] shrink-0" />}<span className={collapsed ? "sr-only" : undefined}>{item.label}</span>
          </NavLink>
        ); })}
      </nav>
      {!collapsed && <div className="mt-auto pt-8 text-[11px] leading-5 text-slate-500">Клиническое исследование<br />Единое рабочее пространство</div>}
    </>
  );
}
