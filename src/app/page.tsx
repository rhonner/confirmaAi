import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-helpers";

export default async function RootPage() {
  // getAuthSession rejeita JWT de conta inexistente OU soft-deleted (Sprint 11).
  const session = await getAuthSession();

  if (session) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
