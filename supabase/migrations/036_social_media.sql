-- 036 · Social Media Module — Sprint 1
-- Tablas para estrategia, auditoría, calendario y producción de contenido social

-- ─── TABLA 1: Configuración de plataformas por cliente ────────────────────────
CREATE TABLE IF NOT EXISTS social_platforms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL CHECK (platform IN (
    'linkedin','twitter_x','instagram','facebook','tiktok','youtube'
  )),
  is_active   BOOLEAN DEFAULT false,
  handle      TEXT,
  profile_url TEXT,
  -- Datos cuantitativos de auditoría
  followers           INTEGER,
  following           INTEGER,
  posts_per_week      DECIMAL(5,2),
  avg_engagement      DECIMAL(5,2),
  last_post_date      DATE,
  -- Formatos y temas
  formats_used        TEXT[],
  main_topics         TEXT,
  top_post_example    TEXT,
  -- Valoraciones cualitativas 1-5
  score_brand_consistency INTEGER CHECK (score_brand_consistency BETWEEN 1 AND 5),
  score_editorial_quality INTEGER CHECK (score_editorial_quality BETWEEN 1 AND 5),
  score_activity          INTEGER CHECK (score_activity BETWEEN 1 AND 5),
  score_community         INTEGER CHECK (score_community BETWEEN 1 AND 5),
  -- Observaciones
  observations        TEXT,
  strategic_conclusion TEXT,
  strategic_priority  TEXT CHECK (strategic_priority IN (
    'alta','mantener','evaluar','descartar'
  )),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, platform)
);

-- ─── TABLA 2: Benchmark social ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_benchmark (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  platform     TEXT NOT NULL,
  what_they_do_well TEXT,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TABLA 3: Síntesis de auditoría (Fase 1) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS social_audit_synthesis (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  main_strengths              TEXT,
  main_weaknesses             TEXT,
  benchmark_patterns          TEXT,
  differentiation_opportunities TEXT,
  phase_1_completed   BOOLEAN DEFAULT false,
  phase_1_approved_at TIMESTAMPTZ,
  phase_1_approved_by TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id)
);

-- ─── TABLA 4: Estrategia de plataformas (Fase 2) ──────────────────────────────
CREATE TABLE IF NOT EXISTS social_strategy (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  platform_decisions          TEXT,
  channel_architecture        TEXT,
  editorial_differentiation   TEXT,
  raw_content                 JSONB,
  phase_2_completed   BOOLEAN DEFAULT false,
  phase_2_approved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id)
);

-- ─── TABLA 5: Arquitectura de contenidos (Fase 3) ─────────────────────────────
CREATE TABLE IF NOT EXISTS social_content_architecture (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  editorial_pillars    JSONB,
  formats_by_platform  JSONB,
  publishing_cadence   JSONB,
  calendar_template    TEXT,
  phase_3_completed    BOOLEAN DEFAULT false,
  phase_3_approved_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id)
);

-- ─── TABLA 6: Tono y guidelines de marca (Fase 4) ────────────────────────────
CREATE TABLE IF NOT EXISTS social_brand_voice (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  voice_manual             TEXT,
  register_by_platform     JSONB,
  editorial_red_lines      TEXT,
  consistency_guidelines   TEXT,
  phase_4_completed    BOOLEAN DEFAULT false,
  phase_4_approved_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id)
);

-- ─── TABLA 7: KPIs y métricas (Fase 5) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_kpis (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  kpis_by_objective    JSONB,
  measurement_methodology TEXT,
  reporting_system     TEXT,
  phase_5_completed    BOOLEAN DEFAULT false,
  phase_5_approved_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id)
);

-- ─── TABLA 8: Plan de acción (Fase 6) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_action_plan (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  roadmap              JSONB,
  first_90_days        TEXT,
  team_resources       TEXT,
  phase_6_completed    BOOLEAN DEFAULT false,
  phase_6_approved_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id)
);

-- ─── TABLA 9: Calendario social (Ejecución) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS social_calendar (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL CHECK (platform IN (
    'linkedin','twitter_x','instagram','facebook','tiktok','youtube'
  )),
  scheduled_date  DATE NOT NULL,
  content_type    TEXT,
  format          TEXT,
  title           TEXT,
  description     TEXT,
  status          TEXT DEFAULT 'planificado' CHECK (status IN (
    'planificado','en_produccion','aprobado','publicado'
  )),
  blog_contenido_id UUID REFERENCES contenidos(id) ON DELETE SET NULL,
  social_post_id    UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── TABLA 10: Piezas de contenido social (Ejecución) ────────────────────────
CREATE TABLE IF NOT EXISTS social_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  calendar_entry_id UUID REFERENCES social_calendar(id) ON DELETE SET NULL,
  platform        TEXT NOT NULL,
  format          TEXT,
  copy_draft      TEXT,
  copy_approved   TEXT,
  visual_description TEXT,
  ad_creative_id  UUID REFERENCES ad_creatives(id) ON DELETE SET NULL,
  status          TEXT DEFAULT 'borrador' CHECK (status IN (
    'borrador','revision','aprobado','publicado'
  )),
  humanized       BOOLEAN DEFAULT false,
  published_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Índices ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_social_platforms_client    ON social_platforms(client_id);
CREATE INDEX IF NOT EXISTS idx_social_benchmark_client    ON social_benchmark(client_id);
CREATE INDEX IF NOT EXISTS idx_social_calendar_client     ON social_calendar(client_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_social_posts_client        ON social_posts(client_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_status        ON social_posts(status);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE social_platforms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_benchmark           ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_audit_synthesis     ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_strategy            ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_content_architecture ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_brand_voice         ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_kpis                ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_action_plan         ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_calendar            ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts               ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_platforms' AND policyname = 'social_auth_access') THEN
    CREATE POLICY "social_auth_access" ON social_platforms FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_benchmark' AND policyname = 'social_auth_access') THEN
    CREATE POLICY "social_auth_access" ON social_benchmark FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_audit_synthesis' AND policyname = 'social_auth_access') THEN
    CREATE POLICY "social_auth_access" ON social_audit_synthesis FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_strategy' AND policyname = 'social_auth_access') THEN
    CREATE POLICY "social_auth_access" ON social_strategy FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_content_architecture' AND policyname = 'social_auth_access') THEN
    CREATE POLICY "social_auth_access" ON social_content_architecture FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_brand_voice' AND policyname = 'social_auth_access') THEN
    CREATE POLICY "social_auth_access" ON social_brand_voice FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_kpis' AND policyname = 'social_auth_access') THEN
    CREATE POLICY "social_auth_access" ON social_kpis FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_action_plan' AND policyname = 'social_auth_access') THEN
    CREATE POLICY "social_auth_access" ON social_action_plan FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_calendar' AND policyname = 'social_auth_access') THEN
    CREATE POLICY "social_auth_access" ON social_calendar FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_posts' AND policyname = 'social_auth_access') THEN
    CREATE POLICY "social_auth_access" ON social_posts FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
