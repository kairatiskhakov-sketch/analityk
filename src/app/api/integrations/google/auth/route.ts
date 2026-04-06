import { jsonError } from "@/lib/http/json";
import { buildGoogleAuthUrl } from "@/lib/integrations/google/oauth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get("connectionId");
    if (!connectionId) {
      return jsonError("Нужен query connectionId (создайте через POST .../register)");
    }

    const url = buildGoogleAuthUrl(connectionId);
    return NextResponse.redirect(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return jsonError(msg, 500);
  }
}
