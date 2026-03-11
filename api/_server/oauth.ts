import type { Express } from "express";
import { sdk } from "./sdk.js";
import { COOKIE_NAME, ONE_YEAR_MS } from "./const.js";
import { getSessionCookieOptions } from "./cookies.js";
import { getUserByOpenId, upsertUser } from "./db.js";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { ENV } from "./env.js";
import { sendEmail } from "./email.js";

// Local password hashing util using scrypt
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  if (!hash.includes(":")) return false;
  const [salt, key] = hash.split(":");
  const keyBuffer = Buffer.from(key, "hex");
  const derivedKey = scryptSync(password, salt, 64);
  if (keyBuffer.length !== derivedKey.length) {
    return false;
  }
  return timingSafeEqual(keyBuffer, derivedKey);
}

export function registerOAuthRoutes(app: Express) {
  console.log("[Auth] Registering OAuth/Local routes...");
  // ==========================================
  // LOCAL AUTHENTICATION ROUTES (Replacing Manus)
  // ==========================================

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, name } = req.body;
      if (!email || !password || !name) {
        return res.status(400).json({ error: "Missing email, password, or name" });
      }

      // Check if user already exists
      const existingUser = await getUserByOpenId(email);
      if (existingUser) {
        return res.status(400).json({ error: "User already exists with this email." });
      }

      const hashedPassword = hashPassword(password);

      // Create local user 
      const newUser = await upsertUser({
        openId: email,
        name: name,
        email: email,
        password: hashedPassword,
        loginMethod: "local",
        lastSignedIn: new Date(),
      });

      // Issue Session
      const sessionToken = await sdk.createSessionToken(email, {
        name: name,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ message: "Registered successfully", user: newUser, token: sessionToken });
    } catch (error: any) {
      console.error("[Auth] Registration failed", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      console.log("[Auth] Login attempt:", JSON.stringify({ email, emailLen: email?.length, pwdLen: password?.length }));
      if (!email || !password) {
        console.log("[Auth] Missing email or password in request body");
        return res.status(400).json({ error: "Missing email or password" });
      }

      const user = await getUserByOpenId(email);
      console.log("[Auth] User found in DB:", user ? "YES" : "NO", "Email used:", JSON.stringify(email));

      if (!user || !user.password) {
        console.log("[Auth] User not found or has no password set");
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const isValid = verifyPassword(password, user.password);
      console.log("[Auth] Password valid:", isValid);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      // Update last signed in
      const updatedUser = await upsertUser({
        openId: email,
        lastSignedIn: new Date(),
      });

      // Issue Session
      const sessionToken = await sdk.createSessionToken(email, {
        name: user.name || email,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ message: "Logged in successfully", user: updatedUser, token: sessionToken });
    } catch (error: any) {
      console.error("[Auth] Login failed", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  app.post("/api/auth/request-reset", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Missing email" });

      const user = await getUserByOpenId(email);
      if (!user) {
        // Return success anyway, to prevent email enumeration (security best practice)
        return res.json({ message: "If the email is valid, a link was sent." });
      }

      const resetToken = randomBytes(32).toString('hex');
      const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour token

      await upsertUser({
        openId: user.openId,
        resetToken,
        resetTokenExpires,
      });

      const rootUrl = ENV.oAuthServerUrl || `https://${req.get("host")}` || "http://localhost:5173";
      const resetLink = `${rootUrl}/auth/update-password?token=${resetToken}`;

      console.log(`\n================================`);
      console.log(`[Auth] Password Reset Link:`);
      console.log(`${resetLink}`);
      console.log(`================================\n`);
      
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h2 style="color: #ea580c;">Recuperação de Senha</h2>
          <p>Olá,</p>
          <p>Recebemos uma solicitação para redefinir a senha da sua conta no Amigo Racing.</p>
          <p>Para criar uma nova senha, clique no botão abaixo:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #ea580c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Redefinir Minha Senha</a>
          </div>
          <p style="color: #666; font-size: 14px;">Este link é válido por 1 hora. Se você não solicitou esta alteração, pode ignorar este e-mail tranquilamente.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #999; font-size: 12px; text-align: center;">🏁 Equipe Amigo Racing</p>
        </div>
      `;

      await sendEmail(email, "Redefinição de Senha - Amigo Racing", emailHtml);

      res.json({ message: "If the email is valid, a link was sent." });
    } catch (error: any) {
      console.error("[Auth] Request reset failed", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  app.post("/api/auth/update-password", async (req, res) => {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ error: "Missing token or password" });
      }

      // Check for user with this token
      const db = await import("./db.js").then(m => m.getDb());
      if (!db) return res.status(500).json({ error: "Database not available" });
      
      const { users } = await import("./schema.js");
      const { eq, and, gt } = await import("drizzle-orm");
      
      const result = await db.select().from(users).where(
        and(
           eq(users.resetToken, token),
           gt(users.resetTokenExpires, new Date())
        )
      ).limit(1);

      const user = result[0];

      if (!user) {
        return res.status(400).json({ error: "Token invalid or expired" });
      }

      const hashedPassword = hashPassword(password);

      await upsertUser({
        openId: user.openId,
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
      });

      res.json({ message: "Password updated successfully" });
    } catch (error: any) {
      console.error("[Auth] Update password failed", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  app.get("/api/oauth/logout", (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.clearCookie(COOKIE_NAME); // Clearing without options as fallback
    res.redirect("/");
  });

  app.post("/api/auth/logout", (req, res) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, cookieOptions);
    res.clearCookie(COOKIE_NAME);
    res.json({ message: "Logged out" });
  });

  // Keep old logout route to not break frontend links immediately if they use GET
  app.get("/api/oauth/login", (req, res) => {
    const redirectUri = (req.query.redirectUri as string) || "/";
    res.redirect(`/login?redirectUri=${encodeURIComponent(redirectUri)}`);
  });
}
