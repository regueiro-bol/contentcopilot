-- 049: histórico de regeneraciones de brief
-- Guarda cada vez que se regenera un brief con IA, con el comentario opcional del editor.

CREATE TABLE IF NOT EXISTS brief_regeneraciones (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contenido_id uuid        NOT NULL REFERENCES contenidos(id) ON DELETE CASCADE,
  proyecto_id  uuid,
  cliente_id   uuid,
  usuario_id   text,
  comentario   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brief_regen_contenido ON brief_regeneraciones(contenido_id);
CREATE INDEX IF NOT EXISTS idx_brief_regen_proyecto  ON brief_regeneraciones(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_brief_regen_cliente   ON brief_regeneraciones(cliente_id);

ALTER TABLE brief_regeneraciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON brief_regeneraciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
