import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { resumo, mode } = await req.json();

    if (!resumo || typeof resumo !== "string" || resumo.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "Envie um resumo com pelo menos 3 caracteres." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // mode = "improve" → melhora uma mensagem existente (retorna 1)
    // mode = "generate" ou default → gera 3 opções a partir de um resumo
    const isImprove = mode === "improve";

    const systemPrompt = isImprove
      ? `Você é um estrategista de mensagens de WhatsApp para barbearias.

Passo 1 — Classifique a INTENÇÃO da mensagem original em UMA destas categorias:
- VENDAS (promoções, ofertas, convites para agendar, upsell)
- MANUTENÇÃO (relacionamento, retorno, lembrete de cliente inativo, aniversário)
- INFORMAÇÃO (aviso, mudança de horário, urgência, comunicado operacional)

Passo 2 — Reescreva a mensagem seguindo estas regras RIGOROSAS:
- Português do Brasil, tom profissional, direto e cordial
- MÁXIMO 3 frases curtas — objetiva, sem enrolação
- Minimalista: fácil de ler em 3 segundos no WhatsApp
- SEM emojis, EXCETO se for INFORMAÇÃO de urgência/aviso: neste caso use no máximo 1 emoji sutil no início (ex: aviso ⚠️ ou informação ℹ️)
- Preserve as variáveis {nome}, {data}, {empresa} se existirem
- Comece de forma natural (ex: "Olá {nome}," quando fizer sentido)
- Adapte o gatilho ao tipo detectado: VENDAS = chamada de ação clara; MANUTENÇÃO = tom acolhedor; INFORMAÇÃO = frase curta e clara
- NÃO use aspas ao redor da mensagem
- NÃO explique o que fez, NÃO cite a categoria
- Retorne APENAS o texto final da mensagem, pronto para envio`
      : `Você é um redator profissional de mensagens para barbearias.


Regras RIGOROSAS:
- NÃO use emojis em hipótese alguma
- Escreva em português do Brasil
- Tom profissional, direto e cordial
- Mensagem curta (máximo 3 frases cada)
- Use a variável {nome} para personalizar a saudação
- NÃO inclua saudações genéricas como "Prezado cliente"
- Comece sempre com "Ola {nome},"
- Finalize com o nome da barbearia (use {empresa})
- NÃO use aspas ao redor das mensagens
- Retorne EXATAMENTE 3 mensagens diferentes separadas por "---" (três hifens em uma linha isolada)
- Cada mensagem deve ter um tom ligeiramente diferente: uma mais direta, uma mais persuasiva e uma mais amigável
- Retorne APENAS as 3 mensagens separadas por ---, sem explicações ou numerações`;

    const userPrompt = isImprove
      ? `Melhore esta mensagem de WhatsApp para uma barbearia, tornando-a mais profissional e estratégica:\n\n"${resumo.trim()}"`
      : `Gere 3 mensagens profissionais de WhatsApp para a barbearia com base neste resumo: "${resumo.trim()}"`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Erro no serviço de IA");
    }

    const data = await response.json();
    const generatedContent = data.choices?.[0]?.message?.content?.trim();

    if (!generatedContent) {
      throw new Error("IA não retornou mensagem");
    }

    if (isImprove) {
      return new Response(
        JSON.stringify({ mensagem: generatedContent }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse 3 mensagens separadas por ---
    const mensagens = generatedContent
      .split(/\n---\n|\n-{3,}\n/)
      .map((m: string) => m.trim())
      .filter((m: string) => m.length > 10);

    // Fallback: se não conseguiu separar, retorna como única opção
    if (mensagens.length < 2) {
      return new Response(
        JSON.stringify({ mensagens: [generatedContent] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ mensagens: mensagens.slice(0, 3) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-dispatch-message error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
