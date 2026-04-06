-- 022 · Ampliar plataformas de presencias para ads
-- Añade meta_ads, google_ads, tiktok_ads al CHECK constraint

ALTER TABLE referencia_presencias
  DROP CONSTRAINT IF EXISTS referencia_presencias_plataforma_check;

ALTER TABLE referencia_presencias
  ADD CONSTRAINT referencia_presencias_plataforma_check
  CHECK (plataforma IN (
    'web', 'instagram', 'tiktok', 'x', 'youtube', 'linkedin',
    'meta_ads', 'google_ads', 'tiktok_ads'
  ));
