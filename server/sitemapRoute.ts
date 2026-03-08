import { Express } from "express";
import { generateSitemap } from "../sitemap.ts";

export function setupSitemapRoute(app: Express) {
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const protocol = req.protocol || "https";
      const host = req.get("host") || "localhost:3000";
      const baseUrl = `${protocol}://${host}`;

      const sitemap = await generateSitemap(baseUrl);

      res.header("Content-Type", "application/xml");
      res.header("Cache-Control", "public, max-age=3600");
      res.send(sitemap);
    } catch (error) {
      console.error("Error generating sitemap:", error);
      res.status(500).send("Error generating sitemap");
    }
  });

  app.get("/robots.txt", (req, res) => {
    const protocol = req.protocol || "https";
    const host = req.get("host") || "localhost:3000";
    const baseUrl = `${protocol}://${host}`;

    const robots = `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;

    res.header("Content-Type", "text/plain");
    res.header("Cache-Control", "public, max-age=86400");
    res.send(robots);
  });
}
