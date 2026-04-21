import { randomBytes } from "crypto";

/** Публичный tracking-ключ организации: 32 hex-символа (128 бит). */
export function generateTrackingKey(): string {
  return randomBytes(16).toString("hex");
}
