"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useSidebarStore } from "@/stores/sidebar-store";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { isOpen, setOpen, collapsed, toggleCollapsed } = useSidebarStore();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const clinicName = (session.user as any)?.clinicName || "Clínica";

  return (
    <div className="flex min-h-screen bg-background text-foreground overflow-hidden">
      {/* Decorative Background Blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] right-[-10%] w-[700px] h-[700px] rounded-full bg-primary/[0.03] dark:bg-primary/[0.05] blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-teal-500/[0.03] dark:bg-teal-500/[0.05] blur-[100px]" />
      </div>

      {/* Desktop Sidebar */}
      <aside
        className={`hidden border-r border-border bg-sidebar/80 backdrop-blur-xl lg:block z-20 animate-slide-in-left transition-[width] duration-200 ${
          collapsed ? "w-20" : "w-72"
        }`}
      >
        <AppSidebar pathname={pathname} collapsed={collapsed} />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-72 p-0 border-r border-border bg-sidebar/95 backdrop-blur-xl"
        >
          <AppSidebar
            pathname={pathname}
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex flex-1 flex-col z-10 relative">
        <AppHeader
          clinicName={clinicName}
          onMenuClick={() => setOpen(true)}
          onToggleCollapsed={toggleCollapsed}
          collapsed={collapsed}
        />

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto animate-fade-in-up">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
