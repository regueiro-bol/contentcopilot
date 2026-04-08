-- Sprint 3: Almacén de estados + columnas pendientes de Sprint 2
ALTER TABLE content_map_items
  ADD COLUMN IF NOT EXISTS notas TEXT,
  ADD COLUMN IF NOT EXISTS gsc_opportunity INTEGER;

-- Vista unificada del almacén por cliente
-- estado_almacen se deriva de validacion + status + fecha_calendario + contenido_id
CREATE OR REPLACE VIEW vista_almacen_cliente AS
SELECT
  cmi.id,
  cmi.map_id,
  cm.client_id,
  cm.session_id,
  cmi.title,
  cmi.slug,
  cmi.main_keyword,
  cmi.secondary_keywords,
  cmi.cluster,
  cmi.funnel_stage,
  cmi.tipo_articulo,
  cmi.volume,
  cmi.difficulty,
  cmi.prioridad_final,
  cmi.p1_volumen,
  cmi.p2_oportunidad,
  cmi.p3_actualizacion,
  cmi.p4_manual,
  cmi.validacion,
  cmi.motivo_rechazo,
  cmi.status,
  cmi.fecha_calendario,
  cmi.contenido_id,
  cmi.existing_url,
  cmi.content_status,
  cmi.gsc_opportunity,
  cmi.suggested_month,
  cmi.notas,
  c.nombre  AS cliente_nombre,
  c.sector  AS cliente_sector,
  krs.nombre AS sesion_nombre,
  -- Estado derivado del almacén
  CASE
    WHEN cmi.status = 'published'                                        THEN 'publicado'
    WHEN cmi.status = 'update_needed'                                    THEN 'actualizacion_pendiente'
    WHEN cmi.status = 'review'                                           THEN 'revision_editorial'
    WHEN cmi.contenido_id IS NOT NULL AND cmi.status = 'in_progress'     THEN 'en_redaccion'
    WHEN cmi.contenido_id IS NOT NULL                                    THEN 'en_redaccion'
    WHEN cmi.validacion = 'aprobado' AND cmi.fecha_calendario IS NOT NULL THEN 'en_calendario'
    WHEN cmi.validacion = 'aprobado'                                     THEN 'aprobado'
    WHEN cmi.validacion = 'rechazado'                                    THEN 'rechazado'
    WHEN cmi.validacion = 'revision'                                     THEN 'en_revision'
    ELSE 'propuesto'
  END AS estado_almacen
FROM content_map_items cmi
JOIN content_maps cm ON cm.id = cmi.map_id
JOIN clientes c ON c.id = cm.client_id
JOIN keyword_research_sessions krs ON krs.id = cm.session_id;
