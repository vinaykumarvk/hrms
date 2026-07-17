import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";

// Explicit synthetic profiles for the controlled Cloud Run demo. These are not
// customer accounts and must never be reused for a real deployment.
const PROFILES = {
  employee: { password: "password123", roles: ["employee"], permissions: ["workspace.me", "g01.employee.read", "g03.leave.read", "g03.leave.submit", "g10.payroll.read", "g12.sr.read", "g13.document.read", "g13.document.download", "g14.analytics.read.self"] },
  manager: { password: "password123", roles: ["reporting_manager"], permissions: ["workspace.me", "g01.employee.read", "g02.change.read", "g03.leave.read", "g03.leave.approve", "g05.transfer.read", "g07.training.read", "g08.apar.read", "g14.analytics.read"] },
  hr_admin: { password: "password123", roles: ["hr_admin"], permissions: ["*"] },
  finance_admin: { password: "password123", roles: ["finance_admin"], permissions: ["g10.payroll.read", "g10.payroll.write", "g11.pension.read", "g14.analytics.read"] },
  privacy_officer: { password: "password123", roles: ["privacy_officer"], permissions: ["g01.employee.read", "g13.document.read", "g13.document.download", "g13.dsr.read", "g13.dsr.adjudicate", "g14.analytics.read"] },
  analytics_admin: { password: "password123", roles: ["analytics_admin"], permissions: ["g14.analytics.read", "g14.analytics.write", "g14.analytics.export"] },
};

const require = createRequire(import.meta.url);
const api = require("../dist/apps/api/src/index.js");
const services = api.createFoundationServices({ seedTestEmployees: true });
const kernel = api.createFoundationApi(services);
const staticRoot = join(process.cwd(), "dist/apps/web");
const secret = process.env.HRMS_JWT_HS256_SECRET;
if (!secret) throw new Error("HRMS_JWT_HS256_SECRET is required");
const port = Number(process.env.PORT ?? 8080);

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
function token(userId, profile) {
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({ sub: userId, name: userId, roles: profile.roles, permissions: profile.permissions, fieldGrants: ["employee.displayName", "employee.designation", "employee.pan"], iss: "hrms-cloud-demo", aud: "hrms-cloud-demo", exp: Math.floor(Date.now() / 1000) + 1800 });
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
function verify(raw) {
  if (!raw?.startsWith("Bearer ")) return undefined;
  const parts = raw.slice(7).split(".");
  if (parts.length !== 3) return undefined;
  const expected = createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  if (!timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) return undefined;
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (claims.exp <= Math.floor(Date.now() / 1000)) return undefined;
  return {
    tenantId: api.ph03Ids.tenant,
    entityId: api.ph03Ids.entity,
    userId: claims.sub,
    actorUserId: claims.sub,
    roles: Array.isArray(claims.roles) ? claims.roles : [],
    permissions: claims.permissions,
    fieldGrants: claims.fieldGrants ?? [],
  };
}
function json(res, status, body) { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" }); res.end(JSON.stringify(body)); }
async function body(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); const raw = Buffer.concat(chunks).toString("utf8"); return raw ? JSON.parse(raw) : undefined; }
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".ico": "image/x-icon", ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".otf": "font/otf", ".txt": "text/plain; charset=utf-8", ".wasm": "application/wasm", ".pdf": "application/pdf",
};
function serve(pathname, res) { const safe = pathname === "/" ? "/index.html" : pathname; const file = join(staticRoot, safe.replace(/^\//, "")); const target = existsSync(file) ? file : join(staticRoot, "index.html"); res.writeHead(200, { "Content-Type": MIME_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-cache" }); createReadStream(target).pipe(res); }

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization" }); return res.end(); }
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { status: "ok", mode: "cloud_demo_synthetic" });
    if (req.method === "POST" && url.pathname === "/api/v1/auth/login") {
      const input = await body(req); const profile = PROFILES[input?.userId];
      if (!profile || input?.password !== profile.password) return json(res, 401, { error: { code: "UNAUTHENTICATED", message: "Invalid demo credentials" } });
      return json(res, 200, { token: token(input.userId, profile), userId: input.userId, displayName: input.userId });
    }
    if (url.pathname.startsWith("/api/v1/")) {
      const result = await kernel.dispatch({ method: req.method ?? "GET", path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body: ["GET", "HEAD"].includes(req.method ?? "") ? undefined : await body(req), actor: verify(req.headers.authorization) });
      return json(res, result.status, result.body);
    }
    return serve(url.pathname, res);
  } catch (error) { return json(res, 500, { error: { code: "INTERNAL", message: String(error?.message ?? error) } }); }
}).listen(port, "0.0.0.0", () => console.log(`HRMS cloud demo listening on ${port}`));
