
-- Table to store Instagram OAuth connections per barbeiro
CREATE TABLE public.instagram_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barbeiro_id uuid NOT NULL REFERENCES public.barbeiros(id) ON DELETE CASCADE,
  ig_user_id text NOT NULL,
  ig_username text NOT NULL,
  access_token text NOT NULL,
  token_expires_at timestamptz,
  profile_picture_url text,
  show_posts_on_landing boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(barbeiro_id)
);

-- Cache of Instagram posts to avoid hitting API rate limits
CREATE TABLE public.instagram_posts_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.instagram_connections(id) ON DELETE CASCADE,
  ig_post_id text NOT NULL,
  media_type text NOT NULL,
  media_url text NOT NULL,
  thumbnail_url text,
  caption text,
  permalink text,
  post_timestamp timestamptz,
  cached_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id, ig_post_id)
);

-- RLS
ALTER TABLE public.instagram_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_posts_cache ENABLE ROW LEVEL SECURITY;

-- Barbeiro can manage their own connection
CREATE POLICY "Barbeiro manages own instagram"
  ON public.instagram_connections
  FOR ALL
  TO authenticated
  USING (
    barbeiro_id IN (
      SELECT b.id FROM public.barbeiros b WHERE b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    barbeiro_id IN (
      SELECT b.id FROM public.barbeiros b WHERE b.user_id = auth.uid()
    )
  );

-- Admin can see all connections
CREATE POLICY "Admin can view all instagram connections"
  ON public.instagram_connections
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Public read for posts cache (landing page needs this)
CREATE POLICY "Public can read instagram posts cache"
  ON public.instagram_posts_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Barbeiro can manage their own posts cache via connection
CREATE POLICY "Barbeiro manages own posts cache"
  ON public.instagram_posts_cache
  FOR ALL
  TO authenticated
  USING (
    connection_id IN (
      SELECT ic.id FROM public.instagram_connections ic
      JOIN public.barbeiros b ON b.id = ic.barbeiro_id
      WHERE b.user_id = auth.uid()
    )
  )
  WITH CHECK (
    connection_id IN (
      SELECT ic.id FROM public.instagram_connections ic
      JOIN public.barbeiros b ON b.id = ic.barbeiro_id
      WHERE b.user_id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE TRIGGER set_instagram_connections_updated_at
  BEFORE UPDATE ON public.instagram_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
