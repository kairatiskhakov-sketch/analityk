import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const path = req.nextUrl.pathname;
  const status = req.auth?.user?.status;
  const isPlatformAdmin = req.auth?.user?.isPlatformAdmin;

  // Анонимный пользователь
  if (!isLoggedIn) {
    if (
      path.startsWith("/dashboard") ||
      path.startsWith("/admin") ||
      path.startsWith("/account")
    ) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    return NextResponse.next();
  }

  // BLOCKED → только /account/blocked
  if (status === "BLOCKED") {
    if (!path.startsWith("/account/blocked")) {
      return NextResponse.redirect(new URL("/account/blocked", req.url));
    }
    return NextResponse.next();
  }

  // PENDING → только /account/pending
  if (status === "PENDING") {
    if (!path.startsWith("/account/pending")) {
      return NextResponse.redirect(new URL("/account/pending", req.url));
    }
    return NextResponse.next();
  }

  // ACTIVE
  // /admin/* — только для super-admin
  if (path.startsWith("/admin") && !isPlatformAdmin) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // На /login или /account/* активного юзера — на дашборд
  if (path.startsWith("/login")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  if (path === "/account/pending" || path === "/account/blocked") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/admin",
    "/admin/:path*",
    "/account/:path*",
    "/login",
  ],
};
