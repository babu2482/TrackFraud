import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getAllCategories } from "@/lib/categories";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, categoryId } = body as {
      email?: string;
      categoryId?: string;
    };

    if (!email || !isValidEmail(email)) {
      return Response.json(
        { error: "Valid email is required." },
        { status: 400 },
      );
    }
    if (!categoryId) {
      return Response.json({ error: "Category is required." }, { status: 400 });
    }

    // Validate category slug against lib/categories.ts (single source of truth)
    const validSlugs = getAllCategories().map((c) => c.slug);
    if (!validSlugs.includes(categoryId)) {
      return Response.json({ error: "Invalid category." }, { status: 400 });
    }

    await prisma.subscriber.upsert({
      where: {
        email_categoryId: { email: email.toLowerCase().trim(), categoryId },
      },
      update: {},
      create: {
        email: email.toLowerCase().trim(),
        categoryId,
      },
    });

    return Response.json({ success: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Subscription failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
