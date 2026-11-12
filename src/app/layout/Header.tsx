import { useAuth } from "@/features/auth/useAuth";
import { Button } from "@/shared/ui";
import { LogOut, Menu, UserRound } from "lucide-react";

export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { user, roleName, logout } = useAuth();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-white/95 px-4 py-3 backdrop-blur sm:px-6 2xl:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-primary"><UserRound className="size-4" /></div>
          <div className="min-w-0"><div className="truncate text-sm font-semibold">{user?.name || user?.login}</div>
          <div className="truncate text-xs text-muted-foreground">{roleName} · {user?.id}</div></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="xl:hidden" onClick={onOpenMenu}>
            <Menu />Меню
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              logout("manual");
            }}
          >
            <LogOut />Выйти
          </Button>
        </div>
      </div>
    </header>
  );
}
