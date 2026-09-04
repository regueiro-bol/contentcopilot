-- 051: presets de permisos y clientes en user_invitations
-- Permiten preconfigurar permisos en el momento de invitar, antes de que
-- el usuario exista en Clerk. El webhook user.created los aplica al crear
-- la cuenta.

ALTER TABLE user_invitations
  ADD COLUMN IF NOT EXISTS permissions_preset jsonb,
  ADD COLUMN IF NOT EXISTS client_ids_preset  text[];

NOTIFY pgrst, 'reload schema';
