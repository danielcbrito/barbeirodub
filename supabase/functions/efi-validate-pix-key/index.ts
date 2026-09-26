/**
 * efi-validate-pix-key
 * Valida formato local + consulta DICT da Efí para confirmar se a chave existe.
 * Retorna: { valid, tipo_detectado, titular_nome (mascarado), instituicao }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { efiRequest, resolveEfiEnvForTenant } from "../_shared/efi-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function detectTipoChave(chave: string): "cpf" | "cnpj" | "email" | "telefone" | "aleatoria" | null {
  const clean = chave.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) return "aleatoria";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return "email";
  const digits = clean.replace(/\D/g, "");
  if (digits.length === 11 && /^\d{11}$/.test(digits)) return "cpf";
  if (digits.length === 14) return "cnpj";
  if (clean.startsWith("+55") || (digits.length >= 10 && digits.length <= 13)) return "telefone";
  return null;
}

function normalizarChave(chave: string, tipo: string): string {
  const clean = chave.trim();
  if (tipo === "cpf" || tipo === "cnpj") return clean.replace(/\D/g, "");
  if (tipo === "telefone") {
    const d = clean.replace(/\D/g, "");
    return d.startsWith("55") ? `+${d}` : `+55${d}`;
  }
  return clean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { chave, barbeiro_id } = await req.json();
    if (!chave || typeof chave !== "string") {
      return new Response(JSON.stringify({ error: "Chave Pix obrigatória" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tipo = detectTipoChave(chave);
    if (!tipo) {
      return new Response(JSON.stringify({ valid: false, error: "Formato de chave inválido" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chaveNormalizada = normalizarChave(chave, tipo);

    // Resolver ambiente Efí
    const admin = createClient(supabaseUrl, serviceKey);
    let efiEnv: "test" | "prod" = "prod";
    if (barbeiro_id) {
      const { data: b } = await admin.from("barbeiros").select("tenant_id").eq("id", barbeiro_id).maybeSingle();
      efiEnv = await resolveEfiEnvForTenant(admin, b?.tenant_id);
    }

    // Consultar DICT na Efí — endpoint: GET /v2/gn/dict/{chave}
    try {
      const dict = await efiRequest<any>(`/v2/gn/dict/${encodeURIComponent(chaveNormalizada)}`, {
        method: "GET", env: efiEnv,
      });
      const titular = dict?.titular?.nome || dict?.nome || null;
      const titularMascarado = titular ? titular.split(" ").map((p: string, i: number) =>
        i === 0 || i === titular.split(" ").length - 1 ? p : `${p[0]}***`
      ).join(" ") : null;

      return new Response(JSON.stringify({
        valid: true,
        tipo_detectado: tipo,
        chave_normalizada: chaveNormalizada,
        titular_nome: titularMascarado,
        instituicao: dict?.instituicao?.nome || dict?.banco?.nome || null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (dictErr: any) {
      console.warn("[efi-validate-pix-key] DICT falhou:", dictErr.message);
      // Se DICT falhar, retorna válido só pelo formato (DICT pode estar instável)
      return new Response(JSON.stringify({
        valid: true,
        tipo_detectado: tipo,
        chave_normalizada: chaveNormalizada,
        titular_nome: null,
        instituicao: null,
        dict_unavailable: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (err: any) {
    console.error("efi-validate-pix-key error:", err);
    return new Response(JSON.stringify({ error: err.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
