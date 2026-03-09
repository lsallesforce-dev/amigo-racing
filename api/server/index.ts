import { createServer } from "http";
import net from "net";
import { serveStatic, setupVite } from "./vite.js";
import { ENV } from "../.././env.js";
import { createExpressApp } from "./app.js";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = await createExpressApp();
  const server = createServer(app);

  if (!ENV.isProduction) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT) || 3000;
  server.listen(port, "0.0.0.0", () => {
    const protocol = ENV.isProduction ? 'https' : 'http';
    const host = ENV.isProduction ? 'amigo-racing.vercel.app' : `localhost:${port}`;
    console.log(`--------------------------------`);
    console.log(`🚀 SERVIDOR INICIADO NA PORTA: ${port}`);
    console.log(`URL: ${protocol}://${host}`);
    console.log(`--------------------------------`);
  }).on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n❌ ERRO: A porta ${port} está ocupada!`);
      process.exit(1);
    }
  });
}

startServer().catch(console.error);
