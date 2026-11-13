import { LoginForm, QuickRoleCards } from "@/features/auth/LoginForm";
import { useState } from "react";
import { Button, Modal, Toast } from "@/shared/ui";
import { useToast } from "@/shared/ui/toast";

export function LoginPage() {
  const { toast } = useToast();
  const [demoOpen, setDemoOpen] = useState(false);
  return (
    <main className="login-surface flex min-h-dvh flex-col items-center justify-center px-4 py-20 sm:px-6">
      <div className="w-full max-w-[400px]">
        <header className="mb-6 text-center"><span className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl border border-indigo-100 bg-white p-2"><img src="/brand/sechenov-tree.svg" alt="Сеченовский университет — дерево и ДНК" width="48" height="48" className="size-12 object-contain" /></span><p className="text-xs font-semibold tracking-wide text-muted-foreground">Сеченовский университет</p><p className="mt-2 text-lg font-semibold tracking-tight">Клиническое исследование</p></header>
        <LoginForm />
        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">Система сопровождения клинического исследования</p>
      </div>
      {/* Independent demo launcher: removing it does not change the login layout. */}
      <div className="fixed bottom-3 right-3"><Button variant="secondary" className="text-xs" onClick={() => setDemoOpen(true)}>Тестовые учётные записи</Button></div>
      {demoOpen && <Modal title="Тестовые учётные записи" onClose={() => setDemoOpen(false)} className="max-w-3xl"><div className="p-6"><h2 className="mb-4 text-lg font-semibold">Тестовые учётные записи</h2><QuickRoleCards /></div></Modal>}
      <Toast message={toast} />
    </main>
  );
}
