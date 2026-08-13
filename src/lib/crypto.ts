import crypto from "crypto";

const MIN_KEY_LENGTH = 32;
const KDF_SALT = "omniflow.aes-256-gcm.v1";

let cachedKey: Buffer | null = null;

function key() {
  if (cachedKey) return cachedKey;

  const secret = process.env.ENCRYPTION_KEY ?? "";
  if (!secret) {
    throw new Error("ENCRYPTION_KEY must be set to encrypt gateway credentials.");
  }
  if (secret.length < MIN_KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must be at least ${MIN_KEY_LENGTH} characters (got ${secret.length}).`
    );
  }

  cachedKey = crypto.scryptSync(secret, KDF_SALT, 32);
  return cachedKey;
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
  const digestA = crypto.createHash("sha256").update(a).digest();
  const digestB = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}
