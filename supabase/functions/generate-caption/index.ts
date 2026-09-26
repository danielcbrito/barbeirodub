import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { context, caption, imageBase64 } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build messages array - include image if provided for vision analysis
    const userContent: any[] = [];

    // If image is provided, use multimodal (vision) to analyze it
    if (imageBase64) {
      userContent.push({
        type: "image_url",
        image_url: { url: imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}` },
      });
    }

    let promptText = "";
    if (caption && caption.trim()) {
      promptText = `O barbeiro escreveu esta legenda: "${caption.trim()}"\n\nMelhore esta legenda mantendo a essência, tornando-a mais profissional, criativa e envolvente. Se houver uma imagem, use-a como contexto para enriquecer a legenda.\n\nRetorne EXATAMENTE 3 versões melhoradas separadas por "|||". Sem numeração ou explicações.`;
    } else {
      promptText = `Crie 3 legendas profissionais para este post de portfólio de barbeiro.${context ? ` Contexto: ${context}` : ""} ${imageBase64 ? "Analise a imagem para criar legendas relevantes ao estilo/corte mostrado." : ""}\n\nRetorne EXATAMENTE 3 legendas separadas por "|||". Sem numeração ou explicações.`;
    }

    userContent.push({ type: "text", text: promptText });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um copywriter especializado em redes sociais para barbeiros profissionais.

Regras:
- Crie legendas de no máximo 200 caracteres cada
- Use emojis relevantes (✂️ 💈 🔥 💪 👊 ⚡ etc.)
- Tom profissional mas descontraído
- Foque em destacar habilidade, estilo e resultado
- Se uma imagem for fornecida, descreva o que vê para criar legendas contextuais
- Retorne APENAS 3 opções separadas por "|||"
- NÃO inclua numeração, prefixos ou explicações`
          },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    const suggestions = content
      .split("|||")
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0)
      .slice(0, 3);

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-caption error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
