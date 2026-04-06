import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

const ALGO = "aes-256-gcm" as const;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const PREFIX = "v1.";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw?.trim()) {
    throw new Error("ENCRYPTION_KEY не задан (нужен ключ на 32 байта или произвольная строка для SHA-256)");
  }
  const s = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    return Buffer.from(s, "hex");
  }
  if (Buffer.byteLength(s, "utf8") === 32) {
    return Buffer.from(s, "utf8");
  }
  return createHash("sha256").update(s, "utf8").digest();
}

/**
 * AES-256-GCM. Возвращает строку вида v1.<base64url(iv||ciphertext||tag)>
 */
export function encrypt(plainText: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, enc, tag]);
  return `${PREFIX}${packed.toString("base64url")}`;
}

/**
 * Расшифровка строки из {@link encrypt}. Параметр назван `hash` по ТЗ — это не хеш, а зашифрованный пакет.
 */
export function decrypt(hash: string): string {
  const key = getKey();
  if (!hash.startsWith(PREFIX)) {
    throw new Error("Неверный формат зашифрованных данных");
  }
  const packed = Buffer.from(hash.slice(PREFIX.length), "base64url");
  if (packed.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Повреждённые зашифрованные данные");
  }
  const iv = packed.subarray(0, IV_LENGTH);
  const tag = packed.subarray(packed.length - TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH, packed.length - TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
