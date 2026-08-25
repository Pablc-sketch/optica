-- Datos profesionales por usuario (no por óptica): para que el timbre del
-- profesional que atendió aparezca en la orden de trabajo impresa, con los
-- datos de quien tiene la sesión abierta en ese momento. Nullable porque no
-- todos los roles los necesitan (bodega, ventas).
alter table public.users
  add column if not exists rut text,
  add column if not exists titulo_profesional text,
  add column if not exists registro_profesional text;
