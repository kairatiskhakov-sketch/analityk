import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/http/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Публичный эндпоинт трекинга. Принимает POST от JS-сниппета с лендинга.
 *
 * CORS: открыт (*), т.к. сниппет работает с чужого домена. Аутентификация —
 * через публичный trackingKey организации.
 *
 * Rate-limit: in-memory bucket 60 req/min/IP (см. src/lib/http/rate-limit.ts).
 */

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

type TrackPayload = {
  trackingKey?: string;
  visitorId?: string;
  landingUrl?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  fbclid?: string;
  ttclid?: string;
  gclid?: string;
  userAgent?: string;
};

function truncate(s: string | undefined | null, max: number): string | null {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim().slice(0, 64) || null;
  const real = req.headers.get("x-real-ip");
  if (real) return real.slice(0, 64);
  return null;
}

export async function POST(req: Request) {
  try {
    const ip = clientIp(req) ?? "unknown";
    const rl = await rateLimit(`track:${ip}`, { limit: 60, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many requests" },
        {
          status: 429,
          headers: {
            ...corsHeaders(),
            "Retry-After": String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))),
            "X-RateLimit-Limit": String(rl.limit),
            "X-RateLimit-Remaining": String(rl.remaining),
          },
        },
      );
    }

    const body = (await req.json().catch(() => null)) as TrackPayload | null;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Bad JSON" },
        { status: 400, headers: corsHeaders() },
      );
    }
    const trackingKey = body.trackingKey?.trim();
    const visitorId = body.visitorId?.trim();
    if (!trackingKey || !visitorId) {
      return NextResponse.json(
        { ok: false, error: "trackingKey и visitorId обязательны" },
        { status: 400, headers: corsHeaders() },
      );
    }

    const org = await prisma.organization.findUnique({
      where: { trackingKey },
      select: { id: true },
    });
    if (!org) {
      // Не раскрываем существование: всегда 200 для снипета, но без записи.
      return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders() });
    }

    await prisma.trackingTouch.create({
      data: {
        orgId: org.id,
        visitorId: truncate(visitorId, 128)!,
        landingUrl: truncate(body.landingUrl, 2048),
        referrer: truncate(body.referrer, 2048),
        utmSource: truncate(body.utmSource, 128),
        utmMedium: truncate(body.utmMedium, 128),
        utmCampaign: truncate(body.utmCampaign, 256),
        utmTerm: truncate(body.utmTerm, 256),
        utmContent: truncate(body.utmContent, 256),
        fbclid: truncate(body.fbclid, 512),
        ttclid: truncate(body.ttclid, 512),
        gclid: truncate(body.gclid, 512),
        userAgent: truncate(body.userAgent, 1024),
        ip: clientIp(req),
      },
    });

    return NextResponse.json({ ok: true }, { status: 200, headers: corsHeaders() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500, headers: corsHeaders() },
    );
  }
}
