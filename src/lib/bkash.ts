import { decrypt } from "./crypto";

export type BkashCredentials = {
  appKey: string;
  appSecret: string;
  username: string;
  password: string;
  sandbox: boolean;
};

export function creatorBkash(user: {
  bkashAppKey: string | null;
  bkashAppSecret: string | null;
  bkashUsername: string | null;
  bkashPassword: string | null;
  bkashSandbox: boolean;
}): BkashCredentials | null {
  if (!user.bkashAppKey || !user.bkashAppSecret || !user.bkashUsername || !user.bkashPassword) {
    return null;
  }
  try {
    return {
      appKey: decrypt(user.bkashAppKey),
      appSecret: decrypt(user.bkashAppSecret),
      username: decrypt(user.bkashUsername),
      password: decrypt(user.bkashPassword),
      sandbox: user.bkashSandbox,
    };
  } catch {
    return null;
  }
}

function baseUrl(sandbox: boolean) {
  return sandbox
    ? "https://tokenized.sandbox.bka.sh/v1.2.0-beta"
    : "https://tokenized.pay.bka.sh/v1.2.0-beta";
}

async function grantToken(creds: BkashCredentials) {
  const res = await fetch(`${baseUrl(creds.sandbox)}/tokenized/checkout/token/grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      username: creds.username,
      password: creds.password,
    },
    body: JSON.stringify({ app_key: creds.appKey, app_secret: creds.appSecret }),
    cache: "no-store",
  });

  const data = await res.json();
  if (!res.ok || !data.id_token) {
    throw new Error(data.statusMessage || "bKash token grant failed.");
  }
  return data.id_token as string;
}

export async function createBkashPayment(
  creds: BkashCredentials,
  args: {
    amount: string;
    invoice: string;
    callbackUrl: string;
    payerReference: string;
  }
) {
  const token = await grantToken(creds);
  const res = await fetch(`${baseUrl(creds.sandbox)}/tokenized/checkout/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: token,
      "X-APP-Key": creds.appKey,
    },
    body: JSON.stringify({
      mode: "0011",
      payerReference: args.payerReference,
      callbackURL: args.callbackUrl,
      amount: args.amount,
      currency: "BDT",
      intent: "sale",
      merchantInvoiceNumber: args.invoice,
    }),
    cache: "no-store",
  });

  const data = await res.json();
  if (!res.ok || !data.bkashURL) {
    throw new Error(data.statusMessage || "bKash payment creation failed.");
  }
  return { paymentId: data.paymentID as string, redirectUrl: data.bkashURL as string };
}

export async function executeBkashPayment(creds: BkashCredentials, paymentId: string) {
  const token = await grantToken(creds);
  const res = await fetch(`${baseUrl(creds.sandbox)}/tokenized/checkout/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: token,
      "X-APP-Key": creds.appKey,
    },
    body: JSON.stringify({ paymentID: paymentId }),
    cache: "no-store",
  });

  const data = await res.json();
  const completed = data.transactionStatus === "Completed" || data.statusCode === "0000";
  return { completed, trxId: data.trxID as string | undefined, raw: data };
}
