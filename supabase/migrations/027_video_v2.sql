-- ============================================================
-- Migración 027 — Módulo de Vídeo v2
-- Añade campos de dirección de arte a video_projects y video_scenes,
-- más el formato 1x1 para feeds cuadrados.
-- ============================================================

ALTER TABLE video_projects
  ADD COLUMN IF NOT EXISTS platform TEXT
    CHECK (platform IN ('tiktok','instagram_reels','youtube_shorts','linkedin')),
  ADD COLUMN IF NOT EXISTS tone TEXT
    CHECK (tone IN ('divulgativo','periodistico','cercano','tecnico')),
  ADD COLUMN IF NOT EXISTS intention TEXT
    CHECK (intention IN ('informativo','educativo','promocional')),
  ADD COLUMN IF NOT EXISTS apply_brand_assets BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_logo BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS narrative_hook TEXT;

ALTER TABLE video_projects
  DROP CONSTRAINT IF EXISTS video_projects_format_check;
ALTER TABLE video_projects
  ADD CONSTRAINT video_projects_format_check
  CHECK (format IN ('9x16','16x9','1x1','both'));

ALTER TABLE video_scenes
  ADD COLUMN IF NOT EXISTS shot_type TEXT
    CHECK (shot_type IN ('primer_plano','plano_detalle','plano_medio','plano_general','plano_americano')),
  ADD COLUMN IF NOT EXISTS camera_angle TEXT
    CHECK (camera_angle IN ('normal','picado','contrapicado','cenital')),
  ADD COLUMN IF NOT EXISTS camera_movement TEXT
    CHECK (camera_movement IN ('estatico','dolly_in','dolly_out','pan_left','pan_right','tilt_up','tilt_down','zoom_in','zoom_out')),
  ADD COLUMN IF NOT EXISTS lens TEXT
    CHECK (lens IN ('24mm','35mm','50mm','85mm','135mm')),
  ADD COLUMN IF NOT EXISTS lighting TEXT
    CHECK (lighting IN ('natural_calida','natural_fria','estudio','dramatica','suave')),
  ADD COLUMN IF NOT EXISTS background TEXT,
  ADD COLUMN IF NOT EXISTS text_overlay TEXT,
  ADD COLUMN IF NOT EXISTS seedance_prompt TEXT;
