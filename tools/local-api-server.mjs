// Local development HTTP bridge for the HRMS API kernel.
//
// The repo's API is an in-process kernel (apps/api/src/http/apiKernel.ts)
// with no HTTP listener of its own — tests dispatch against it directly.
// This script binds the compiled kernel (dist/) to node:http so the web app
// can talk to a real same-origin API during local development.
//
// Auth: the kernel expects an already-resolved ActorContext on each request
// (identity is issued out-of-band per the PH-05B caveat). This bridge decodes
// the bearer token's JWT-style payload claims into that actor, defaulting
// tenant/entity to the PH-03 seed so the seeded data is visible.
//
// Usage:
//   node tools/local-api-server.mjs        # listens on 127.0.0.1:8787
//   PORT=9000 node tools/local-api-server.mjs
//
// NOT for production use: tokens are not signature-verified.

import { createRequire } from "node:module";
import { createServer } from "node:http";

if (process.env.NODE_ENV === "production") {
  throw new Error("The local API bridge is disabled in production");
}

const require = createRequire(import.meta.url);
const api = require("../dist/apps/api/src/index.js");

const kernel = api.createFoundationApi(api.createFoundationServices());
const PORT = Number(process.env.PORT ?? 8787);

function decodeActor(authorizationHeader) {
  if (!authorizationHeader?.startsWith("Bearer ")) return undefined;
  const token = authorizationHeader.slice("Bearer ".length);
  const segments = token.split(".");
  if (segments.length !== 3) return undefined;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(segments[1], "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  if (typeof claims.sub !== "string" || !Array.isArray(claims.permissions)) return undefined;
  return {
    tenantId: typeof claims.tenantId === "string" ? claims.tenantId : api.ph03Ids.tenant,
    entityId: typeof claims.entityId === "string" ? claims.entityId : api.ph03Ids.entity,
    userId: claims.sub,
    actorUserId: claims.sub,
    roles: Array.isArray(claims.roles) ? claims.roles : [],
    permissions: claims.permissions.filter((p) => typeof p === "string"),
    fieldGrants: Array.isArray(claims.fieldGrants) ? claims.fieldGrants : [],
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    const query = {};
    for (const [key, value] of url.searchParams) query[key] = value;

    const raw = await readBody(req);
    let body;
    if (raw.length > 0) {
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { code: "VALIDATION_FAILED", message: "Request body is not valid JSON" } }));
        return;
      }
    }

    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      headers[key] = Array.isArray(value) ? value[0] : value;
    }

    const response = kernel.dispatch({
      method: req.method,
      path: url.pathname,
      headers,
      query,
      body,
      actor: decodeActor(req.headers.authorization),
    });

    res.writeHead(response.status, { "Content-Type": "application/json", ...response.headers });
    res.end(response.body === undefined ? "" : JSON.stringify(response.body));
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { code: "INTERNAL", message: String(error?.message ?? error) } }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`HRMS local API bridge listening on http://127.0.0.1:${PORT}${api.API_BASE_PATH}`);
  console.log(`Routes registered: ${kernel.describeRoutes ? kernel.describeRoutes().length : "n/a"}`);
});
