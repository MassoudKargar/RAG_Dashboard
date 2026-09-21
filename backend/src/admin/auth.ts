import crypto from "node:crypto";
import { loadConfig } from "../config.js";
import { ensureDir, appendRow, readRows, writeRows } from "./store.js";
import fs from "node:fs";
import path from "node:path";

/**
 * Authentication + authorization for the RAG Administration Console.
 *
 * No Keycloak/OIDC exists on this server, so we provide an application-level
 * session auth layer with a single ADMIN role:
 *   - scrypt password hashing (node:crypto, no extra dependency)
 *   - random session token stored hashed; HttpOnly + SameSite=Strict cookies
 *   - double-submit CSRF token (cookie + X-CSRF-Token header) for mutations
 *   - login rate limiting
 *   - every action recorded to the audit log by the caller
 */

export interface UserRecord {
  username: string;
  scrypt: { salt: string; hash: string; params: string };
  role: "admin";
  createdAt: string;
}

export interface SessionRecord {
  tokenHash: string;
  csrf: string;
  username: string;
  role: string;
  createdAt: string;
  expiresAt: string;
}

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  keylen: 32,
};

export function hashPassword(password: string, saltHex?: string): { salt: string; hash: string; params: string } {
  const salt = saltHex ?? crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, Buffer.from(salt, "hex"), 64, { N: 16384, r: 8, p: 1 });
  return { salt, hash: hash.toString("hex"), params: JSON.stringify({ N: 16384, r: 8, p: 1, keylen: 64 }) };
}

export function verifyPassword(password: string, rec: UserRecord): boolean {
  try {
    const h = crypto.scryptSync(password, Buffer.from(rec.scrypt.salt, "hex"), 64, { N: 16384, r: 8, p: 1 });
    return crypto.timingSafeEqual(h, Buffer.from(rec.scrypt.hash, "hex"));
  } catch {
    return false;
  }
}

export class Auth {
  private dir: string;
  private users: UserRecord[] = [];
  private sessions: SessionRecord[] = [];
  private loginAttempts: Record<string, number[]> = {};
  private ttlMs: number;
  private maxAttempts: number;
  private windowMs: number;

  constructor(usersDir: string, ttlMinutes: number, maxAttempts: number, windowMinutes: number) {
    this.dir = usersDir;
    this.ttlMs = ttlMinutes * 60_000;
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMinutes * 60_000;
    ensureDir(this.dir);
    this.users = readRows<UserRecord>(path.join(this.dir, "users.jsonl"));
    this.sessions = readRows<SessionRecord>(path.join(this.dir, "sessions.jsonl"));
    this.cleanupExpired();
  }

  /** Bootstrap (or keep) the admin account. Password is provided only on first boot. */
  bootstrapAdmin(username: string, password?: string): { username: string; passwordWasSet: boolean; generated?: string } {
    if (this.users.some((u) => u.username === username)) {
      return { username, passwordWasSet: false };
    }
    let pass = password;
    let generated: string | undefined;
    if (!pass) {
      generated = crypto.randomBytes(18).toString("base64").replace(/[+/=]/g, "x");
      pass = generated;
    }
    const rec: UserRecord = {
      username,
      role: "admin",
      scrypt: hashPassword(pass),
      createdAt: new Date().toISOString(),
    };
    this.users.push(rec);
    writeRows(path.join(this.dir, "users.jsonl"), this.users);
    return { username, passwordWasSet: Boolean(password), generated };
  }

  private cleanupExpired(): void {
    const now = Date.now();
    this.sessions = this.sessions.filter((s) => Date.parse(s.expiresAt) > now);
  }

  persistSessions(): void {
    writeRows(path.join(this.dir, "sessions.jsonl"), this.sessions);
  }

  isLocked(ip: string): boolean {
    const times = (this.loginAttempts[ip] ?? []).filter((t) => Date.now() - t < this.windowMs);
    this.loginAttempts[ip] = times;
    return times.length >= this.maxAttempts;
  }

  private noteAttempt(ip: string, ok: boolean): void {
    if (ok) {
      delete this.loginAttempts[ip];
      return;
    }
    const times = this.loginAttempts[ip] ?? [];
    times.push(Date.now());
    this.loginAttempts[ip] = times;
  }

  login(username: string, password: string, ip: string): { ok: boolean; session?: SessionRecord; rawToken?: string; reason?: string } {
    if (this.isLocked(ip)) return { ok: false, reason: "locked" };
    const user = this.users.find((u) => u.username === username);
    if (!user || !verifyPassword(password, user)) {
      this.noteAttempt(ip, false);
      return { ok: false, reason: "bad_credentials" };
    }
    this.noteAttempt(ip, true);
    const token = crypto.randomBytes(32).toString("hex");
    const rec: SessionRecord = {
      tokenHash: sha256(token),
      csrf: crypto.randomBytes(24).toString("hex"),
      username: user.username,
      role: user.role,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.ttlMs).toISOString(),
    };
    this.sessions.push(rec);
    this.persistSessions();
    return { ok: true, session: rec, rawToken: token };
  }

  /** Return session + raw token (presented once) when validation succeeds. */
  sessionForToken(token: string): SessionRecord | undefined {
    if (!token) return undefined;
    this.cleanupExpired();
    const h = sha256(token);
    const s = this.sessions.find((x) => x.tokenHash === h);
    return s;
  }

  logout(token: string): void {
    if (!token) return;
    const h = sha256(token);
    this.sessions = this.sessions.filter((x) => x.tokenHash !== h);
    this.persistSessions();
  }

  csrfValid(session: SessionRecord, header: string | undefined): boolean {
    return Boolean(session && header && timingSafeEquals(session.csrf, header ?? ""));
  }
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function timingSafeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}