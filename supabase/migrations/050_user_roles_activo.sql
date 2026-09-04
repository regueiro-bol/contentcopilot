-- 050: columna activo en user_roles para desactivar miembros sin borrarlos

ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_user_roles_activo ON user_roles (activo);

NOTIFY pgrst, 'reload schema';
