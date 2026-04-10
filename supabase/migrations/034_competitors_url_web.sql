-- 034 · Añadir url_web a la tabla competitors
ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS url_web TEXT;
