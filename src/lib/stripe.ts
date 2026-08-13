import Stripe from "stripe";
import { platformStripeSecretKey } from "./platform-settings";

const API_VERSION = "2024-06-20";

/**
 * The platform Stripe account, configured by the super admin through the admin
 * UI rather than the environment. Returns null when Stripe is switched off or
 * unconfigured, which is the default state of a fresh install.
 */
export async function platformStripe() {
  const key = await platformStripeSecretKey();
  if (!key) return null;
  return new Stripe(key, { apiVersion: API_VERSION });
}

export function stripeClient(secretKey: string) {
  return new Stripe(secretKey, { apiVersion: API_VERSION });
}

/**
 * Signature verification is local HMAC and needs no valid API key, so the
 * webhook must stay verifiable even before the admin has configured Stripe.
 */
export function stripeForWebhooks() {
  return new Stripe("sk_unused_for_signature_verification_only", {
    apiVersion: API_VERSION,
  });
}
