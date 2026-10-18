import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Edge function para gerenciar autenticação OAuth do Instagram.
 *
 * Endpoints:
 * - POST { action: "get_auth_url", barbeiro_id } → retorna URL de autorização
 * - POST { action: "exchange_code", code, barbeiro_id } → troca code por token
 * - POST { action: "disconnect", barbeiro_id } → remove conexão
 * - POST { action: "refresh_token", barbeiro_id } → renova token longa duração
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const INSTAGRAM_APP_ID = Deno.env.get("INSTAGRAM_APP_ID");
    const INSTAGRAM_APP_SECRET = Deno.env.get("INSTAGRAM_APP_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!INSTAGRAM_APP_ID || !INSTAGRAM_APP_SECRET) {
      return new Response(
        JSON.stringify({ error: "Instagram App não configurado. Configure INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Autenticar usuário
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub;

    const body = await req.json();
    const { action, barbeiro_id, code } = body;

    // Verificar que o barbeiro pertence ao usuário
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: barber } = await adminClient
      .from("barbeiros")
      .select("id, user_id")
      .eq("id", barbeiro_id)
      .maybeSingle();

    if (!barber || barber.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Barbeiro não encontrado ou sem permissão" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Redirect URI — aponta para a página do barbeiro que vai capturar o code
    const REDIRECT_URI = `${req.headers.get("origin") || "https://dubadmin.lovable.app"}/barbeiro/instagram-callback`;

    switch (action) {
      case "get_auth_url": {
        const authUrl =
          `https://api.instagram.com/oauth/authorize` +
          `?client_id=${INSTAGRAM_APP_ID}` +
          `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
          `&scope=user_profile,user_media` +
          `&response_type=code` +
          `&state=${barbeiro_id}`;

        return new Response(JSON.stringify({ url: authUrl }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "exchange_code": {
        if (!code) {
          return new Response(JSON.stringify({ error: "Code é obrigatório" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // 1. Trocar code por short-lived token
        const tokenFormData = new URLSearchParams();
        tokenFormData.append("client_id", INSTAGRAM_APP_ID);
        tokenFormData.append("client_secret", INSTAGRAM_APP_SECRET);
        tokenFormData.append("grant_type", "authorization_code");
        tokenFormData.append("redirect_uri", REDIRECT_URI);
        tokenFormData.append("code", code);

        const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
          method: "POST",
          body: tokenFormData,
        });
        const tokenData = await tokenRes.json();

        if (!tokenRes.ok || !tokenData.access_token) {
          console.error("Instagram token exchange failed:", tokenData);
          return new Response(
            JSON.stringify({ error: "Falha ao conectar com Instagram", details: tokenData }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 2. Trocar short-lived por long-lived token (60 dias)
        const longLivedRes = await fetch(
          `https://graph.instagram.com/access_token` +
            `?grant_type=ig_exchange_token` +
            `&client_secret=${INSTAGRAM_APP_SECRET}` +
            `&access_token=${tokenData.access_token}`
        );
        const longLivedData = await longLivedRes.json();

        const finalToken = longLivedData.access_token || tokenData.access_token;
        const expiresIn = longLivedData.expires_in || 3600;

        // 3. Buscar perfil do Instagram
        const profileRes = await fetch(
          `https://graph.instagram.com/me?fields=id,username,account_type,media_count&access_token=${finalToken}`
        );
        const profileData = await profileRes.json();

        if (!profileData.id) {
          return new Response(
            JSON.stringify({ error: "Falha ao obter perfil do Instagram" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 4. Salvar no banco
        const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

        const { error: upsertError } = await adminClient
          .from("instagram_connections")
          .upsert(
            {
              barbeiro_id,
              ig_user_id: profileData.id,
              ig_username: profileData.username,
              access_token: finalToken,
              token_expires_at: expiresAt,
              show_posts_on_landing: true,
            },
            { onConflict: "barbeiro_id" }
          );

        if (upsertError) {
          console.error("Upsert error:", upsertError);
          return new Response(
            JSON.stringify({ error: "Erro ao salvar conexão" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 5. Buscar e cachear posts
        await cachePosts(adminClient, barbeiro_id, finalToken);

        return new Response(
          JSON.stringify({
            success: true,
            username: profileData.username,
            media_count: profileData.media_count,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "disconnect": {
        // Remover conexão (cascade deleta posts cache)
        await adminClient.from("instagram_connections").delete().eq("barbeiro_id", barbeiro_id);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "refresh_posts": {
        // Buscar conexão existente
        const { data: conn } = await adminClient
          .from("instagram_connections")
          .select("access_token")
          .eq("barbeiro_id", barbeiro_id)
          .maybeSingle();

        if (!conn?.access_token) {
          return new Response(JSON.stringify({ error: "Instagram não conectado" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await cachePosts(adminClient, barbeiro_id, conn.access_token);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "Ação inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    console.error("Instagram auth error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Busca os últimos 12 posts do Instagram e salva no cache.
 */
async function cachePosts(
  adminClient: SupabaseClient<any>,
  barbeiroId: string,
  accessToken: string
) {
  try {
    const mediaRes = await fetch(
      `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=12&access_token=${accessToken}`
    );
    const mediaData = await mediaRes.json();

    if (!mediaData.data || !Array.isArray(mediaData.data)) return;

    // Buscar connection_id
    const { data: conn } = await adminClient
      .from("instagram_connections")
      .select("id")
      .eq("barbeiro_id", barbeiroId)
      .maybeSingle();

    if (!conn) return;

    // Limpar cache antigo
    await adminClient.from("instagram_posts_cache").delete().eq("connection_id", conn.id);

    // Inserir novos posts
    const posts = mediaData.data.map((post: any) => ({
      connection_id: conn.id,
      ig_post_id: post.id,
      media_type: post.media_type || "IMAGE",
      media_url: post.media_url || "",
      thumbnail_url: post.thumbnail_url || null,
      caption: post.caption || null,
      permalink: post.permalink || null,
      post_timestamp: post.timestamp || null,
    }));

    if (posts.length > 0) {
      await adminClient.from("instagram_posts_cache").insert(posts);
    }
  } catch (err) {
    console.error("Error caching Instagram posts:", err);
  }
}
