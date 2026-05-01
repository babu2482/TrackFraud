import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, url, reason, details } = body;

    // Basic validation
    if (!name || !email || !url || !reason || !details) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Log the takedown request (in production, send to email/queue/DB)
    logger.info("Takedown request received", {
      name,
      email,
      url,
      reason,
      // Don't log full details in case of sensitive info
      detailsLength: details.length,
      timestamp: new Date().toISOString(),
    });

    // In production:
    // - Send email notification to admin
    // - Queue a job for review
    // - Store in database for tracking

    return Response.json(
      { success: true, message: "Takedown request submitted for review" },
      { status: 200 }
    );
  } catch (error) {
    logger.error("Failed to process takedown request", { error });
    return Response.json(
      { error: "Failed to submit takedown request" },
      { status: 500 }
    );
  }
}
