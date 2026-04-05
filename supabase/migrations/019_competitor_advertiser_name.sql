-- 019 · Añadir advertiser_name a competitors
-- Permite especificar el nombre exacto del anunciante en Google Ads Transparency
-- cuando difiere del dominio/page_name (ej: "Lexpol Albor Formacion SL" para academia-geopol.es)
ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS advertiser_name TEXT;
