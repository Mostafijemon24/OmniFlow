"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useUi } from "@/components/providers/ui-provider";

/**
 * The NextAuth signIn callback can only redirect, so a refused Facebook sign-in
 * arrives as a code in the URL. This turns it into a sentence the visitor can
 * act on rather than a bare "AccessDenied".
 */
const MESSAGES: Record<string, string> = {
  email_exists:
    "That email already has an OmniFlow account with a password. Sign in with your password, then link Facebook from your Connections page.",
  no_email:
    "Facebook did not share an email address with us, so we cannot create an account. Register with an email and password instead.",
  signup_failed: "We could not create your account from Facebook. Please try registering directly.",
};

export function SocialErrorNotice() {
  const params = useSearchParams();
  const { triggerToast, setAuthMode } = useUi();

  useEffect(() => {
    const code = params.get("social_error");
    if (!code) return;
    triggerToast(MESSAGES[code] ?? "Facebook sign-in was not completed.");
    if (code === "email_exists") setAuthMode("login");
  }, [params, triggerToast, setAuthMode]);

  return null;
}
