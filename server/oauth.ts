import type { Express } from "express";
import { sdk } from "./sdk.ts";
import { COOKIE_NAME, ONE_YEAR_MS } from "../const.ts";
import { getSessionCookieOptions } from "./cookies.ts";
import { getUserByOpenId, upsertUser } from "./db.ts";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { ENV } from "./env.ts";

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
      console.log("[Auth] Setting session cookie:", COOKIE_NAME, "Options:", cookieOptions);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ message: "Logged in successfully", user: updatedUser, token: sessionToken });
    } catch (error: any) {
      console.error("[Auth] Login failed", error);
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
