-- 048: estado de generación de pedido por fila en content_map_items
-- Permite tracking persistente sin bloqueo global de UI

ALTER TABLE content_map_items
  ADD COLUMN IF NOT EXISTS pedido_estado      TEXT
    DEFAULT 'sin_pedido'
    CHECK (pedido_estado IN ('sin_pedido', 'generando', 'listo', 'error')),
  ADD COLUMN IF NOT EXISTS pedido_iniciado_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pedido_error_msg   TEXT        DEFAULT NULL;

-- Filas que ya tienen contenido_id se marcan como 'listo'
UPDATE content_map_items
SET pedido_estado = 'listo'
WHERE contenido_id IS NOT NULL
  AND (pedido_estado IS NULL OR pedido_estado = 'sin_pedido');

NOTIFY pgrst, 'reload schema';
