import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { EvolutionRequestError, normalizePairingPhone, readEvolutionState, resetPairingSession, requestEvolutionPairing } from "./pairing.ts";

const sanitize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase()
    .slice(0, 24);

/**
 * Nome canônico e ISOLADO da instância: <barbearia>_<nome_do_barbeiro>.
 * Cada barbeiro de cada barbearia tem sua própria instância na Evolution API.
 */
async function resolveInstanceName(supabase: any, barbeiroId: string): Promise<string | null> {
  const { data: barberRow } = await supabase
    .from("barbeiros")
    .select("apelido, tenant_id")
    .eq("id", barbeiroId)
    .maybeSingle();

  if (!barberRow) return null;

  const { data: privateRow } = await supabase
    .from("barbeiros_private")
    .select("nome_completo")
    .eq("barbeiro_id", barbeiroId)
    .maybeSingle();

  let tenantName = "";
  if (barberRow.tenant_id) {
    const { data: tenantRow } = await supabase
      .from("tenants")
      .select("nome")
      .eq("id", barberRow.tenant_id)
      .maybeSingle();
    tenantName = tenantRow?.nome || "";
  }

  const barberDisplayName = privateRow?.nome_completo || barberRow.apelido || "";
  const tenantPart = tenantName ? sanitize(tenantName) : "";
  const barberPart = barberDisplayName ? sanitize(barberDisplayName) : "";
  const idFallback = barbeiroId.replace(/-/g, "").slice(0, 12);

  return tenantPart && barberPart
    ? `${tenantPart}_${barberPart}`
    : tenantPart
    ? `${tenantPart}_${idFallback}`
    : barberPart
    ? `barber_${barberPart}_${idFallback}`
    : `barbeiro_${idFallback}`;
}

/** Remove (logout + delete) uma instância existente, ignorando falhas. */
async function deleteInstance(apiUrl: string, token: string, name: string) {
  try {
    await fetch(`${apiUrl}/instance/logout/${name}`, { method: "DELETE", headers: { apikey: token } });
  } catch (_) { /* ignore */ }
  try {
    await fetch(`${apiUrl}/instance/delete/${name}`, { method: "DELETE", headers: { apikey: token } });
  } catch (_) { /* ignore */ }
  await new Promise((r) => setTimeout(r, 1200));
}

/**
 * Estado atual da instância na Evolution.
 * Retorna `null` quando a instância NÃO existe mais lá (precisa recriar).
 */
async function getInstanceState(apiUrl: string, token: string, name: string): Promise<string | null> {
  return readEvolutionState(apiUrl, token, name);
}

/** Número conectado (ownerJid) da instância. */
async function fetchOwnerNumber(apiUrl: string, token: string, name: string): Promise<string | null> {
  try {
    const res = await fetch(`${apiUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`, {
      headers: { apikey: token },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const item = Array.isArray(data) ? data[0] : data;
    const jid = item?.ownerJid || item?.instance?.owner || item?.owner || null;
    if (!jid) return null;
    const digits = String(jid).split("@")[0].replace(/\D/g, "");
    return digits || null;
  } catch {
    return null;
  }
}


Deno.serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_API_TOKEN = Deno.env.get("EVOLUTION_API_TOKEN");

    if (!EVOLUTION_API_URL || !EVOLUTION_API_TOKEN) {
      console.error("❌ Evolution API não configurada. EVOLUTION_API_URL:", !!EVOLUTION_API_URL, "EVOLUTION_API_TOKEN:", !!EVOLUTION_API_TOKEN);
      return new Response(
        JSON.stringify({ error: "Evolution API not configured", code: "API_NOT_CONFIGURED" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Autenticação
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", code: "NO_AUTH" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("❌ Auth error:", userError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid token", code: "INVALID_TOKEN" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, instanceName, barbeiro_id } = body;

    console.log(`📱 [whatsapp-proxy] action=${action} instanceName=${instanceName} barbeiro_id=${barbeiro_id} user=${user.id}`);

    // === Reaplica o webhook global em todos os agentes ativos ===
    if (action === "agent_resync") {
      const N8N_WEBHOOK_DEFAULT = "https://n8n-n8n.xcyr4f.easypanel.host/webhook/whatsapp-barbearia";
      const { data: hookRow } = await supabase
        .from("agente_webhook_global")
        .select("webhook_url")
        .maybeSingle();
      const targetUrl = (hookRow?.webhook_url || "").trim() || N8N_WEBHOOK_DEFAULT;

      // Somente quem enxerga agentes ativos via RLS terá efeito; usamos service role
      // apenas depois de confirmar que o usuário administra a barbearia DUB ou é admin.
      const { data: perm } = await supabase
        .from("agente_webhook_global")
        .update({ atualizado_em: new Date().toISOString() })
        .eq("id", true)
        .select("id");
      if (!perm || perm.length === 0) {
        return new Response(
          JSON.stringify({ error: "Sem permissão para sincronizar o webhook.", code: "FORBIDDEN" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: agents } = await admin
        .from("ai_agents")
        .select("barbershop_id, evolution_instance, active")
        .eq("active", true);

      const results: Array<{ instance: string; ok: boolean; status?: number; detail?: string }> = [];
      for (const ag of agents || []) {
        let instance = ag.evolution_instance as string | null;
        if (!instance) {
          const { data: wi } = await admin
            .from("whatsapp_instances")
            .select("instance_name")
            .eq("barbeiro_id", ag.barbershop_id)
            .maybeSingle();
          instance = wi?.instance_name ?? null;
        }
        if (!instance) continue;

        const post = (payload: unknown) =>
          fetch(`${EVOLUTION_API_URL}/webhook/set/${encodeURIComponent(instance!)}`, {
            method: "POST",
            headers: { apikey: EVOLUTION_API_TOKEN, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

        let res = await post({
          webhook: { enabled: true, url: targetUrl, byEvents: false, base64: false, events: ["MESSAGES_UPSERT"] },
        });
        if (!res.ok) {
          res = await post({
            url: targetUrl,
            enabled: true,
            webhook_by_events: false,
            webhook_base64: false,
            events: ["MESSAGES_UPSERT"],
          });
        }
        const detail = res.ok ? undefined : await res.text().catch(() => "");
        results.push({ instance, ok: res.ok, status: res.status, detail });
        if (instance) {
          await admin
            .from("ai_agents")
            .update({ evolution_instance: instance, updated_at: new Date().toISOString() })
            .eq("barbershop_id", ag.barbershop_id);
        }
      }

      // === Garante que quem NÃO tem agente ativo fique sem webhook ===
      const activeInstances = new Set(results.map((r) => r.instance));
      const { data: allInstances } = await admin
        .from("whatsapp_instances")
        .select("instance_name");
      const disabled: Array<{ instance: string; ok: boolean; status?: number }> = [];
      for (const wi of allInstances || []) {
        const instance = wi.instance_name as string | null;
        if (!instance || activeInstances.has(instance)) continue;
        try {
          const res = await fetch(`${EVOLUTION_API_URL}/webhook/set/${encodeURIComponent(instance)}`, {
            method: "POST",
            headers: { apikey: EVOLUTION_API_TOKEN, "Content-Type": "application/json" },
            body: JSON.stringify({ webhook: { enabled: false, url: "", events: [] } }),
          });
          disabled.push({ instance, ok: res.ok, status: res.status });
        } catch (err) {
          console.error("⚠️ [agent_resync] falha ao desligar webhook", instance, err);
          disabled.push({ instance, ok: false });
        }
      }

      console.log("🔁 [agent_resync]", targetUrl, JSON.stringify({ results, disabled }));
      return new Response(
        JSON.stringify({ success: true, webhook_url: targetUrl, results, disabled }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    }

    // === AGENTE DE IA (Bia) — por barbearia ===
    if (action === "agent_status" || action === "agent_enable" || action === "agent_disable") {
      // Webhook de produção (padrão). Pode ser sobrescrito globalmente na tela do agente.
      const N8N_WEBHOOK_DEFAULT = "https://n8n-n8n.xcyr4f.easypanel.host/webhook/whatsapp-barbearia";
      const { data: globalHook } = await supabase
        .from("agente_webhook_global")
        .select("webhook_url")
        .maybeSingle();
      const N8N_WEBHOOK_URL = (globalHook?.webhook_url || "").trim() || N8N_WEBHOOK_DEFAULT;

      if (!barbeiro_id) {
        return new Response(
          JSON.stringify({ error: "barbeiro_id is required", code: "MISSING_PARAMS" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Leitura via RLS garante que o usuário tem permissão sobre esta barbearia
      const { data: inst } = await supabase
        .from("whatsapp_instances")
        .select("instance_name, status, phone_number")
        .eq("barbeiro_id", barbeiro_id)
        .maybeSingle();

      const { data: agentRow } = await supabase
        .from("ai_agents")
        .select("id, active, name, evolution_instance")
        .eq("barbershop_id", barbeiro_id)
        .maybeSingle();

      const whatsappConnected = inst?.status === "connected" && !!inst?.instance_name;

      if (action === "agent_status") {
        // Webhook realmente configurado na Evolution para esta instância
        let evolutionWebhook: string | null = null;
        let evolutionWebhookEnabled: boolean | null = null;
        const statusInstance = (inst?.instance_name || agentRow?.evolution_instance) as string | undefined;
        if (statusInstance) {
          try {
            const findRes = await fetch(
              `${EVOLUTION_API_URL}/webhook/find/${encodeURIComponent(statusInstance)}`,
              { headers: { apikey: EVOLUTION_API_TOKEN } },
            );
            if (findRes.ok) {
              const found = await findRes.json().catch(() => null);
              const w = found?.webhook ?? found;
              evolutionWebhook = w?.url ?? null;
              evolutionWebhookEnabled = typeof w?.enabled === "boolean" ? w.enabled : null;
            }
          } catch (err) {
            console.error("⚠️ [agent] webhook/find", err);
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            active: !!agentRow?.active,
            name: agentRow?.name || "Bia",
            whatsapp_connected: whatsappConnected,
            instance_name: inst?.instance_name || null,
            phone_number: inst?.phone_number || null,
            evolution_webhook: evolutionWebhook,
            evolution_webhook_enabled: evolutionWebhookEnabled,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (action === "agent_enable") {
        if (!whatsappConnected) {
          return new Response(
            JSON.stringify({ error: "Conecte o WhatsApp desta barbearia antes de ativar a Bia.", code: "WHATSAPP_NOT_CONNECTED" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const agentInstance = inst!.instance_name as string;

        // Evolution v2 exige o corpo aninhado em "webhook"; v1 usa o formato plano.
        const setWebhook = (payload: unknown) =>
          fetch(`${EVOLUTION_API_URL}/webhook/set/${encodeURIComponent(agentInstance)}`, {
            method: "POST",
            headers: { apikey: EVOLUTION_API_TOKEN, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

        let setRes = await setWebhook({
          webhook: {
            enabled: true,
            url: N8N_WEBHOOK_URL,
            byEvents: false,
            base64: false,
            events: ["MESSAGES_UPSERT"],
          },
        });

        if (!setRes.ok) {
          const firstTxt = await setRes.text().catch(() => "");
          console.error("⚠️ [agent] webhook/set v2 falhou", setRes.status, firstTxt);
          setRes = await setWebhook({
            url: N8N_WEBHOOK_URL,
            enabled: true,
            webhook_by_events: false,
            webhook_base64: false,
            events: ["MESSAGES_UPSERT"],
          });
        }

        if (!setRes.ok) {
          const txt = await setRes.text().catch(() => "");
          console.error("❌ [agent] webhook/set falhou", setRes.status, txt);
          return new Response(
            JSON.stringify({ error: "Não foi possível configurar o agente na Evolution.", code: "WEBHOOK_FAILED", details: txt }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }


        const { error: upsertError } = await supabase
          .from("ai_agents")
          .upsert(
            { barbershop_id: barbeiro_id, evolution_instance: agentInstance, active: true },
            { onConflict: "barbershop_id" }
          );

        if (upsertError) {
          console.error("❌ [agent] upsert", upsertError.message);
          return new Response(
            JSON.stringify({ error: "Não foi possível salvar o agente.", code: "DB_ERROR" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, active: true, instance_name: agentInstance }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // agent_disable
      const disableInstance = (agentRow?.evolution_instance || inst?.instance_name || "") as string;
      if (disableInstance) {
        try {
          // v2 não tem DELETE: desliga o webhook enviando enabled=false.
          await fetch(`${EVOLUTION_API_URL}/webhook/set/${encodeURIComponent(disableInstance)}`, {
            method: "POST",
            headers: { apikey: EVOLUTION_API_TOKEN, "Content-Type": "application/json" },
            body: JSON.stringify({ webhook: { enabled: false, url: "", events: [] } }),
          });
        } catch (err) {
          console.error("⚠️ [agent] falha ao remover webhook", err);
        }
      }

      if (agentRow?.id) {
        const { error: updError } = await supabase
          .from("ai_agents")
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq("id", agentRow.id);
        if (updError) {
          console.error("❌ [agent] update", updError.message);
          return new Response(
            JSON.stringify({ error: "Não foi possível desativar o agente.", code: "DB_ERROR" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      return new Response(
        JSON.stringify({ success: true, active: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === CREATE INSTANCE ===

    if (action === "create") {
      if (!barbeiro_id) {
        return new Response(
          JSON.stringify({ error: "barbeiro_id is required", code: "MISSING_PARAMS" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Resolver nome canônico da instância: <barbearia>_<nome_completo_barbeiro>
      const finalInstanceName = await resolveInstanceName(supabase, barbeiro_id);

      if (!finalInstanceName) {
        return new Response(
          JSON.stringify({ error: "Barbeiro não encontrado", code: "BARBER_NOT_FOUND" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`🧩 instanceName recebido=${instanceName || "(vazio)"} | final=${finalInstanceName}`);


      // Primeiro, verificar se já existe uma instância com esse nome e deletá-la
      try {
        console.log(`🔄 Verificando instância existente: ${finalInstanceName}`);
        const checkRes = await fetch(
          `${EVOLUTION_API_URL}/instance/connectionState/${finalInstanceName}`,
          { method: "GET", headers: { apikey: EVOLUTION_API_TOKEN } }
        );
        if (checkRes.ok) {
          console.log(`⚠️ Instância ${finalInstanceName} já existe, removendo antes de recriar...`);
          // Tentar logout primeiro
          try {
            await fetch(`${EVOLUTION_API_URL}/instance/logout/${finalInstanceName}`, {
              method: "DELETE",
              headers: { apikey: EVOLUTION_API_TOKEN },
            });
          } catch (_) { /* ignore */ }
          // Deletar instância
          try {
            await fetch(`${EVOLUTION_API_URL}/instance/delete/${finalInstanceName}`, {
              method: "DELETE",
              headers: { apikey: EVOLUTION_API_TOKEN },
            });
            console.log(`✅ Instância antiga removida`);
          } catch (_) { /* ignore */ }
          // Pequeno delay para a API processar
          await new Promise(r => setTimeout(r, 1500));
        }
      } catch (_) {
        // Instância não existe, podemos criar normalmente
      }

      console.log(`🆕 Criando instância: ${finalInstanceName}`);

      const createPayload = {
        instanceName: finalInstanceName,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
        rejectCall: false,
        groupsIgnore: true,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
      };

      console.log(`📤 Create payload:`, JSON.stringify(createPayload));

      const createRes = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_TOKEN,
        },
        body: JSON.stringify(createPayload),
      });

      const createText = await createRes.text();
      console.log(`📥 Create response status: ${createRes.status}`);
      console.log(`📥 Create response body: ${createText.substring(0, 500)}`);

      let createData;
      try {
        createData = JSON.parse(createText);
      } catch (e) {
        console.error("❌ Resposta da Evolution API não é JSON válido:", createText.substring(0, 200));
        return new Response(
          JSON.stringify({ 
            error: "Resposta inválida da Evolution API", 
            code: "INVALID_API_RESPONSE",
            details: createText.substring(0, 200)
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!createRes.ok) {
        console.error("❌ Evolution API create error:", JSON.stringify(createData));
        return new Response(
          JSON.stringify({ 
            error: "Falha ao criar instância na Evolution API", 
            code: "CREATE_FAILED",
            details: createData?.response?.message?.[0] || createData?.message || JSON.stringify(createData)
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Extrair API key e QR code de diferentes formatos de resposta
      const instanceApiKey = createData?.hash || createData?.instance?.apikey || createData?.apikey || null;
      let qrcodeBase64 = createData?.qrcode?.base64 || createData?.base64 || null;

      console.log(`✅ Instância criada. apiKey=${instanceApiKey ? 'SIM' : 'NÃO'} qrcode=${qrcodeBase64 ? 'SIM' : 'NÃO'}`);

      // Se não veio QR code na criação, tentar buscar via connect
      if (!qrcodeBase64) {
        console.log(`🔄 QR code não retornado na criação, tentando via /instance/connect...`);
        await new Promise(r => setTimeout(r, 2000)); // aguardar a instância inicializar
        
        try {
          const connectRes = await fetch(
            `${EVOLUTION_API_URL}/instance/connect/${finalInstanceName}`,
            { method: "GET", headers: { apikey: EVOLUTION_API_TOKEN } }
          );
          const connectData = await connectRes.json();
          console.log(`📥 Connect response:`, JSON.stringify(connectData).substring(0, 300));
          qrcodeBase64 = connectData?.base64 || connectData?.qrcode?.base64 || null;
          
          if (qrcodeBase64) {
            console.log(`✅ QR code obtido via connect`);
          } else {
            console.warn(`⚠️ QR code não disponível via connect`);
          }
        } catch (e) {
          console.error("❌ Erro ao buscar QR code via connect:", e instanceof Error ? e.message : String(e));
        }
      }

      // Salvar no banco
      const { error: dbError } = await supabase
        .from("whatsapp_instances")
        .upsert(
          {
            barbeiro_id,
            instance_name: finalInstanceName,
            api_key: instanceApiKey,
            status: "connecting",
            qrcode_base64: qrcodeBase64,
          },
          { onConflict: "barbeiro_id" }
        );

      if (dbError) {
        console.error("❌ DB upsert error:", dbError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          instance_name: finalInstanceName,
          api_key: instanceApiKey,
          qrcode_base64: qrcodeBase64,
          warning: !qrcodeBase64 ? "QR Code não disponível. Tente atualizar em alguns segundos." : undefined,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === PAIRING CODE / RECONNECT (método padrão) ===
    // Reutiliza SEMPRE a mesma instância do barbeiro. Só cria na Evolution
    // quando ela realmente não existe mais lá (evita excesso de conexões).
    if (action === "pair" || action === "reconnect") {
      if (!barbeiro_id) {
        return new Response(
          JSON.stringify({ error: "barbeiro_id is required", code: "MISSING_PARAMS" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Registro atual do barbeiro (número já usado antes)
      const { data: existingRow } = await supabase
        .from("whatsapp_instances")
        .select("instance_name, api_key, phone_number")
        .eq("barbeiro_id", barbeiro_id)
        .maybeSingle();

      const normalized = normalizePairingPhone(String(body?.phone || existingRow?.phone_number || ""));

      if (!normalized) {
        return new Response(
          JSON.stringify({ error: "Número inválido", code: "INVALID_PHONE" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const finalInstanceName = await resolveInstanceName(supabase, barbeiro_id);
      if (!finalInstanceName) {
        return new Response(
          JSON.stringify({ error: "Barbeiro não encontrado", code: "BARBER_NOT_FOUND" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`🔗 [${action}] instancia=${finalInstanceName} numero=${normalized.slice(0, 4)}****`);

      const currentState = await getInstanceState(EVOLUTION_API_URL, EVOLUTION_API_TOKEN, finalInstanceName);

      // Já está conectada lá → apenas sincroniza o banco
      if (currentState === "open") {
        const ownerNumber = await fetchOwnerNumber(EVOLUTION_API_URL, EVOLUTION_API_TOKEN, finalInstanceName);
        await supabase
          .from("whatsapp_instances")
          .upsert(
            {
              barbeiro_id,
              instance_name: finalInstanceName,
              status: "connected",
              connected_at: new Date().toISOString(),
              qrcode_base64: null,
              pairing_code: null,
              pairing_expires_at: null,
              phone_number: ownerNumber || normalized,
            },
            { onConflict: "barbeiro_id" }
          );

        return new Response(
          JSON.stringify({ success: true, already_connected: true, instance_name: finalInstanceName, phone_number: ownerNumber || normalized }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let instanceApiKey: string | null = existingRow?.api_key ?? null;
      let pairingCode: string | null = null;

      // Só cria quando a instância não existe mais na Evolution
      if (currentState === null) {
        try {
          const createRes = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_TOKEN },
            body: JSON.stringify({
              instanceName: finalInstanceName,
              integration: "WHATSAPP-BAILEYS",
              number: normalized,
              qrcode: true,
              rejectCall: false,
              groupsIgnore: true,
              alwaysOnline: false,
              readMessages: false,
              readStatus: false,
            }),
          });

          const createData = await createRes.json().catch(() => null);
          if (!createRes.ok) {
            console.error(`❌ [${action}] create falhou:`, JSON.stringify(createData)?.slice(0, 300));
            return new Response(
              JSON.stringify({ error: "Falha ao criar instância", code: "CREATE_FAILED" }),
              { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          instanceApiKey = createData?.hash || createData?.instance?.apikey || createData?.apikey || instanceApiKey;
          // Generate via connect after initialization, not from the creation response.
        } catch (e) {
          console.error(`❌ [${action}] erro na criação:`, (e as Error).message);
          return new Response(
            JSON.stringify({ error: "Serviço indisponível", code: "EVOLUTION_UNAVAILABLE" }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        // Instância existe mas está desconectada: garante sessão limpa sem apagar a instância
        await resetPairingSession(EVOLUTION_API_URL, EVOLUTION_API_TOKEN, finalInstanceName);
      }

      await new Promise((r) => setTimeout(r, 1500));

      // Solicitar/renovar o código via /instance/connect?number=
      if (!pairingCode) {
        for (let attempt = 0; attempt < 3 && !pairingCode; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
          pairingCode = await requestEvolutionPairing(EVOLUTION_API_URL, EVOLUTION_API_TOKEN, finalInstanceName, normalized);
        }
      }

      if (!pairingCode) {
        return new Response(
          JSON.stringify({ error: "Código não gerado", code: "PAIRING_CODE_FAILED" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const expiresAt = new Date(Date.now() + 180000).toISOString();

      const { error: dbError } = await supabase
        .from("whatsapp_instances")
        .upsert(
          {
            barbeiro_id,
            instance_name: finalInstanceName,
            api_key: instanceApiKey,
            status: "connecting",
            qrcode_base64: null,
            phone_number: normalized,
            pairing_code: pairingCode,
            pairing_expires_at: expiresAt,
            connection_method: "pairing",
          },
          { onConflict: "barbeiro_id" }
        );

      if (dbError) {
        console.error(`[${action}] DB upsert failed:`, dbError.code);
        return new Response(JSON.stringify({ error: "Não foi possível registrar a tentativa de conexão. Tente novamente.", code: "DB_ERROR" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      console.log(`✅ [${action}] código gerado para ${finalInstanceName}`);

      return new Response(
        JSON.stringify({
          success: true,
          instance_name: finalInstanceName,
          pairing_code: pairingCode,
          phone_number: normalized,
          expires_at: expiresAt,
          reused: currentState !== null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }




    // === CHECK CONNECTION STATE (fonte da verdade = Evolution) ===
    if (action === "status") {
      if (!instanceName) {
        return new Response(
          JSON.stringify({ error: "instanceName is required", code: "MISSING_PARAMS" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const state = await getInstanceState(EVOLUTION_API_URL, EVOLUTION_API_TOKEN, instanceName);
      const instanceMissing = state === null;
      const isConnected = state === "open";

      console.log(`📊 Status: state=${state ?? "missing"} connected=${isConnected}`);

      let connectedNumber: string | null = null;

      if (barbeiro_id) {
        if (isConnected) {
          connectedNumber = await fetchOwnerNumber(EVOLUTION_API_URL, EVOLUTION_API_TOKEN, instanceName);
          await supabase
            .from("whatsapp_instances")
            .update({
              status: "connected",
              connected_at: new Date().toISOString(),
              qrcode_base64: null,
              pairing_code: null,
              pairing_expires_at: null,
              ...(connectedNumber ? { phone_number: connectedNumber } : {}),
            })
            .eq("barbeiro_id", barbeiro_id);
        } else {
          // Desconectado (inclusive quando alguém desconectou direto na Evolution):
          // refletir imediatamente no app, preservando número e nome da instância.
          const { data: row } = await supabase
            .from("whatsapp_instances")
            .select("status, pairing_expires_at")
            .eq("barbeiro_id", barbeiro_id)
            .maybeSingle();

          const pairingAtivo =
            row?.status === "connecting" &&
            !!row?.pairing_expires_at &&
            new Date(row.pairing_expires_at).getTime() > Date.now();

          if (!pairingAtivo) {
            await supabase
              .from("whatsapp_instances")
              .update({
                status: "disconnected",
                connected_at: null,
                qrcode_base64: null,
                pairing_code: null,
                pairing_expires_at: null,
              })
              .eq("barbeiro_id", barbeiro_id);
          }
        }
      }

      return new Response(
        JSON.stringify({
          state: state ?? "missing",
          connected: isConnected,
          instance_missing: instanceMissing,
          phone_number: connectedNumber,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }



    // === DISCONNECT (apenas logout — a instância é preservada p/ reconexão) ===
    if (action === "disconnect") {
      if (!instanceName) {
        return new Response(
          JSON.stringify({ error: "instanceName is required", code: "MISSING_PARAMS" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`🔌 Desconectando (logout) instância: ${instanceName}`);

      try {
        const logoutRes = await fetch(`${EVOLUTION_API_URL}/instance/logout/${instanceName}`, {
          method: "DELETE",
          headers: { apikey: EVOLUTION_API_TOKEN },
        });
        console.log(`Logout status: ${logoutRes.status}`);
      } catch (e) {
        console.error("Logout error:", (e as Error).message);
      }

      if (barbeiro_id) {
        await supabase
          .from("whatsapp_instances")
          .update({
            status: "disconnected",
            qrcode_base64: null,
            connected_at: null,
            pairing_code: null,
            pairing_expires_at: null,
          })
          .eq("barbeiro_id", barbeiro_id);
      }


      console.log(`✅ Instância desconectada`);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === GET QR CODE (refresh) ===
    if (action === "qrcode") {
      if (!instanceName) {
        return new Response(
          JSON.stringify({ error: "instanceName is required", code: "MISSING_PARAMS" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`🔄 Refreshing QR code para: ${instanceName}`);

      const qrRes = await fetch(
        `${EVOLUTION_API_URL}/instance/connect/${instanceName}`,
        { method: "GET", headers: { apikey: EVOLUTION_API_TOKEN } }
      );

      if (!qrRes.ok) {
        const errText = await qrRes.text();
        console.error(`❌ QR refresh failed (${qrRes.status}):`, errText.substring(0, 200));
        
        // Se a instância não existe mais, informar para recriar
        if (qrRes.status === 404 || qrRes.status === 400) {
          return new Response(
            JSON.stringify({ 
              qrcode_base64: null, 
              code: "INSTANCE_NOT_FOUND",
              error: "Instância não encontrada. Desconecte e reconecte para gerar novo QR Code."
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({ 
            qrcode_base64: null, 
            code: "QR_REFRESH_FAILED",
            error: `Erro ao atualizar QR Code (${qrRes.status})`
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const qrData = await qrRes.json();
      const qrcodeBase64 = qrData?.base64 || qrData?.qrcode?.base64 || null;

      console.log(`📥 QR refresh: qrcode=${qrcodeBase64 ? 'SIM' : 'NÃO'}`);

      // Verificar se já está conectado (a API retorna isso em vez do QR)
      if (qrData?.instance?.state === "open") {
        console.log(`✅ Já conectado! Atualizando banco...`);
        if (barbeiro_id) {
          await supabase
            .from("whatsapp_instances")
            .update({
              status: "connected",
              connected_at: new Date().toISOString(),
              qrcode_base64: null,
            })
            .eq("barbeiro_id", barbeiro_id);
        }
        return new Response(
          JSON.stringify({ qrcode_base64: null, already_connected: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (qrcodeBase64 && barbeiro_id) {
        await supabase
          .from("whatsapp_instances")
          .update({ qrcode_base64: qrcodeBase64, status: "connecting" })
          .eq("barbeiro_id", barbeiro_id);
      }

      return new Response(
        JSON.stringify({ 
          qrcode_base64: qrcodeBase64,
          warning: !qrcodeBase64 ? "QR Code não disponível. Aguarde alguns segundos e tente novamente." : undefined,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.warn(`⚠️ Ação desconhecida: ${action}`);
    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}`, code: "UNKNOWN_ACTION" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error instanceof EvolutionRequestError) {
      console.error(`[whatsapp-proxy] ${error.code} provider_status=${error.status}`);
      return new Response(JSON.stringify({ error: error.message, code: error.code, provider_status: error.status }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error("❌ whatsapp-proxy error:", message, error instanceof Error ? error.stack : undefined);
    return new Response(
      JSON.stringify({ error: message, code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
