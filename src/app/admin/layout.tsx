import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-helpers";
import { isAdminEmail } from "@/lib/admin";

// Gate de admin no servidor (Sprint 10): quem não está na allowlist
// (ADMIN_EMAILS) é redirecionado antes de qualquer render. As rotas de API
// sob /api/admin reforçam o mesmo gate (defense in depth).
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthSession();
  if (!session?.user?.id || !isAdminEmail(session.user.email)) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
