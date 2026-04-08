-- Sprint 4: Calendario Editorial
CREATE TABLE IF NOT EXISTS calendario_editorial (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  map_item_id       UUID REFERENCES content_map_items(id) ON DELETE SET NULL,
  contenido_id      UUID REFERENCES contenidos(id) ON DELETE SET NULL,
  oportunidad_id    UUID REFERENCES oportunidades_actualidad(id) ON DELETE SET NULL,

  -- Datos del artículo
  titulo            TEXT NOT NULL,
  keyword           TEXT,
  tipo_articulo     TEXT CHECK (tipo_articulo IN ('nuevo','actualizacion','mejora','actualidad')),
  funnel_stage      TEXT CHECK (funnel_stage IN ('tofu','mofu','bofu')),
  cluster           TEXT,

  -- Planificación
  fecha_publicacion DATE NOT NULL,
  fecha_entrega     DATE,
  redactor_id       TEXT,

  -- Estado
  status            TEXT NOT NULL DEFAULT 'planificado'
                    CHECK (status IN (
                      'planificado','en_redaccion','revision',
                      'publicado','cancelado'
                    )),

  -- Origen
  fuente            TEXT NOT NULL DEFAULT 'almacen'
                    CHECK (fuente IN ('almacen','actualidad','manual')),

  notas             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ce_client_id_idx ON calendario_editorial(client_id);
CREATE INDEX IF NOT EXISTS ce_fecha_idx     ON calendario_editorial(fecha_publicacion);
CREATE INDEX IF NOT EXISTS ce_status_idx    ON calendario_editorial(status);

ALTER TABLE calendario_editorial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_full_access_ce" ON calendario_editorial
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
