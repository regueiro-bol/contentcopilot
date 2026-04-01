-- ============================================================
-- Tabla de pedidos de contenido editorial
-- Gestiona la ingesta de órdenes de trabajo (DOCX, Excel, manual)
-- ============================================================

CREATE TABLE IF NOT EXISTS pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('docx', 'excel', 'manual')),
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  proyecto_id UUID REFERENCES proyectos(id) ON DELETE SET NULL,
  nombre_archivo TEXT,
  estado TEXT NOT NULL DEFAULT 'procesando'
    CHECK (estado IN ('procesando', 'completado', 'error')),
  contenidos_generados INTEGER NOT NULL DEFAULT 0,
  errores JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS pedidos_cliente_id_idx    ON pedidos(cliente_id);
CREATE INDEX IF NOT EXISTS pedidos_proyecto_id_idx   ON pedidos(proyecto_id);
CREATE INDEX IF NOT EXISTS pedidos_estado_idx        ON pedidos(estado);
CREATE INDEX IF NOT EXISTS pedidos_created_at_idx    ON pedidos(created_at DESC);

-- Row Level Security
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

-- Política para service role (acceso completo desde el servidor)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pedidos'
      AND policyname = 'Service role full access on pedidos'
  ) THEN
    CREATE POLICY "Service role full access on pedidos" ON pedidos
      FOR ALL USING (true);
  END IF;
END
$$;
