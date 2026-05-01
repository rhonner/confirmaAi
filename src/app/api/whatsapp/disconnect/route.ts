import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthSession,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers";
import { deleteInstance } from "@/lib/services/evolution";
import type { ApiResponse } from "@/lib/types/api";

export async function POST() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { evolutionInstanceName: true },
    });
    if (!user) return unauthorizedResponse();

    if (user.evolutionInstanceName) {
      await deleteInstance(user.evolutionInstanceName);
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        evolutionInstanceName: null,
        whatsappStatus: "DISCONNECTED",
        whatsappPhoneNumber: null,
        whatsappConnectedAt: null,
      },
    });

    return NextResponse.json<ApiResponse<{ ok: true }>>({ data: { ok: true } });
  } catch (error) {
    console.error("POST /api/whatsapp/disconnect error:", error);
    return serverErrorResponse();
  }
}
