import Stripe from "stripe";
import { decrypt } from "./crypto";

const API_VERSION = "2024-06-20";

/** Platform-level Stripe account (used for OmniFlow subscription billing). */
export function platformStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: API_VERSION });
}

/** Creator-owned Stripe account (used to charge their store customers). */
export function creatorStripe(encryptedKey: string | null | undefined) {
  if (!encryptedKey) return null;
  try {
    return new Stripe(decrypt(encryptedKey), { apiVersion: API_VERSION });
  } catch {
    return null;
  }
}
