import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthSession,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers";
import { getInstanceStatus } from "@/lib/services/evolution";
import type { ApiResponse } from "@/lib/types/api";

type StatusResponse = {
  status: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "FAILED";
  phoneNumber: string | null;
  connectedAt: string | null;
  qrcodeBase64: string | null;
};

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        evolutionInstanceName: true,
        whatsappStatus: true,
        whatsappPhoneNumber: true,
        whatsappConnectedAt: true,
        lastQrcodeBase64: true,
      },
    });
    if (!user) return unauthorizedResponse();

    if (!user.evolutionInstanceName) {
      return NextResponse.json<ApiResponse<StatusResponse>>({
        data: {
          status: "DISCONNECTED",
          phoneNumber: null,
          connectedAt: null,
          qrcodeBase64: null,
        },
      });
    }

    // Sync with Evolution: source of truth for "open" / "close".
    const live = await getInstanceStatus(user.evolutionInstanceName);

    let nextStatus = user.whatsappStatus;
    let nextPhone = user.whatsappPhoneNumber;
    let nextConnectedAt = user.whatsappConnectedAt;

    if (live.state === "open") {
      nextStatus = "CONNECTED";
      nextPhone = live.phoneNumber ?? user.whatsappPhoneNumber;
      if (!user.whatsappConnectedAt) nextConnectedAt = new Date();
    } else if (live.state === "connecting") {
      nextStatus = "CONNECTING";
    } else if (live.state === "close" || live.state === "unknown") {
      // Only downgrade if we previously thought we were connected.
      if (user.whatsappStatus === "CONNECTED") nextStatus = "DISCONNECTED";
    }

    if (
      nextStatus !== user.whatsappStatus ||
      nextPhone !== user.whatsappPhoneNumber ||
      nextConnectedAt !== user.whatsappConnectedAt
    ) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          whatsappStatus: nextStatus,
          whatsappPhoneNumber: nextPhone,
          whatsappConnectedAt: nextConnectedAt,
        },
      });
    }

    return NextResponse.json<ApiResponse<StatusResponse>>({
      data: {
        status: nextStatus,
        phoneNumber: nextPhone,
        connectedAt: nextConnectedAt ? nextConnectedAt.toISOString() : null,
        qrcodeBase64: nextStatus === "CONNECTED" ? null : user.lastQrcodeBase64,
      },
    });
  } catch (error) {
    console.error("GET /api/whatsapp/status error:", error);
    return serverErrorResponse();
  }
}
