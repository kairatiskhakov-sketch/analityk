import { encrypt } from "@/lib/crypto";
import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { connectionId?: string };
    if (!body.connectionId?.trim()) {
      return jsonError("Нужен connectionId");
    }

    const enc = encrypt("");
    const updated = await prisma.googleConnection.update({
      where: { id: body.connectionId },
      data: {
        accessToken: enc,
        refreshToken: enc,
        tokenExpiresAt: new Date(0),
        adsEnabled: false,
        sheetsEnabled: false,
        analyticsEnabled: false,
        adsCustomerId: null,
        adsDeveloperToken: null,
        sheetsSpreadsheetId: null,
        analyticsPropertyId: null,
        email: "disconnected@local",
      },
    });

    return jsonOk({ connection: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
