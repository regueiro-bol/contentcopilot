-- ─────────────────────────────────────────────────────────────────────────────
-- 039_visual_generations.sql
-- Tracks every AI image generation event (social posts, ad creatives, etc.)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS visual_generations (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  source_type              TEXT        NOT NULL CHECK (source_type IN ('social_post','ad_creative','blog','manual')),
  source_id                UUID,
  model_used               TEXT        NOT NULL,
  model_reason             TEXT,
  visual_description_input TEXT,
  generated_prompt         TEXT,
  variations_urls          TEXT[],
  selected_url             TEXT,
  was_approved             BOOLEAN,
  was_regenerated          BOOLEAN     DEFAULT false,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visual_generations_client
  ON visual_generations(client_id, source_type);

-- Let PostgREST pick up the new table immediately
NOTIFY pgrst, 'reload schema';
