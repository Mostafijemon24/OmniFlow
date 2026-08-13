import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractComments, processComment, verifyMetaSignature } from "@/lib/meta";
import { safeEqual } from "@/lib/crypto";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  const verifyToken = process.env.META_VERIFY_TOKEN;

  if (!verifyToken) {
    return NextResponse.json({ error: "META_VERIFY_TOKEN is not configured." }, { status: 500 });
  }
  if (mode === "subscribe" && token && challenge && safeEqual(token, verifyToken)) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({ error: "Verification failed." }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Invalid Meta signature." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const comments = extractComments(body);
  const results: string[] = [];

  for (const comment of comments) {
    // Meta retries deliveries; one comment must never trigger two DMs.
    try {
      await prisma.webhookEvent.create({
        data: { provider: "meta", eventId: comment.commentId },
      });
    } catch {
      results.push("duplicate");
      continue;
    }

    try {
      const outcome = await processComment(comment);
      results.push(outcome.status);
    } catch (error) {
      // Release the dedupe claim so Meta's retry can be processed properly.
      await prisma.webhookEvent
        .delete({ where: { provider_eventId: { provider: "meta", eventId: comment.commentId } } })
        .catch(() => undefined);
      console.error("meta webhook", error);
      results.push("error");
    }
  }

  return NextResponse.json({ received: true, processed: results.length, results });
}
