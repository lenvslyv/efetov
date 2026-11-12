import { LoginForm, QuickRoleCards } from "@/features/auth/LoginForm";
import { Toast } from "@/shared/ui";
import { useToast } from "@/shared/ui/toast";
import { Activity } from "lucide-react";

export function LoginPage() {
  const { toast } = useToast();
  return (
    <main className="flex min-h-screen flex-col bg-[radial-gradient(ellipse_at_top,_#eff6ff,_#f8fafc_65%)] p-4 sm:p-8">
      <div className="mx-auto mb-8 mt-4 flex w-full max-w-5xl items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary text-white"><Activity className="size-6" /></span><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Сеченовский университет</p><p className="mt-1 text-sm text-muted-foreground">Клинические исследования</p></div></div>
      <div className="mx-auto mb-auto grid w-full max-w-5xl items-start gap-6 lg:grid-cols-[1fr_1.1fr]">
        <LoginForm />
        <QuickRoleCards />
      </div>
      <Toast message={toast} />
    </main>
  );
}
