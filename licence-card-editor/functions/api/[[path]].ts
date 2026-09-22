interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface CloudflareEnv {
  DB: D1Database;
}

interface PagesContext {
  request: Request;
  env: CloudflareEnv;
}

const cardFields = [
  "photo",
  "fullName",
  "licenceNumber",
  "expiryDate",
  "licenceType",
  "permitClass",
  "dateOfBirth",
  "address",
  "addressLine2",
  "signature",
  "signaturePhoto",
  "permitStatus",
  "issueDate",
  "p1EndDate",
  "proficiency",
  "otherDetails",
  "cardNumber",
  "ageStatus",
] as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function normalizedKeyword(value: unknown) {
  if (typeof value !== "string") return null;
  const keyword = value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  if (keyword.length < 3 || keyword.length > 64) return null;
  return keyword;
}

async function keywordHash(keyword: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(keyword),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function validatedCard(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const payload: Record<string, string> = {};
  for (const field of cardFields) {
    if (typeof source[field] !== "string") return null;
    payload[field] = source[field];
  }
  return payload;
}

async function requestJson(request: Request) {
  try {
    return await request.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}

function createToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function saveTransfer(env: CloudflareEnv, request: Request) {
  const body = await requestJson(request);
  const keyword = normalizedKeyword(body?.keyword);
  const payload = validatedCard(body?.card);
  if (!keyword || !payload) {
    return jsonResponse({ message: "Enter a valid keyword and complete licence details." }, 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO licence_transfers (keyword_hash, payload, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(keyword_hash) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `).bind(await keywordHash(keyword), JSON.stringify(payload), now, now).run();

  return jsonResponse({ message: "Licence details saved to this keyword." });
}

async function loadTransfer(env: CloudflareEnv, request: Request) {
  const body = await requestJson(request);
  const keyword = normalizedKeyword(body?.keyword);
  if (!keyword) return jsonResponse({ message: "Enter a valid keyword." }, 400);

  const result = await env.DB.prepare(`
    SELECT payload FROM licence_transfers WHERE keyword_hash = ? LIMIT 1
  `).bind(await keywordHash(keyword)).all<{ payload: string }>();

  const saved = result.results[0];
  if (!saved) {
    return jsonResponse({ message: "No saved licence details were found for that keyword." }, 404);
  }

  return jsonResponse({ card: JSON.parse(saved.payload) });
}

async function createVerification(env: CloudflareEnv, request: Request) {
  const body = await requestJson(request);
  const payload = validatedCard(body?.card);
  if (!payload) {
    return jsonResponse({ message: "Complete licence details are required." }, 400);
  }

  const token = createToken();
  const expiresAt = new Date(Date.now() + 120_000).toISOString();
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO licence_transfers (keyword_hash, payload, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).bind(
    await keywordHash(`verification:${token}`),
    JSON.stringify({ ...payload, __expiresAt: expiresAt }),
    now,
    now,
  ).run();

  return jsonResponse({ token, expiresAt }, 201);
}

async function loadVerification(env: CloudflareEnv, token: string) {
  const result = await env.DB.prepare(`
    SELECT payload FROM licence_transfers WHERE keyword_hash = ? LIMIT 1
  `).bind(await keywordHash(`verification:${token}`)).all<{ payload: string }>();

  const saved = result.results[0];
  if (!saved) return jsonResponse({ message: "Verification details were not found." }, 404);

  const stored = JSON.parse(saved.payload) as Record<string, unknown>;
  const expiresAt = Date.parse(typeof stored.__expiresAt === "string" ? stored.__expiresAt : "");
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return jsonResponse({ message: "This verification QR code has expired." }, 410);
  }

  const payload = validatedCard(stored);
  if (!payload) return jsonResponse({ message: "Saved verification details are invalid." }, 500);
  return jsonResponse({ card: payload });
}

export async function onRequest({ request, env }: PagesContext) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, "") || "/";

  try {
    if (request.method === "GET" && path === "/healthz") {
      return jsonResponse({ ok: true, service: "licence-card-editor-cloudflare" });
    }
    if (request.method === "POST" && path === "/licence-transfers/save") {
      return saveTransfer(env, request);
    }
    if (request.method === "POST" && path === "/licence-transfers/load") {
      return loadTransfer(env, request);
    }
    if (request.method === "POST" && path === "/licence-verifications") {
      return createVerification(env, request);
    }
    const verificationMatch = path.match(/^\/licence-verifications\/([A-Za-z0-9_-]{24})$/);
    if (request.method === "GET" && verificationMatch) {
      return loadVerification(env, verificationMatch[1]);
    }
    return jsonResponse({ message: "Not found." }, 404);
  } catch {
    return jsonResponse({ message: "The Cloudflare API request failed." }, 500);
  }
}