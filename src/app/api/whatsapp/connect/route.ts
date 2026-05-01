import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAuthSession,
  unauthorizedResponse,
  serverErrorResponse,
} from "@/lib/auth-helpers";
import {
  createInstance,
  connectInstance,
  getInstanceStatus,
} from "@/lib/services/evolution";
import type { ApiResponse } from "@/lib/types/api";

type ConnectResponse = {
  instanceName: string;
  qrcodeBase64: string | null;
  status: "CONNECTING" | "CONNECTED";
};

export async function POST() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return unauthorizedResponse();

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, evolutionInstanceName: true, whatsappStatus: true },
    });
    if (!user) return unauthorizedResponse();

    const instanceName = user.evolutionInstanceName ?? `clinic-${user.id}`;
    const appUrl =
      process.env.EVOLUTION_WEBHOOK_BASE_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "";
    const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/webhook/evolution/${encodeURIComponent(instanceName)}`;

    let qrcodeBase64: string | null = null;

    if (!user.evolutionInstanceName) {
      // First connect: create instance + persist name.
      const created = await createInstance(instanceName, webhookUrl);
      qrcodeBase64 = created.qrcodeBase64;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          evolutionInstanceName: instanceName,
          whatsappStatus: "CONNECTING",
        },
      });
    } else {
      // Reconnect: fetch fresh QR. If already open, no QR is needed.
      const current = await getInstanceStatus(instanceName);
      if (current.state === "open") {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            whatsappStatus: "CONNECTED",
            whatsappPhoneNumber: current.phoneNumber,
            whatsappConnectedAt: new Date(),
          },
        });
        return NextResponse.json<ApiResponse<ConnectResponse>>({
          data: { instanceName, qrcodeBase64: null, status: "CONNECTED" },
        });
      }
      const reconnected = await connectInstance(instanceName);
      qrcodeBase64 = reconnected.qrcodeBase64;
      await prisma.user.update({
        where: { id: user.id },
        data: { whatsappStatus: "CONNECTING" },
      });
    }

    return NextResponse.json<ApiResponse<ConnectResponse>>({
      data: { instanceName, qrcodeBase64, status: "CONNECTING" },
    });
  } catch (error) {
    console.error("POST /api/whatsapp/connect error:", error);
    return serverErrorResponse();
  }
}
