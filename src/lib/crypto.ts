import crypto from "crypto";

function key() {
  const secret =
    process.env.ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || "";
  if (!secret) {
    throw new Error("ENCRYPTION_KEY or NEXTAUTH_SECRET must be set.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decrypt(payload: string) {
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) throw new Error("Malformed ciphertext.");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
