import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { store } from "./storage.js";

/**
 * Personal accounts: email + password, stored as users/<hash of email>.json
 * next to the meetings, so no separate database is needed.
 *
 * Signing in returns a signed token the app sends as "Authorization: Bearer <token>".
 * The shared APP_TOKEN still works and acts as the owner's account, so the
 * existing phone app keeps working. Signing in with OWNER_EMAIL also opens the
 * owner's account, so the owner sees their earlier meetings.
 */

export const OWNER_ID = "owner";
const TOKEN_DAYS = 90;

export interface User {
  id: string;
  email: string;
  name: string;
  salt: string;
  hash: string;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

// Without AUTH_SECRET, fall back to APP_TOKEN; without either, sign-ins last until a restart.
const secret = config.authSecret || config.appToken || crypto.randomBytes(32).toString("hex");

const normEmail = (e: string) => e.trim().toLowerCase();
const userKey = (email: string) =>
  `users/${crypto.createHash("sha256").update(normEmail(email)).digest("hex").slice(0, 40)}.json`;

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function issueToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + TOKEN_DAYS * 864e5 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The account a token belongs to, or null if it is wrong or expired. */
export function userIdFromToken(token: string): string | null {
  if (!token) return null;
  if (config.appToken && same(token, config.appToken)) return OWNER_ID;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !same(sig, sign(payload))) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid: string; exp: number };
    return typeof uid === "string" && exp > Date.now() ? uid : null;
  } catch {
    return null;
  }
}

export function tokenFrom(req: { headers: Request["headers"]; url?: string }): string {
  const header = req.headers.authorization ?? "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return new URL(req.url ?? "/", "http://x").searchParams.get("token") ?? "";
}

/** Express middleware: every route after it needs a signed-in user. */
export function requireUser(req: Request, res: Response, next: NextFunction) {
  // Local development without any APP_TOKEN: everything belongs to the owner.
  if (!config.appToken && !config.authSecret && !tokenFrom(req)) {
    req.userId = OWNER_ID;
    return next();
  }
  const uid = userIdFromToken(tokenFrom(req));
  if (!uid) {
    res.status(401).json({ error: "Please log in again." });
    return;
  }
  req.userId = uid;
  next();
}

async function getUser(email: string): Promise<User | null> {
  const buf = await store.get(userKey(email));
  if (!buf) return null;
  try {
    return JSON.parse(buf.toString("utf8")) as User;
  } catch {
    return null;
  }
}

/** The account id used for meetings. The owner's email maps to the owner's account. */
function accountId(u: User): string {
  return config.ownerEmail && normEmail(u.email) === normEmail(config.ownerEmail) ? OWNER_ID : u.id;
}

const publicUser = (u: User): PublicUser => ({ id: accountId(u), email: u.email, name: u.name });

// Slow down password guessing: at most 10 attempts per 15 minutes per IP.
const attempts = new Map<string, { count: number; until: number }>();
function tooManyAttempts(ip: string): boolean {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.until < now) {
    attempts.set(ip, { count: 1, until: now + 15 * 60_000 });
    return false;
  }
  a.count++;
  return a.count > 10;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function signUp(input: { email?: unknown; password?: unknown; name?: unknown; inviteCode?: unknown }, ip: string) {
  if (tooManyAttempts(ip)) throw new AuthError("Too many tries. Wait 15 minutes and try again.", 429);
  const email = typeof input.email === "string" ? normEmail(input.email) : "";
  const password = typeof input.password === "string" ? input.password : "";
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 80) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError("Enter a valid email address.");
  if (password.length < 8) throw new AuthError("Password needs at least 8 characters.");
  if (config.inviteCode && !same(String(input.inviteCode ?? "").trim(), config.inviteCode)) {
    throw new AuthError("That invite code is not right. Ask the person who shared CIRCLE with you.", 403);
  }
  if (await getUser(email)) throw new AuthError("This email already has an account. Log in instead.", 409);
  const salt = crypto.randomBytes(16).toString("hex");
  const user: User = {
    id: crypto.randomUUID(),
    email,
    name: name || email.split("@")[0],
    salt,
    hash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };
  await store.put(userKey(email), Buffer.from(JSON.stringify(user)), "application/json");
  const pub = publicUser(user);
  return { token: issueToken(pub.id), user: pub };
}

export async function logIn(input: { email?: unknown; password?: unknown }, ip: string) {
  if (tooManyAttempts(ip)) throw new AuthError("Too many tries. Wait 15 minutes and try again.", 429);
  const email = typeof input.email === "string" ? input.email : "";
  const password = typeof input.password === "string" ? input.password : "";
  const user = email ? await getUser(email) : null;
  if (!user || !same(hashPassword(password, user.salt), user.hash)) {
    throw new AuthError("Wrong email or password.", 401);
  }
  const pub = publicUser(user);
  return { token: issueToken(pub.id), user: pub };
}
