/**
 * Admin Verify API
 *
 * Verifies the admin secret and returns success/failure.
 * The actual session cookie is set on the client side after success.
 */
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { secret } = body;

    if (!secret || typeof secret !== "string") {
      return NextResponse.json(
        { message: "Secret is required" },
        { status: 400 },
      );
    }

    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret) {
      // In development without ADMIN_SECRET set, deny access
      return NextResponse.json(
        { message: "Admin not configured. Set ADMIN_SECRET environment variable." },
        { status: 501 },
      );
    }

    // Use timing-safe comparison to prevent timing attacks
    if (secret.length !== adminSecret.length) {
      return NextResponse.json(
        { message: "Invalid admin secret" },
        { status: 401 },
      );
    }

    let match = true;
    for (let i = 0; i < secret.length; i++) {
      if (secret[i] !== adminSecret[i]) {
        match = false;
        break;
      }
    }

    if (!match) {
      return NextResponse.json(
        { message: "Invalid admin secret" },
        { status: 401 },
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { message: "Invalid request" },
      { status: 400 },
    );
  }
}
