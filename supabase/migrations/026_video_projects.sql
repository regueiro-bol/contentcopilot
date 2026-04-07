-- ============================================================
-- Migración 026 — Módulo de Vídeo
-- ============================================================
-- Tablas video_projects + video_scenes para el módulo de
-- generación de vídeos con guión (Claude) + imagen (FLUX) +
-- voz (ElevenLabs) + animación opcional (Seedance) y montaje
-- final con ffmpeg.
-- ============================================================

-- ── video_projects ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_projects (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID        NOT NULL REFERENCES clientes(id)   ON DELETE CASCADE,
  content_id            UUID        REFERENCES contenidos(id)          ON DELETE SET NULL,

  title                 TEXT        NOT NULL,
  brief                 TEXT        NOT NULL,
  script                TEXT,

  video_type            TEXT        NOT NULL DEFAULT 'images_audio'
                        CHECK (video_type IN ('images_audio', 'animation', 'infographic')),
  duration_seconds      INTEGER     NOT NULL DEFAULT 30,
  format                TEXT        NOT NULL DEFAULT '9x16'
                        CHECK (format IN ('9x16', '16x9', 'both')),

  status                TEXT        NOT NULL DEFAULT 'draft_script'
                        CHECK (status IN (
                          'draft_script',
                          'script_approved',
                          'generating',
                          'draft_video',
                          'approved',
                          'rejected'
                        )),

  video_url             TEXT,
  thumbnail_url         TEXT,
  elevenlabs_voice_id   TEXT,
  generation_meta       JSONB       NOT NULL DEFAULT '{}',

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS video_projects_client_id_idx  ON video_projects(client_id);
CREATE INDEX IF NOT EXISTS video_projects_content_id_idx ON video_projects(content_id);
CREATE INDEX IF NOT EXISTS video_projects_status_idx     ON video_projects(status);

CREATE TRIGGER video_projects_updated_at
  BEFORE UPDATE ON video_projects
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE video_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_projects_select_authenticated"
  ON video_projects FOR SELECT TO authenticated USING (true);

CREATE POLICY "video_projects_insert_service_role"
  ON video_projects FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "video_projects_update_service_role"
  ON video_projects FOR UPDATE TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "video_projects_delete_service_role"
  ON video_projects FOR DELETE TO service_role USING (true);

-- ── video_scenes ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS video_scenes (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  video_project_id    UUID        NOT NULL REFERENCES video_projects(id) ON DELETE CASCADE,

  scene_index         INTEGER     NOT NULL,
  description         TEXT        NOT NULL,
  duration_seconds    INTEGER     NOT NULL DEFAULT 5,

  image_url           TEXT,
  video_clip_url      TEXT,
  narration_text      TEXT        NOT NULL DEFAULT '',
  audio_url           TEXT,

  status              TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'generating', 'ready', 'error')),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS video_scenes_project_idx ON video_scenes(video_project_id);
CREATE UNIQUE INDEX IF NOT EXISTS video_scenes_project_idx_unique
  ON video_scenes(video_project_id, scene_index);

ALTER TABLE video_scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "video_scenes_select_authenticated"
  ON video_scenes FOR SELECT TO authenticated USING (true);

CREATE POLICY "video_scenes_insert_service_role"
  ON video_scenes FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "video_scenes_update_service_role"
  ON video_scenes FOR UPDATE TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "video_scenes_delete_service_role"
  ON video_scenes FOR DELETE TO service_role USING (true);
