import { Express } from "express";
import fs from "fs";
import path from "path";
import { getDb } from "./db.js";
import { events, championships } from "./schema.js";
import { eq } from "drizzle-orm";

export function setupMetaRoutes(app: Express) {
  const handler = async (req: any, res: any) => {
    try {
      const userAgent = req.headers["user-agent"] || "";
      const isBot = /WhatsApp|Facebot|facebookexternalhit|Twitterbot|Slackbot|LinkedInBot|TelegramBot|Discordbot/i.test(userAgent);
      
      const { id } = req.params;
      const isEvent = req.path.startsWith("/events");
      const isChamp = req.path.startsWith("/championship");

      // Safety check: If a real user somehow hits this API route, redirect to the real page
      // but ideally Vercel's has: header check prevents this from happening.
      if (!isBot && (isEvent || isChamp)) {
         return res.sendFile(path.join(process.cwd(), "index.html"));
      }
      
      let title = "Amigo Racing - Plataforma de Eventos Off-Road e Rally";
      let description = "Plataforma completa para organizar e participar de eventos de Rally e Off-Road no Brasil. Gerencie inscrições, categorias, ordem de largada e documentos em um único lugar.";
      let image = "https://www.amigoracing.com.br/logo.png"; // Default logo URL
      let imageType = "image/png";
      const SITE_URL = "https://www.amigoracing.com.br";

      try {
        const db = await getDb();
        if (db) {
            if (isEvent && id) {
              const [event] = await db.select().from(events).where(eq(events.id, Number(id)));
              if (event) {
                title = `${event.name} - Amigo Racing`;
                const dateStr = event.startDate ? new Date(event.startDate).toLocaleDateString('pt-BR') : "";
                description = event.description || `Evento de Rally em ${event.city}, ${event.state}${dateStr ? ` em ${dateStr}` : ""}`;
                if (event.imageUrl) image = event.imageUrl;
              }
            } else if (isChamp && id) {
              const [champ] = await db.select().from(championships).where(eq(championships.id, Number(id)));
              if (champ) {
                title = `${champ.name} - Amigo Racing`;
                description = `Campeonato de Rally e Off-Road ${champ.year}. Acompanhe as etapas e resultados oficiais.`;
                if (champ.imageUrl) image = champ.imageUrl;
              }
            }
        }

        // Ensure absolute URL and handle base64
        if (image && image.startsWith("data:")) {
          // Social scrapers don't support base64, fallback to logo
          image = "https://www.amigoracing.com.br/logo.png";
        } else if (image && !image.startsWith("http")) {
          const cleanImage = image.startsWith("/") ? image.slice(1) : image;
          image = `${SITE_URL}/${cleanImage}`;
        }
        
        // Detect MIME Type
        if (image.toLowerCase().endsWith(".jpg") || image.toLowerCase().endsWith(".jpeg")) {
            imageType = "image/jpeg";
        } else if (image.toLowerCase().endsWith(".webp")) {
            imageType = "image/webp";
        }
      } catch (dbErr) {
        console.error("[Meta] DB Error:", dbErr);
      }

      // Read index.html from the root (Vercel builds assets and places index.html there)
      // In local dev, it's in the project root.
      const indexPath = path.join(process.cwd(), "index.html");
      let html = "";
      
      if (fs.existsSync(indexPath)) {
          html = fs.readFileSync(indexPath, "utf8");
      } else {
          // Fallback if index.html is not found (unlikely in prod)
          return res.status(404).send("App template not found");
      }

      // 7. Canonical URL
      const currentUrl = `${SITE_URL}${req.path}`;

      // Inject dynamic tags
      // 1. Title
      html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
      
      // 2. Open Graph Title
      if (html.includes('property="og:title"')) {
          html = html.replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${title}" />`);
      } else {
          html = html.replace("</head>", `  <meta property="og:title" content="${title}" />\n</head>`);
      }

      // 3. Description
      if (html.includes('name="description"')) {
          html = html.replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${description}" />`);
      } else {
          html = html.replace("</head>", `  <meta name="description" content="${description}" />\n</head>`);
      }

      // 4. Open Graph Description
      if (html.includes('property="og:description"')) {
          html = html.replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${description}" />`);
      } else {
          html = html.replace("</head>", `  <meta property="og:description" content="${description}" />\n</head>`);
      }

      if (html.includes('property="og:image"')) {
          html = html.replace(/<meta property="og:image" content=".*?" \/>/, `<meta property="og:image" content="${image}" />`);
      } else {
          html = html.replace("</head>", `  <meta property="og:image" content="${image}" />\n</head>`);
      }

      // 6. Additional Image Metadata (WhatsApp/Twitter)
      const extraMeta = `  <meta property="og:image:type" content="${imageType}" />\n` +
                        `  <meta property="og:image:width" content="1200" />\n` +
                        `  <meta property="og:image:height" content="630" />\n` +
                        `  <meta property="og:url" content="${currentUrl}" />\n` +
                        `  <meta name="twitter:card" content="summary_large_image" />\n` +
                        `  <meta name="twitter:image" content="${image}" />\n`;
      
      // Clean up existing metadata if any to avoid duplicates
      html = html.replace(/<meta property="og:image:width" content=".*?" \/>\n\s*/g, "");
      html = html.replace(/<meta property="og:image:height" content=".*?" \/>\n\s*/g, "");
      html = html.replace(/<meta property="og:url" content=".*?" \/>\n\s*/g, "");
      
      html = html.replace("</head>", `${extraMeta}</head>`);

      // Force content type to HTML
      res.header("Content-Type", "text/html");
      res.send(html);
    } catch (error) {
      console.error("[Meta] Injection Error:", error);
      // Absolute fallback
      res.sendFile(path.join(process.cwd(), "index.html"));
    }
  };

  app.get("/events/:id", handler);
  app.get("/championship/:id", handler);
  app.get("/", handler); // Also for home page
}
