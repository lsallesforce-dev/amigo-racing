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
      
      const rawPath = req.url || req.path || "";
      const eventMatch = rawPath.match(/\/events\/(\d+)/);
      const champMatch = rawPath.match(/\/championship\/(\d+)/);

      let id = req.params.id;
      if (!id) {
        if (eventMatch) id = eventMatch[1];
        else if (champMatch) id = champMatch[1];
      }

      const isEvent = !!eventMatch || req.path.startsWith("/events");
      const isChamp = !!champMatch || req.path.startsWith("/championship");

      // Redirect real users to the client-side app
      if (!isBot && (isEvent || isChamp)) {
         return res.sendFile(path.join(process.cwd(), "index.html"));
      }
      
      const SITE_URL = process.env.VITE_SITE_URL || process.env.SITE_URL || "https://www.amigoracing.com.br";
      let title = "Amigo Racing - Plataforma de Eventos Off-Road e Rally";
      let description = "Plataforma completa para organizar e participar de eventos de Rally e Off-Road no Brasil. Gerencie inscrições, categorias, ordem de largada e documentos em um único lugar.";
      let image = `${SITE_URL}/logo-amigo-racing.png`;
      let imageType = "image/png";

      try {
        const db = await getDb();
        if (db && id) {
            const numericId = Number(id);
            if (isEvent) {
              const [event] = await db.select().from(events).where(eq(events.id, numericId));
              if (event) {
                title = `${event.name} - Amigo Racing`;
                const dateStr = event.startDate ? new Date(event.startDate).toLocaleDateString('pt-BR') : "";
                description = event.description || `Evento de Rally em ${event.city}, ${event.state}${dateStr ? ` em ${dateStr}` : ""}`;
                if (event.imageUrl) image = event.imageUrl;
              }
            } else if (isChamp) {
              const [champ] = await db.select().from(championships).where(eq(championships.id, numericId));
              if (champ) {
                title = `${champ.name} - Amigo Racing`;
                description = `Campeonato de Rally e Off-Road ${champ.year}. Acompanhe as etapas e resultados oficiais.`;
                if (champ.imageUrl) image = champ.imageUrl;
              }
            }
        }

        // Canonical URL construction
        if (image && image.startsWith("data:")) {
          image = `${SITE_URL}/logo-amigo-racing.png`;
        } else if (image && !image.startsWith("http")) {
          const cleanImage = image.startsWith("/") ? image.slice(1) : image;
          image = `${SITE_URL}/${cleanImage}`;
        }
        
        // Detect MIME Type
        const lowerImage = image.toLowerCase();
        if (lowerImage.endsWith(".jpg") || lowerImage.endsWith(".jpeg")) {
            imageType = "image/jpeg";
        } else if (lowerImage.endsWith(".webp")) {
            imageType = "image/webp";
        } else if (lowerImage.endsWith(".png")) {
            imageType = "image/png";
        }
      } catch (dbErr) {
        console.error("[Meta] DB Error:", dbErr);
      }

      const indexPath = path.join(process.cwd(), "index.html");
      let html = "";
      
      if (fs.existsSync(indexPath)) {
          html = fs.readFileSync(indexPath, "utf8");
      } else {
          return res.status(404).send("App template not found");
      }

      const currentUrl = `${SITE_URL}${req.path}`;

      // Inject dynamic tags with regex to handle existing ones precisely
      html = html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
      
      const metaTags = [
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:image", content: image },
        { property: "og:image:type", content: imageType },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:url", content: currentUrl },
        { property: "og:site_name", content: "Amigo Racing" },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: image }
      ];

      metaTags.forEach(tag => {
        const attr = tag.name ? `name="${tag.name}"` : `property="${tag.property}"`;
        const regex = new RegExp(`<meta ${attr} content=".*?" \/>`, "i");
        if (html.match(regex)) {
          html = html.replace(regex, `<meta ${attr} content="${tag.content}" />`);
        } else {
          html = html.replace("</head>", `  <meta ${attr} content="${tag.content}" />\n</head>`);
        }
      });

      res.header("Content-Type", "text/html");
      res.send(html);

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
