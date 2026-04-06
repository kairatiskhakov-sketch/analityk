import { encrypt } from "@/lib/crypto";
import { jsonError, jsonOk } from "@/lib/http/json";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      connectionId?: string;
      botToken: string;
      notifyNewLead?: boolean;
      notifyDealWon?: boolean;
      notifyDealLost?: boolean;
      notifyDailyReport?: boolean;
      notifyPlanAlert?: boolean;
      dailyReportTime?: string;
    };

    if (!body.botToken?.trim()) {
      return jsonError("Нужен botToken");
    }

    const enc = encrypt(body.botToken.trim());

    if (body.connectionId) {
      const updated = await prisma.telegramConnection.update({
        where: { id: body.connectionId },
        data: {
          botToken: enc,
          isActive: true,
          notifyNewLead: body.notifyNewLead ?? undefined,
          notifyDealWon: body.notifyDealWon ?? undefined,
          notifyDealLost: body.notifyDealLost ?? undefined,
          notifyDailyReport: body.notifyDailyReport ?? undefined,
          notifyPlanAlert: body.notifyPlanAlert ?? undefined,
          dailyReportTime: body.dailyReportTime ?? undefined,
        },
      });
      return jsonOk({ connection: updated });
    }

    const created = await prisma.telegramConnection.create({
      data: {
        botToken: enc,
        isActive: true,
        notifyNewLead: body.notifyNewLead ?? true,
        notifyDealWon: body.notifyDealWon ?? true,
        notifyDealLost: body.notifyDealLost ?? false,
        notifyDailyReport: body.notifyDailyReport ?? true,
        notifyPlanAlert: body.notifyPlanAlert ?? true,
        dailyReportTime: body.dailyReportTime ?? "18:00",
      },
    });
    return jsonOk({ connection: created });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
