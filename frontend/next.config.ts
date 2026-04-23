import type { NextConfig } from "next";
import path from "path";

// Fase J.4 — CSP-headers prod vs dev.
// Dev tillater localhost og 'unsafe-eval' (Next.js HMR + React fast refresh).
// Prod er strict: kun thefold.twofold.no-origins, ingen 'unsafe-eval',
// script-src avgrenses til 'self' (+ Next.js inline script nonces hvis satt opp).
const IS_PROD = process.env.NODE_ENV === "production";

// COMMENT IN FOR PROD (thefold.twofold.no) — strict CSP
const CSP_PROD = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://thefold.twofold.no https://*.twofold.no https://github.com https://avatars.githubusercontent.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://thefold.twofold.no https://*.twofold.no https://*.encoreapi.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

// COMMENT OUT FOR PROD (localhost dev) — permissive CSP
const CSP_DEV = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' http://localhost:* http://127.0.0.1:* https://*.encoreapi.com https://*.twofold.no ws://localhost:* ws://127.0.0.1:*",
  "frame-ancestors 'none'",
].join("; ");

const CSP = IS_PROD ? CSP_PROD : CSP_DEV;

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-XSS-Protection",
    value: "1; mode=block",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=()",
  },
  // Fase J.4 — HSTS i prod tvinger HTTPS i 1 år inkludert subdomener.
  // COMMENT IN FOR PROD
  // { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  // COMMENT OUT FOR PROD
  ...(IS_PROD
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }]
    : []),
  {
    key: "Content-Security-Policy",
    value: CSP,
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL || "http://localhost:4000"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
