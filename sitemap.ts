import { getDb } from "./api/server/db.js";
import { events } from "./api/server/drizzle/schema.js";

export async function generateSitemap(baseUrl: string): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not initialized");
  const allEvents = await db.select().from(events);

  const urls = [
    {
      loc: `${baseUrl}/`,
      lastmod: new Date().toISOString().split("T")[0],
      changefreq: "daily",
      priority: "1.0",
    },
  ];

  // Add event pages
  for (const event of allEvents) {
    urls.push({
      loc: `${baseUrl}/event/${event.id}`,
      lastmod: event.updatedAt
        ? new Date(event.updatedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      changefreq: "weekly",
      priority: "0.8",
    });
  }

  // Generate XML
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const url of urls) {
    xml += "  <url>\n";
    xml += `    <loc>${escapeXml(url.loc)}</loc>\n`;
    xml += `    <lastmod>${url.lastmod}</lastmod>\n`;
    xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
    xml += `    <priority>${url.priority}</priority>\n`;
    xml += "  </url>\n";
  }

  xml += "</urlset>";

  return xml;
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
