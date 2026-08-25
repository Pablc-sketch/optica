-- Mismo problema que jwt_rol() (20260725000013): jwt_tenant_id() leía el
-- tenant_id directamente del token de sesión (auth.jwt()->>'tenant_id').
-- Storage de Supabase no garantiza tener disponible el JSON completo del
-- token (auth.jwt()) al evaluar las políticas de storage.objects, aunque sí
-- resuelve de forma confiable auth.uid() (quién es el usuario) — por eso el
-- rol (ya arreglado para usar auth.uid()) funcionaba bien, pero el
-- tenant_id seguía fallando justo al subir archivos (logo, fotos de
-- marcos), con "row-level security policy" aunque todos los datos
-- estuvieran correctos. Se corrige de la misma forma: buscarlo en vivo en
-- public.users en vez de confiar en el token.
create or replace function public.jwt_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.users where id = auth.uid()
$$;
