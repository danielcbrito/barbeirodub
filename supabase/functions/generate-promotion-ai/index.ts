import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { servico, objetivo, duracaoMaximaDias } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const prompt = `Você é um especialista em marketing para barbearias premium. 
    
Crie 3 propostas de promoções para:
- Serviço: ${servico || "todos os cortes"}
- Objetivo: ${objetivo || "aumentar vendas"}
- Duração máxima: ${duracaoMaximaDias || 30} dias

Para cada promoção, retorne um JSON com:
{
  "titulo": "Título atraente e curto",
  "descricao": "Descrição persuasiva (máx 150 caracteres)",
  "desconto_percentual": número entre 10 e 40,
  "regras": ["regra 1", "regra 2"],
  "data_inicio": "YYYY-MM-DD",
  "data_fim": "YYYY-MM-DD",
  "texto_divulgacao_curto": "Texto para notificação (50 chars)",
  "texto_divulgacao_longo": "Texto completo para página da promoção",
  "tags": ["tag1", "tag2"]
}

Retorne um array com exatamente 3 propostas diferentes.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Você é um especialista em marketing para barbearias premium. Sempre responda em JSON válido." },
          { role: "user", content: prompt }
        ],
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices[0].message.content;
    
    // Extrair JSON da resposta
    let propostas;
    try {
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      propostas = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(aiResponse);
    } catch (parseError) {
      console.error("Failed to parse AI response:", aiResponse);
      throw new Error("Falha ao processar resposta da IA");
    }

    // Log do sistema
    await supabase.from("system_logs").insert({
      level: "info",
      category: "ai",
      message: "Promoções geradas por IA",
      details: { servico, objetivo, propostas },
    });

    return new Response(
      JSON.stringify({ propostas }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error:", error);
    
    // Log erro
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await supabase.from("system_logs").insert({
        level: "error",
        category: "ai",
        message: "Erro ao gerar promoções com IA",
        details: { error: error?.message || "Unknown error" },
      });
    } catch {}

    return new Response(
      JSON.stringify({ error: error?.message || "Unknown error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
