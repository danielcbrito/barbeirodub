/**
 * WOOVI-UPDATE-SETTINGS
 * Atualiza configurações da carteira Woovi do barbeiro autenticado.
 * Body: {
 *   auto_withdraw_enabled?: boolean,
 *   auto_withdraw_min_centavos?: number,
 *   pix_key?: string,
 *   pix_key_type?: "cpf" | "cnpj" | "email" | "phone" | "random"
 * }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, handleCors, parseBody } from "../_shared/response.ts";

interface Body {
  auto_withdraw_enabled?: boolean;
  auto_withdraw_min_centavos?: number;
  pix_key?: string;
  pix_key_type?: string;
}

const VALID_KEY_TYPES = new Set(["cpf", "cnpj", "email", "phone", "random"]);
const onlyDigits = (s: string) => s.replace(/\D+/g, "");

function normalizePixKey(key: string, type?: string): string {
  const raw = key.trim();
  if (!type) return raw;
  if (type === "cpf" || type === "cnpj") return onlyDigits(raw);
  if (type === "phone") {
    const d = onlyDigits(raw);
    if (!d) return raw;
    return d.startsWith("55") ? `+${d}` : `+55${d}`;
  }
  return raw;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail("UNAUTHORIZED", "Token ausente", 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: uerr } = await supabase.auth.getUser();
    if (uerr || !user) return fail("INVALID_TOKEN", "Token inválido", 401);

    const body = (await parseBody<Body>(req)) ?? {};
    const patch: Record<string, unknown> = {};

    if (typeof body.auto_withdraw_enabled === "boolean") {
      patch.woovi_auto_withdraw_enabled = body.auto_withdraw_enabled;
    }
    if (
      typeof body.auto_withdraw_min_centavos === "number" &&
      body.auto_withdraw_min_centavos >= 100
    ) {
      patch.woovi_auto_withdraw_min_centavos = Math.round(
        body.auto_withdraw_min_centavos,
      );
    }

    if (typeof body.pix_key_type === "string") {
      if (!VALID_KEY_TYPES.has(body.pix_key_type)) {
        return fail("INVALID_KEY_TYPE", "Tipo de chave Pix inválido");
      }
      patch.woovi_pix_key_type = body.pix_key_type;
    }

    if (typeof body.pix_key === "string") {
      const normalized = normalizePixKey(
        body.pix_key,
        body.pix_key_type ?? undefined,
      );
      if (!normalized) {
        return fail("INVALID_KEY", "Chave Pix inválida");
      }
      if (body.pix_key_type === "email" && !normalized.includes("@")) {
        return fail("INVALID_KEY", "E-mail inválido");
      }
      patch.woovi_pix_key = normalized;
    }

    if (!Object.keys(patch).length) {
      return fail("NO_FIELDS", "Nenhum campo válido para atualizar");
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await admin
      .from("barbeiros")
      .update(patch)
      .eq("user_id", user.id)
      .select(
        "woovi_auto_withdraw_enabled, woovi_auto_withdraw_min_centavos, woovi_pix_key, woovi_pix_key_type",
      )
      .maybeSingle();

    if (error) return fail("UPDATE_FAILED", error.message, 500);
    if (!data) {
      return fail(
        "BARBER_NOT_FOUND",
        "Nenhum barbeiro vinculado a este usuário",
        404,
      );
    }
    return ok(data);
  } catch (err) {
    console.error("[woovi-update-settings] erro:", err);
    return fail("INTERNAL", (err as Error).message ?? "Erro interno", 500);
  }
});
