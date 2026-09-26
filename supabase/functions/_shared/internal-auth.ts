// Shared helpers to protect internal edge functions and validate webhook signatures.

/**
 * Verify caller is either pg_cron (uses service_role bearer) or an
 * internal caller providing `x-cron-secret` matching CRON_SECRET.
 * Returns null when authorized, or a Response with 401 otherwise.
 */
export function requireInternalCaller(req: Request): Response | null {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  const providedSecret = req.headers.get("x-cron-secret");
  if (cronSecret && providedSecret && timingSafeEqual(providedSecret, cronSecret)) {
    return null;
  }

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (serviceRoleKey && token && timingSafeEqual(token, serviceRoleKey)) {
    return null;
  }

  return new Response(
    JSON.stringify({ error: "UNAUTHORIZED", message: "internal caller required" }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Constant-time string comparison to avoid timing attacks.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/**
 * Compute HMAC-SHA256 hex digest of `body` using `secret`.
 */
export async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validate a webhook signature header against HMAC-SHA256(secret, rawBody).
 * Accepts optional "sha256=" prefix. Also accepts a plain shared-secret match
 * when the provided header is exactly equal to the secret (fallback for
 * providers that only offer a static token instead of HMAC).
 */
export async function verifyWebhookSignature(opts: {
  rawBody: string;
  headerValue: string | null;
  secret: string;
}): Promise<boolean> {
  const { rawBody, headerValue, secret } = opts;
  if (!headerValue || !secret) return false;
  const provided = headerValue.startsWith("sha256=") ? headerValue.slice(7) : headerValue;
  const expected = await hmacSha256Hex(secret, rawBody);
  if (timingSafeEqual(provided.toLowerCase(), expected.toLowerCase())) return true;
  // Fallback: static shared-secret token equality
  return timingSafeEqual(provided, secret);
}
