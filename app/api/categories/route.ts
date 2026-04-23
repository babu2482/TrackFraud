import { prisma } from "@/lib/db";

export async function GET() {
  const categories = await prisma.fraudCategory.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
    },
  });

  return Response.json(categories);
}
