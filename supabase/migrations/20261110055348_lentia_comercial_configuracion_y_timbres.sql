-- Recuperación de la implementación comercial revisada en esta conversación.
-- Los tenants existentes conservan su edición y sus datos; nuevas altas parten limpias.
alter table public.tenants add column modelo_operacion text not null default 'personalizado' check(modelo_operacion in('personalizado','comercial'));
alter table public.tenants alter column modelo_operacion set default 'comercial';
alter table public.tenants add column precio_consulta bigint check(precio_consulta between 0 and 999999999);
create function public.es_modelo_comercial() returns boolean language sql stable security invoker set search_path='' as $$
select coalesce((select modelo_operacion='comercial' from public.tenants where id=public.jwt_tenant_id()),false) $$;
revoke all on function public.es_modelo_comercial() from public,anon;
grant execute on function public.es_modelo_comercial() to authenticated;
create function public.proteger_modelo_operacion() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is not null and new.modelo_operacion is distinct from old.modelo_operacion then raise exception 'La edición se administra durante la incorporación de la óptica.' using errcode='42501';end if;
 return new;
end $$;
revoke all on function public.proteger_modelo_operacion() from public,anon;
create trigger proteger_modelo_operacion before update on public.tenants for each row execute function public.proteger_modelo_operacion();

alter table public.costos_cristales add column catalogo_propio boolean not null default false;
alter table public.costos_cristales add column proveedor_id uuid references public.proveedores(id);
alter table public.costos_cristales add column tarifa_config jsonb;
create function public.validar_catalogo_propio() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.tenants where id=new.tenant_id and modelo_operacion='comercial') then
  new.catalogo_propio:=true;
  if new.proveedor_id is null or not exists(select 1 from public.proveedores where id=new.proveedor_id and tenant_id=new.tenant_id and tipo='laboratorio') then raise exception 'Elige un laboratorio de esta óptica.' using errcode='23514';end if;
 end if;return new;
end $$;
revoke all on function public.validar_catalogo_propio() from public,anon;
create trigger validar_catalogo_propio before insert or update on public.costos_cristales for each row execute function public.validar_catalogo_propio();

-- Costos históricos: un marco comercial se cuenta como producto, sin $5.000 implícitos.
alter table public.venta_items add column costo_producto_snapshot bigint;
alter table public.venta_items add column costo_marco_snapshot bigint;
create function public.fijar_costos_comerciales() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.tenants where id=new.tenant_id and modelo_operacion='comercial') then
  if tg_op='UPDATE' and new.producto_id is not distinct from old.producto_id then new.costo_producto_snapshot:=old.costo_producto_snapshot;
  elsif new.producto_id is not null then
   select costo into new.costo_producto_snapshot from public.productos where id=new.producto_id and tenant_id=new.tenant_id;
   if not found then raise exception 'Producto no disponible.' using errcode='23514';end if;
  else new.costo_producto_snapshot:=null;end if;
  new.costo_marco_snapshot:=0;
 else new.costo_producto_snapshot:=null;new.costo_marco_snapshot:=null;end if;
 return new;
end $$;
revoke all on function public.fijar_costos_comerciales() from public,anon;
create trigger fijar_costos_comerciales before insert or update on public.venta_items for each row execute function public.fijar_costos_comerciales();

-- El personal puede registrarse sin una cuenta de acceso.
alter table public.agenda_recursos add column activo boolean not null default true;
alter table public.agenda_recursos add column usuario_id uuid references public.users(id);
alter table public.agenda_recursos add column rut text;
alter table public.agenda_recursos add column titulo_profesional text;
alter table public.agenda_recursos add column registro_profesional text;
create unique index agenda_tecnologo_usuario on public.agenda_recursos(tenant_id,usuario_id) where tipo='tecnologo' and usuario_id is not null;
create unique index agenda_persona_rut on public.agenda_recursos(tenant_id,lower(regexp_replace(rut,'[^0-9kK]','','g'))) where tipo<>'kit' and nullif(btrim(rut),'') is not null;
grant insert(activo,usuario_id,rut,titulo_profesional,registro_profesional),update(activo,usuario_id,rut,titulo_profesional,registro_profesional) on public.agenda_recursos to authenticated;
create policy agenda_profesionales_clinico on public.agenda_recursos for select to authenticated using(tenant_id=(select public.jwt_tenant_id()) and tipo='tecnologo' and (select public.jwt_rol())='clinico');
create function public.validar_personal_terreno() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.usuario_id is not null and not exists(select 1 from public.users where id=new.usuario_id and tenant_id=new.tenant_id) then raise exception 'La cuenta pertenece a otra óptica.' using errcode='23514';end if;
 return new;
end $$;
revoke all on function public.validar_personal_terreno() from public,anon;
create trigger validar_personal_terreno before insert or update on public.agenda_recursos for each row execute function public.validar_personal_terreno();

alter table public.recetas add column tecnologo_recurso_id uuid references public.agenda_recursos(id);
alter table public.recetas add column profesional_snapshot jsonb;
update public.recetas r set profesional_snapshot=jsonb_build_object('nombre',u.nombre,'rut',u.rut,'titulo_profesional',u.titulo_profesional,'registro_profesional',u.registro_profesional) from public.users u where u.id=r.profesional_id and u.tenant_id=r.tenant_id;
create function public.fijar_profesional_receta() returns trigger language plpgsql security invoker set search_path='' as $$
declare profesional record;begin
 if tg_op='INSERT' and new.profesional_id is null then new.profesional_id:=auth.uid();end if;
 if new.profesional_id is null and new.tecnologo_recurso_id is null and not exists(select 1 from public.tenants where id=new.tenant_id and modelo_operacion='comercial') then new.profesional_snapshot:=null;return new;end if;
 if tg_op='UPDATE' and new.profesional_id is not distinct from old.profesional_id and new.tecnologo_recurso_id is not distinct from old.tecnologo_recurso_id then new.profesional_snapshot:=old.profesional_snapshot;return new;end if;
 if tg_op='UPDATE' and auth.uid() is not null and public.jwt_rol()<>'admin' then raise exception 'Solo administración puede corregir el profesional de una receta guardada.' using errcode='42501';end if;
 if new.tecnologo_recurso_id is not null then
  select nombre,rut,titulo_profesional,registro_profesional,usuario_id into profesional from public.agenda_recursos where id=new.tecnologo_recurso_id and tenant_id=new.tenant_id and tipo='tecnologo' and activo;
  if not found or nullif(btrim(profesional.titulo_profesional),'') is null or nullif(btrim(profesional.rut),'') is null then raise exception 'Completa nombre, RUT y título del tecnólogo seleccionado.' using errcode='23514';end if;
  if auth.uid() is not null and public.jwt_rol()<>'admin' and profesional.usuario_id is distinct from auth.uid() then raise exception 'Solo puedes emitir recetas con tu propio perfil profesional.' using errcode='42501';end if;
 else
  if auth.uid() is not null and new.profesional_id is distinct from auth.uid() and public.jwt_rol()<>'admin' then raise exception 'El profesional no corresponde a tu sesión.' using errcode='42501';end if;
  select nombre,rut,titulo_profesional,registro_profesional into profesional from public.users where id=new.profesional_id and tenant_id=new.tenant_id;
  if not found then raise exception 'Profesional no disponible en esta óptica.' using errcode='23514';end if;
  if exists(select 1 from public.tenants where id=new.tenant_id and modelo_operacion='comercial') and (nullif(btrim(profesional.titulo_profesional),'') is null or nullif(btrim(profesional.rut),'') is null) then raise exception 'Selecciona un tecnólogo o completa tu perfil profesional.' using errcode='23514';end if;
 end if;
 new.profesional_snapshot:=jsonb_build_object('nombre',profesional.nombre,'rut',profesional.rut,'titulo_profesional',profesional.titulo_profesional,'registro_profesional',profesional.registro_profesional);
 return new;
end $$;
revoke all on function public.fijar_profesional_receta() from public,anon;
create trigger fijar_profesional_receta before insert or update on public.recetas for each row execute function public.fijar_profesional_receta();

create table public.receta_autoria_cambios(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.tenants(id),receta_id uuid not null references public.recetas(id) on delete cascade,actor_id uuid references public.users(id),antes jsonb,despues jsonb,created_at timestamptz not null default now());
alter table public.receta_autoria_cambios enable row level security;
revoke all on public.receta_autoria_cambios from public,anon,authenticated;
grant select on public.receta_autoria_cambios to authenticated;grant all on public.receta_autoria_cambios to service_role;
create policy autoria_leer on public.receta_autoria_cambios for select to authenticated using(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin');
create function agenda_privada.auditar_autoria() returns trigger language plpgsql security definer set search_path='' as $$begin
 if old.profesional_snapshot is distinct from new.profesional_snapshot then insert into public.receta_autoria_cambios(tenant_id,receta_id,actor_id,antes,despues) values(new.tenant_id,new.id,auth.uid(),old.profesional_snapshot,new.profesional_snapshot);end if;return new;end $$;
revoke all on function agenda_privada.auditar_autoria() from public,anon,authenticated;
create trigger auditar_autoria after update on public.recetas for each row execute function agenda_privada.auditar_autoria();
create function public.operativo_sin_reparto_personalizado() returns trigger language plpgsql security invoker set search_path='' as $$begin
 if exists(select 1 from public.tenants where id=new.tenant_id and modelo_operacion='comercial') then new.comision_vendedora_pct:=0;new.ahorro_pct:=0;end if;return new;end $$;
revoke all on function public.operativo_sin_reparto_personalizado() from public,anon;
create trigger operativo_sin_reparto_personalizado before insert or update on public.operativos for each row execute function public.operativo_sin_reparto_personalizado();
create index recetas_tecnologo_optica on public.recetas(tenant_id,tecnologo_recurso_id);
create index costos_cristales_proveedor on public.costos_cristales(tenant_id,proveedor_id);
create index receta_autoria_optica on public.receta_autoria_cambios(tenant_id,receta_id);

create or replace function public.crear_optica(
  p_nombre_comercial text, p_rut_empresa text default null, p_nombre_usuario text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_tenant_id uuid;
begin
  if v_uid is null then
    raise exception 'Se requiere una sesión iniciada para registrar una óptica';
  end if;
  -- Un usuario pertenece a una sola óptica.
  if exists (select 1 from public.users where id = v_uid) then
    raise exception 'Este usuario ya pertenece a una óptica';
  end if;
  if coalesce(trim(p_nombre_comercial), '') = '' then
    raise exception 'El nombre de la óptica es obligatorio';
  end if;

  select email into v_email from auth.users where id = v_uid;

  insert into public.tenants (nombre_comercial, rut_empresa, plan, estado_suscripcion)
  values (trim(p_nombre_comercial), nullif(trim(p_rut_empresa), ''), 'trial', 'activa')
  returning id into v_tenant_id;

  insert into public.users (id, tenant_id, nombre, email, rol)
  values (v_uid, v_tenant_id, coalesce(nullif(trim(p_nombre_usuario), ''), v_email), v_email, 'admin');

  insert into public.sucursales (tenant_id, nombre) values (v_tenant_id, 'Casa Matriz');

  insert into public.suscripciones (tenant_id, plan, estado, fecha_renovacion)
  values (v_tenant_id, 'trial', 'trial', (now() at time zone 'America/Santiago')::date + 30);

  -- La nueva óptica configura sus tarifas, sin copiar precios ajenos.
  return v_tenant_id;
end;
$$;


create or replace function public.copiar_plantilla_costos()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_n integer;
begin
  if v_tenant is null or public.jwt_rol() <> 'admin' then
    raise exception 'Solo el administrador de la óptica puede cargar la plantilla de precios' using errcode = '42501';
  end if;
  if exists(select 1 from public.tenants where id=v_tenant and modelo_operacion='comercial') then raise exception 'Configura tu catálogo propio en Precios.' using errcode='23514';end if;
  insert into public.costos_cristales (
    tenant_id, tipo_lente, rango_receta, tratamiento, costo, precio_venta,
    material_stock, material_laboratorio, diseno_laboratorio, montaje_material)
  select v_tenant, p.tipo_lente, p.rango_receta, p.tratamiento, p.costo,
         p.costo * coalesce((select t.factor_venta_cristales from public.tenants t where t.id = v_tenant), 6),
         p.material_stock, p.material_laboratorio, p.diseno_laboratorio, p.montaje_material
    from public.plantilla_costos_cristales p
  on conflict (tenant_id, tipo_lente, rango_receta, tratamiento) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
