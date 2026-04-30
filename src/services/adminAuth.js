import { randomBytes, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE_NAME = "admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const sessions = new Map();

function safeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ""), "utf8");
  const rightBuffer = Buffer.from(String(right ?? ""), "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(headerValue) {
  const cookies = {};

  if (!headerValue) {
    return cookies;
  }

  for (const part of headerValue.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");

    if (!rawName) {
      continue;
    }

    cookies[rawName] = decodeURIComponent(rawValue.join("="));
  }

  return cookies;
}

function pruneExpiredSessions() {
  const now = Date.now();

  for (const [token, expiresAt] of sessions.entries()) {
    if (expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  parts.push(`Path=${options.path || "/"}`);
  parts.push(`SameSite=${options.sameSite || "Strict"}`);

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function setSessionCookie(res, token, maxAgeSeconds) {
  res.setHeader(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE_NAME, token, {
      maxAge: maxAgeSeconds,
      path: "/",
      sameSite: "Strict",
      secure: process.env.NODE_ENV === "production",
    }),
  );
}

export function isAdminPasswordValid(password, expectedPassword) {
  return safeEquals(password, expectedPassword);
}

export function createAdminSession(res) {
  pruneExpiredSessions();

  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;

  sessions.set(token, expiresAt);
  setSessionCookie(res, token, SESSION_TTL_MS / 1000);

  return {
    token,
    expiresAt,
  };
}

export function clearAdminSession(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];

  if (token) {
    sessions.delete(token);
  }

  res.setHeader(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE_NAME, "", {
      maxAge: 0,
      path: "/",
      sameSite: "Strict",
      secure: process.env.NODE_ENV === "production",
    }),
  );
}

export function requireAdminSession(req, res, next) {
  pruneExpiredSessions();

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE_NAME];

  if (token && sessions.has(token)) {
    next();
    return;
  }

  res.status(401).json({
    ok: false,
    error: "Admin session required.",
  });
}
