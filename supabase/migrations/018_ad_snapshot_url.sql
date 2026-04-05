-- 018 · Añadir ad_snapshot_url a competitor_ads
-- Para anuncios de Google Ads Transparency donde no hay copy_text ni creative image
ALTER TABLE competitor_ads
  ADD COLUMN IF NOT EXISTS ad_snapshot_url TEXT;
