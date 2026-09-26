/**
 * HEALTH-CHECK — Verifica a saúde dos serviços integrados
 * 
 * Migrado para padrão ok/fail de _shared/response.ts
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, handleCors } from "../_shared/response.ts";

interface HealthCheck {
  service_name: string;
  status: "healthy" | "degraded" | "down";
  response_time_ms: number;
  error_message?: string | null;
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const checks: HealthCheck[] = [];

    // ═══ Check 1: Database ═══
    const dbStart = Date.now();
    try {
      const { error } = await supabase
        .from("profiles")
        .select("count")
        .limit(1)
        .maybeSingle();
      checks.push({
        service_name: "database",
        status: error ? "degraded" : "healthy",
        response_time_ms: Date.now() - dbStart,
        error_message: error?.message ?? null,
      });
    } catch (error: unknown) {
      checks.push({
        service_name: "database",
        status: "down",
        response_time_ms: Date.now() - dbStart,
        error_message: error instanceof Error ? error.message : "Unknown error",
      });
    }

    // ═══ Check 2: Asaas API ═══
    const asaasKey = Deno.env.get("ASAAS_API_KEY");
    if (asaasKey) {
      const asaasStart = Date.now();
      try {
        const response = await fetch(
          "https://api.asaas.com/v3/customers?limit=1",
          { headers: { access_token: asaasKey } }
        );
        checks.push({
          service_name: "asaas",
          status: response.ok ? "healthy" : "degraded",
          response_time_ms: Date.now() - asaasStart,
          error_message: response.ok ? null : `HTTP ${response.status}`,
        });
      } catch (error: unknown) {
        checks.push({
          service_name: "asaas",
          status: "down",
          response_time_ms: Date.now() - asaasStart,
          error_message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // ═══ Check 3: Google Calendar ═══
    const googleRefreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
    if (googleRefreshToken) {
      const googleStart = Date.now();
      try {
        const response = await fetch(
          "https://www.googleapis.com/calendar/v3/users/me/calendarList",
          { headers: { Authorization: `Bearer ${googleRefreshToken}` } }
        );
        checks.push({
          service_name: "google_calendar",
          status: response.ok ? "healthy" : "degraded",
          response_time_ms: Date.now() - googleStart,
          error_message: response.ok ? null : `HTTP ${response.status}`,
        });
      } catch (error: unknown) {
        checks.push({
          service_name: "google_calendar",
          status: "down",
          response_time_ms: Date.now() - googleStart,
          error_message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // ═══ Persistir no banco ═══
    for (const check of checks) {
      await supabase.from("system_health_checks").upsert(
        { ...check, last_check_at: new Date().toISOString() },
        { onConflict: "service_name" }
      );
    }

    return ok({ checks });
  } catch (error: unknown) {
    console.error("[health-check] Erro fatal:", error);
    return fail(
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "Erro interno",
      500
    );
  }
});
