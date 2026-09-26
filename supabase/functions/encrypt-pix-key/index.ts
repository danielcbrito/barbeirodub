import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * encrypt-pix-key
 * Recebe a chave PIX em texto plano e a salva criptografada (AES-256-GCM)
 * usando PIX_ENCRYPTION_KEY (32 bytes em base64 ou hex) configurada no servidor.
 *
 * Body: {
 *   tipo,
 *   chave,
 *   apelido?,
 *   nome_titular?,
 *   instituicao?,
 *   barbeiro_id?,
 *   is_default?
 * }
 */

function getMasterKey(): Uint8Array {
  const raw = Deno.env.get("PIX_ENCRYPTION_KEY");
  if (!raw) throw new Error("PIX_ENCRYPTION_KEY não configurada");

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(raw.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes.length !== 32) {
    throw new Error("PIX_ENCRYPTION_KEY deve ter 32 bytes (AES-256)");
  }
  return bytes;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function maskPixKey(tipo: string, chave: string): string {
  const c = chave.trim();
  if (tipo === "email") {
    const [user, domain] = c.split("@");
    if (!domain) return "***";
    return `${user.slice(0, 2)}***@${domain}`;
  }
  if (c.length <= 4) return "***";
  return `***${c.slice(-4)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { tipo, chave, apelido, nome_titular, instituicao, barbeiro_id, is_default } = body ?? {};

    if (!tipo || !chave) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const keyBytes = getMasterKey();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(String(chave).trim());
    const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, plaintext);
    const cipherBytes = new Uint8Array(cipherBuf);
    const ciphertext = cipherBytes.slice(0, cipherBytes.length - 16);
    const authTag = cipherBytes.slice(cipherBytes.length - 16);
    const masked = maskPixKey(String(tipo), String(chave));

    if (is_default) {
      await supabase.from("chaves_pix").update({ is_default: false }).eq("user_id", user.id);
    }

    const { data, error } = await supabase
      .from("chaves_pix")
      .insert({
        user_id: user.id,
        barbeiro_id: barbeiro_id || null,
        tipo,
        chave: masked,
        chave_encrypted: bytesToB64(ciphertext),
        chave_iv: bytesToB64(iv),
        chave_auth_tag: bytesToB64(authTag),
        apelido: apelido || null,
        is_default: !!is_default,
        nome_titular: nome_titular || null,
        instituicao: instituicao || null,
      })
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("encrypt-pix-key error:", err);
    return new Response(JSON.stringify({ error: err.message || "Erro ao criptografar chave PIX" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
