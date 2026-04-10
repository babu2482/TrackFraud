import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { createHash } from "crypto";

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + (process.env.IP_SALT ?? "trackfraud")).digest("hex").slice(0, 16);
}

function checkRateLimit(ipHash: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ipHash);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ipHash, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count += 1;
  return true;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? request.headers.get("x-real-ip")
      ?? "unknown";
    const ipHash = hashIp(ip);

    if (!checkRateLimit(ipHash)) {
      return Response.json(
        { error: "Too many submissions. Please try again later." },
        { status: 429 }
      );
    }

    const body = await request.json();

    const {
      categoryId,
      entityName,
      entityId,
      title,
      description,
      evidence,
      submitterEmail,
      submitterName,
      honeypot,
    } = body as Record<string, string | undefined>;

    // Honeypot field: if filled, it's a bot
    if (honeypot) {
      return Response.json({ success: true, id: "ok" });
    }

    if (!categoryId || typeof categoryId !== "string") {
      return Response.json({ error: "Category is required." }, { status: 400 });
    }
    if (!entityName || typeof entityName !== "string" || entityName.trim().length < 2) {
      return Response.json({ error: "Entity name is required (at least 2 characters)." }, { status: 400 });
    }
    if (!title || typeof title !== "string" || title.trim().length < 5) {
      return Response.json({ error: "Title is required (at least 5 characters)." }, { status: 400 });
    }
    if (!description || typeof description !== "string" || description.trim().length < 20) {
      return Response.json({ error: "Description must be at least 20 characters." }, { status: 400 });
    }
    if (description.trim().length > 5000) {
      return Response.json({ error: "Description must be under 5000 characters." }, { status: 400 });
    }
    if (submitterEmail && !isValidEmail(submitterEmail)) {
      return Response.json({ error: "Invalid email address." }, { status: 400 });
    }

    const category = await prisma.fraudCategory.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      return Response.json({ error: "Invalid category." }, { status: 400 });
    }

    const tip = await prisma.tip.create({
      data: {
        categoryId,
        entityName: entityName.trim(),
        entityId: entityId?.trim() || null,
        title: title.trim(),
        description: description.trim(),
        evidence: evidence?.trim() || null,
        submitterEmail: submitterEmail?.trim() || null,
        submitterName: submitterName?.trim() || null,
        ipHash,
      },
    });

    return Response.json({ success: true, id: tip.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Submission failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
