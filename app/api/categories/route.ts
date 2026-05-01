/**
 * Categories API
 *
 * Returns categories from the single source of truth: lib/categories.ts.
 * No database lookup needed — categories are a classification scheme, not user data.
 */
import { getAllCategories } from "@/lib/categories";

export async function GET() {
  const categories = getAllCategories().map((c) => ({
    id: c.slug, // Use slug as ID (no DB model)
    name: c.name,
    slug: c.slug,
    status: c.status,
    iconName: c.iconName,
    color: c.color,
    description: c.description,
    navLabel: c.navLabel || c.name,
    searchType: c.searchType,
    sortOrder: c.sortOrder,
  }));

  return Response.json(categories);
}
