-- 037 · Social benchmark — añadir campos source, competitor_id, included
-- Permite distinguir referentes manuales de competidores importados

ALTER TABLE social_benchmark
  ADD COLUMN IF NOT EXISTS source        TEXT    DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS competitor_id UUID,
  ADD COLUMN IF NOT EXISTS included      BOOLEAN DEFAULT true;

-- Índice para filtrar por client_id + included eficientemente
CREATE INDEX IF NOT EXISTS social_benchmark_client_included_idx
  ON social_benchmark(client_id, included);

NOTIFY pgrst, 'reload schema';
