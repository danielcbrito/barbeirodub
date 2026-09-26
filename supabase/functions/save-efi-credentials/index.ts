/**
 * save-efi-credentials
 *
 * Recebe Client ID, Client Secret, Certificado .p12 (base64) e a chave PIX
 * cadastrada na conta Efí de um barbeiro. Criptografa todos os campos sensíveis
 * com AES-256-GCM (usando EFI_ENCRYPTION_KEY) e persiste em `efi_credenciais`.
 *
 * Apenas usuários com role `admin` ou `ti` podem chamar.
 *
 * Body JSON:
 * {
 *   barbeiro_id: string (uuid),
 *   ambiente: "test" | "prod",
 *   client_id: string,
 *   client_secret: string,
 *   cert_p12_base64: string,
 *   pix_key: string
 * }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Helpers de criptografia ───────────────────────────────────────────────
function getMasterKey(): Uint8Array {
  const raw = Deno.env.get("EFI_ENCRYPTION_KEY");
  if (!raw) throw new Error("EFI_ENCRYPTION_KEY não configurada no servidor");

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = parseInt(raw.substr(i * 2, 2), 16);
    return bytes;
  }
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes.length !== 32) {
    throw new Error("EFI_ENCRYPTION_KEY deve ter 32 bytes (AES-256) — base64 ou hex de 64 chars");
  }
  return bytes;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function encryptField(plaintext: string, cryptoKey: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    new TextEncoder().encode(plaintext),
  );
  const bytes = new Uint8Array(buf);
  const ciphertext = bytes.slice(0, bytes.length - 16);
  const authTag = bytes.slice(bytes.length - 16);
  return {
    encrypted: bytesToB64(ciphertext),
    iv: bytesToB64(iv),
    auth_tag: bytesToB64(authTag),
  };
}

// ─── Validação ─────────────────────────────────────────────────────────────
function validateBody(body: any): string | null {
  if (!body || typeof body !== "object") return "Body inválido";
  const { barbeiro_id, ambiente, client_id, client_secret, cert_p12_base64, pix_key } = body;
  if (!barbeiro_id || typeof barbeiro_id !== "string") return "barbeiro_id obrigatório";
  if (!["test", "prod"].includes(ambiente)) return "ambiente deve ser 'test' ou 'prod'";
  if (!client_id || typeof client_id !== "string" || client_id.trim().length < 4) return "client_id inválido";
  if (!client_secret || typeof client_secret !== "string" || client_secret.trim().length < 4) return "client_secret inválido";
  if (!cert_p12_base64 || typeof cert_p12_base64 !== "string" || cert_p12_base64.length < 100) return "Certificado .p12 (base64) inválido";
  if (!pix_key || typeof pix_key !== "string" || pix_key.trim().length < 3) return "pix_key inválida";
  return null;
}

// ─── Handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Autenticação do usuário
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Verificar permissão (admin ou ti)
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const allowedRoles = (roles ?? []).map((r: any) => r.role);
    if (!allowedRoles.includes("admin") && !allowedRoles.includes("ti")) {
      return new Response(JSON.stringify({ error: "Sem permissão (apenas admin/ti)" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validar body
    const body = await req.json();
    const validationError = validateBody(body);
    if (validationError) {
      return new Response(JSON.stringify({ error: validationError }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { barbeiro_id, ambiente, client_id, client_secret, cert_p12_base64, pix_key } = body;

    // Verificar barbeiro existe
    const { data: barbeiro } = await admin
      .from("barbeiros")
      .select("id, apelido")
      .eq("id", barbeiro_id)
      .maybeSingle();
    if (!barbeiro) {
      return new Response(JSON.stringify({ error: "Barbeiro não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Importar chave AES
    const keyBytes = getMasterKey();
    const cryptoKey = await crypto.subtle.importKey(
      "raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"],
    );

    // Criptografar os 3 campos sensíveis
    const cidEnc = await encryptField(client_id.trim(), cryptoKey);
    const csEnc = await encryptField(client_secret.trim(), cryptoKey);
    const certEnc = await encryptField(cert_p12_base64.trim(), cryptoKey);

    // Upsert (substitui se já existir credencial pro barbeiro)
    const { data, error } = await admin
      .from("efi_credenciais")
      .upsert({
        barbeiro_id,
        ambiente,
        ativo: true,
        pix_key: pix_key.trim(),
        client_id_encrypted: cidEnc.encrypted,
        client_id_iv: cidEnc.iv,
        client_id_auth_tag: cidEnc.auth_tag,
        client_secret_encrypted: csEnc.encrypted,
        client_secret_iv: csEnc.iv,
        client_secret_auth_tag: csEnc.auth_tag,
        cert_p12_encrypted: certEnc.encrypted,
        cert_p12_iv: certEnc.iv,
        cert_p12_auth_tag: certEnc.auth_tag,
        updated_at: new Date().toISOString(),
      }, { onConflict: "barbeiro_id" })
      .select("id, barbeiro_id, ambiente, ativo, pix_key, created_at, updated_at")
      .single();

    if (error) throw error;

    console.log(`[save-efi-credentials] OK barbeiro=${barbeiro.apelido} (${barbeiro_id}) ambiente=${ambiente}`);

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("save-efi-credentials error:", err);
    return new Response(JSON.stringify({ error: err.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
