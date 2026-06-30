CREATE TABLE IF NOT EXISTS importaciones_pedidos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id         UUID REFERENCES clientes(id) ON DELETE CASCADE,
  usuario_id         TEXT NOT NULL,
  pedidos_detectados JSONB NOT NULL DEFAULT '[]',
  archivo_nombre     TEXT,
  estado             TEXT NOT NULL DEFAULT 'pendiente_revision'
                     CHECK (estado IN ('pendiente_revision', 'confirmado', 'cancelado')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS importaciones_pedidos_cliente_id_idx
  ON importaciones_pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS importaciones_pedidos_usuario_id_idx
  ON importaciones_pedidos(usuario_id);
CREATE INDEX IF NOT EXISTS importaciones_pedidos_created_at_idx
  ON importaciones_pedidos(created_at DESC);
