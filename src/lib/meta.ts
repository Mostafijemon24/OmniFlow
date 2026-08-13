import crypto from "crypto";
import { prisma } from "./prisma";
import { decrypt } from "./crypto";
import { appUrl, storeUrl } from "./utils";
import { monthStart, planOf } from "./plans";

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";
export const GRAPH_API = `https://graph.facebook.com/${GRAPH_VERSION}`;

export const META_SCOPES = [
  "pages_show_list",
  "pages_manage_metadata",
  "pages_messaging",
  "pages_read_engagement",
  "pages_read_user_content",
  "instagram_basic",
  "instagram_manage_comments",
  "instagram_manage_messages",
].join(",");

export function isMetaConfigured() {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function metaRedirectUri() {
  return `${appUrl()}/api/meta/oauth/callback`;
}

export function metaAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    redirect_uri: metaRedirectUri(),
    state,
    scope: META_SCOPES,
    response_type: "code",
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`;
}

export async function exchangeCodeForToken(code: string) {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    redirect_uri: metaRedirectUri(),
    code,
  });
  const res = await fetch(`${GRAPH_API}/oauth/access_token?${params}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error?.message || "Meta token exchange failed.");
  }
  return data.access_token as string;
}

export async function longLivedToken(shortToken: string) {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(`${GRAPH_API}/oauth/access_token?${params}`, { cache: "no-store" });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error?.message || "Meta long-lived token exchange failed.");
  }
  return {
    token: data.access_token as string,
    expiresIn: (data.expires_in as number | undefined) ?? null,
  };
}

export type MetaPage = {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
};

export async function fetchPages(userToken: string): Promise<MetaPage[]> {
  const res = await fetch(
    `${GRAPH_API}/me/accounts?fields=id,name,access_token,instagram_business_account{id}&access_token=${userToken}`,
    { cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Could not load Meta pages.");
  return (data.data || []) as MetaPage[];
}

export async function subscribePage(pageId: string, pageToken: string) {
  const res = await fetch(`${GRAPH_API}/${pageId}/subscribed_apps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscribed_fields: ["feed", "messages", "message_reactions", "mention"],
      access_token: pageToken,
    }),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error?.message || "Page subscription failed.");
  }
  return true;
}

export async function unsubscribePage(pageId: string, pageToken: string) {
  const res = await fetch(
    `${GRAPH_API}/${pageId}/subscribed_apps?access_token=${encodeURIComponent(pageToken)}`,
    { method: "DELETE", cache: "no-store" }
  );
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error?.message || "Page unsubscribe failed.");
  }
  return true;
}

export function verifyMetaSignature(rawBody: string, signature: string | null) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return false;
  if (!signature) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export type IncomingComment = {
  platform: "facebook" | "instagram";
  accountRef: string; // page id or instagram user id
  commentId: string;
  text: string;
  fromId?: string;
  createdTime?: number;
};

export function extractComments(body: Record<string, unknown>): IncomingComment[] {
  const out: IncomingComment[] = [];
  const entries = (body.entry as Array<Record<string, unknown>>) || [];
  const object = String(body.object || "");

  for (const entry of entries) {
    const accountRef = String(entry.id || "");
    const changes = (entry.changes as Array<Record<string, unknown>>) || [];

    for (const change of changes) {
      const value = (change.value || {}) as Record<string, unknown>;
      const field = String(change.field || "");
      const item = String(value.item || "");

      const isComment = field === "comments" || item === "comment";
      if (!isComment) continue;
      if (value.verb && value.verb !== "add") continue;

      const text = String(value.message || value.text || "");
      const commentId = String(value.comment_id || value.id || "");
      if (!text || !commentId) continue;

      const from = value.from as { id?: string } | undefined;

      out.push({
        platform: object === "instagram" ? "instagram" : "facebook",
        accountRef,
        commentId,
        text,
        fromId: from?.id,
        createdTime: value.created_time ? Number(value.created_time) : undefined,
      });
    }
  }

  return out;
}

/** Meta only allows a private reply within 24 hours of the comment. */
export function withinMessagingWindow(createdTimeSeconds?: number) {
  if (!createdTimeSeconds) return true;
  return Date.now() - createdTimeSeconds * 1000 < 24 * 3600 * 1000;
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * Case-insensitive whole-token match. Keywords are stored uppercased but a
 * comment is matched on token boundaries so `KIT` does not fire on `KITCHEN`,
 * while hashtag keywords such as `#KIT` still match mid-sentence. Keyword text
 * is compared literally, never compiled into a regular expression.
 */
export function matchesKeyword(comment: string, keyword: string) {
  const needle = keyword.trim().toLocaleUpperCase();
  if (!needle) return false;

  const haystack = comment.toLocaleUpperCase();
  let from = 0;

  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;

    const before = at > 0 ? haystack[at - 1] : "";
    const after = haystack[at + needle.length] ?? "";
    const startsWithWord = WORD_CHAR.test(needle[0]);
    const endsWithWord = WORD_CHAR.test(needle[needle.length - 1]);

    const leftOk = !startsWithWord || !before || !WORD_CHAR.test(before);
    const rightOk = !endsWithWord || !after || !WORD_CHAR.test(after);
    if (leftOk && rightOk) return true;

    from = at + 1;
  }
}

/** Longest keyword wins so a specific rule beats a generic one. */
export function resolveRule<T extends { keyword: string }>(comment: string, rules: T[]) {
  return (
    [...rules]
      .sort((a, b) => b.keyword.length - a.keyword.length)
      .find((rule) => matchesKeyword(comment, rule.keyword)) ?? null
  );
}

async function sendPrivateReply(commentId: string, pageToken: string, message: string) {
  const res = await fetch(`${GRAPH_API}/${commentId}/private_replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, access_token: pageToken }),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || "Meta private reply failed.");
  }
  return data;
}

export async function processComment(comment: IncomingComment) {
  const account = await prisma.metaAccount.findFirst({
    where:
      comment.platform === "instagram"
        ? { OR: [{ igUserId: comment.accountRef }, { pageId: comment.accountRef }] }
        : { pageId: comment.accountRef },
    include: { user: true },
  });
  if (!account) return { status: "no_account" as const };

  // Never reply to the page's own comments, which would loop.
  if (
    comment.fromId &&
    (comment.fromId === account.pageId || comment.fromId === account.igUserId)
  ) {
    return { status: "self_comment" as const };
  }

  const started = Date.now();

  await prisma.funnelEvent.create({
    data: {
      userId: account.userId,
      type: "comment_detected",
      metadata: comment.commentId,
    },
  });

  const rules = await prisma.autoDMRule.findMany({
    where: {
      userId: account.userId,
      active: true,
      platform: comment.platform,
      // A rule pinned to one page must not fire for another page.
      OR: [{ metaAccountId: null }, { metaAccountId: account.id }],
    },
    include: { targetProduct: true },
    orderBy: { createdAt: "desc" },
  });

  const matched = resolveRule(comment.text, rules);
  if (!matched) return { status: "no_match" as const };
  if (!matched.targetProduct.active) return { status: "product_inactive" as const };

  const plan = planOf(account.user.plan);
  const sentThisMonth = await prisma.dmLog.count({
    where: {
      userId: account.userId,
      status: "sent",
      createdAt: { gte: monthStart() },
    },
  });

  if (sentThisMonth >= plan.maxDmsPerMonth) {
    await prisma.dmLog.create({
      data: {
        userId: account.userId,
        ruleId: matched.id,
        metaAccountId: account.id,
        platform: comment.platform,
        commentId: comment.commentId,
        keyword: matched.keyword,
        status: "quota_exceeded",
        error: `${plan.name} plan allows ${plan.maxDmsPerMonth} DMs per month.`,
      },
    });
    return { status: "quota_exceeded" as const };
  }

  if (!withinMessagingWindow(comment.createdTime)) {
    await prisma.dmLog.create({
      data: {
        userId: account.userId,
        ruleId: matched.id,
        metaAccountId: account.id,
        platform: comment.platform,
        commentId: comment.commentId,
        keyword: matched.keyword,
        status: "window_expired",
        error: "Comment is older than the Meta 24-hour messaging window.",
      },
    });
    return { status: "window_expired" as const };
  }

  const link = storeUrl(account.user.username, matched.targetProductId);
  const message = `${matched.autoMessage}\n${link}`;

  try {
    await sendPrivateReply(comment.commentId, decrypt(account.accessToken), message);

    await prisma.$transaction([
      prisma.autoDMRule.update({
        where: { id: matched.id },
        data: { triggerCount: { increment: 1 } },
      }),
      prisma.dmLog.create({
        data: {
          userId: account.userId,
          ruleId: matched.id,
          metaAccountId: account.id,
          platform: comment.platform,
          commentId: comment.commentId,
          keyword: matched.keyword,
          status: "sent",
          latencyMs: Date.now() - started,
        },
      }),
    ]);

    return { status: "sent" as const, keyword: matched.keyword, link };
  } catch (error) {
    await prisma.dmLog.create({
      data: {
        userId: account.userId,
        ruleId: matched.id,
        metaAccountId: account.id,
        platform: comment.platform,
        commentId: comment.commentId,
        keyword: matched.keyword,
        status: "failed",
        error: error instanceof Error ? error.message.slice(0, 300) : "Unknown error",
        latencyMs: Date.now() - started,
      },
    });
    return { status: "failed" as const };
  }
}
