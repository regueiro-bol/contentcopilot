-- Sprint 2: Tipos de artículo y 4 dimensiones de prioridad en el mapa
ALTER TABLE content_map_items
  ADD COLUMN IF NOT EXISTS tipo_articulo TEXT
    CHECK (tipo_articulo IN ('nuevo', 'actualizacion', 'mejora'))
    DEFAULT 'nuevo',
  ADD COLUMN IF NOT EXISTS p1_volumen INTEGER,
  ADD COLUMN IF NOT EXISTS p2_oportunidad INTEGER,
  ADD COLUMN IF NOT EXISTS p3_actualizacion BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS p4_manual INTEGER,
  ADD COLUMN IF NOT EXISTS prioridad_final INTEGER,
  ADD COLUMN IF NOT EXISTS validacion TEXT
    CHECK (validacion IN ('propuesto', 'aprobado', 'rechazado', 'revision'))
    DEFAULT 'propuesto',
  ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT,
  ADD COLUMN IF NOT EXISTS fecha_validacion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fecha_calendario DATE,
  ADD COLUMN IF NOT EXISTS redactor_asignado TEXT;

-- Backfill prioridad_final desde el campo priority existente
UPDATE content_map_items
SET prioridad_final = priority
WHERE prioridad_final IS NULL;

-- Backfill p1_volumen y p2_oportunidad donde haya datos
UPDATE content_map_items
SET
  p1_volumen    = volume,
  p2_oportunidad = CASE
    WHEN volume IS NOT NULL AND difficulty IS NOT NULL
    THEN ROUND(volume * (100.0 - difficulty) / 100)::INTEGER
    ELSE NULL
  END
WHERE p1_volumen IS NULL AND volume IS NOT NULL;
