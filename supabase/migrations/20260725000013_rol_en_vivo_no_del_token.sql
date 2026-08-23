-- jwt_rol() leía el rol directamente del token de sesión (auth.jwt()->>'rol'),
-- que Supabase solo actualiza cuando la persona vuelve a iniciar sesión. Si
-- alguien cambiaba de rol (o se lo devolvían, como pasó acá tras una prueba),
-- la sesión ya abierta seguía "viendo" el rol viejo hasta cerrar sesión y
-- volver a entrar — y mientras tanto cualquier alta/edición protegida por rol
-- (subir el logo, crear pacientes, etc.) fallaba con "row-level security
-- policy" aunque la base de datos ya tuviera el rol correcto. es_admin() y el
-- resto de las funciones de permisos están construidas sobre jwt_rol(), así
-- que corrigiendo acá se arreglan todas: ahora leen el rol en vivo desde
-- public.users en cada verificación, no una foto vieja del token.
create or replace function public.jwt_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select rol from public.users where id = auth.uid()), '')
$$;
