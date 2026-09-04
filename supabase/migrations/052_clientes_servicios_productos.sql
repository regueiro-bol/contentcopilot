-- 052: catálogo estructurado de servicios y productos del cliente
--
-- Hasta ahora lo que vende el cliente solo existía en prosa dentro de
-- `descripcion`, que además llegaba truncada a 300 caracteres en los prompts.
-- Sin esta información, el clasificador de funnel trataba las keywords de
-- servicio ("cremación de mascotas") como informacionales → TOFU.
--
-- Esta columna alimenta:
--   - lib/context/client-context.ts  → contexto de cliente para todos los prompts
--   - app/api/strategy/clustering    → regla de intención comercial en el funnel

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS servicios_productos text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN clientes.servicios_productos IS
  'Servicios y productos que el cliente vende. Una entrada por servicio. '
  'Determina la intención comercial en la clasificación de funnel: una keyword '
  'sobre un elemento de esta lista nunca puede ser TOFU.';

NOTIFY pgrst, 'reload schema';
