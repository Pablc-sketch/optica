alter table public.operativos
  add column agenda_confirmado boolean not null default false;

create table public.agenda_bloques (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tipo text not null check (tipo in ('externo', 'disponible')),
  nombre text,
  optica text,
  direccion text,
  notas text,
  fecha date not null,
  fecha_fin date,
  hora_inicio time not null,
  hora_fin time not null,
  estado text not null default 'confirmado' check (estado in ('pendiente', 'confirmado', 'cancelado')),
  check (fecha_fin is null or fecha_fin - fecha between 0 and 365),
  check (hora_inicio < hora_fin),
  check (
    (tipo = 'disponible' and fecha_fin is null and estado = 'confirmado')
    or (tipo = 'externo' and nullif(btrim(nombre), '') is not null and nullif(btrim(optica), '') is not null)
  )
);

create index agenda_bloques_tenant_fecha_idx on public.agenda_bloques (tenant_id, fecha);
alter table public.agenda_bloques enable row level security;
revoke all on public.agenda_bloques from public, anon, authenticated;
grant select, insert, update, delete on public.agenda_bloques to authenticated, service_role;

create policy agenda_bloques_lectura on public.agenda_bloques
  for select to authenticated using (tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()));
create policy agenda_bloques_alta on public.agenda_bloques
  for insert to authenticated with check (
    tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()) and (select public.suscripcion_vigente())
  );
create policy agenda_bloques_edicion on public.agenda_bloques
  for update to authenticated using (
    tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()) and (select public.suscripcion_vigente())
  ) with check (
    tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()) and (select public.suscripcion_vigente())
  );
create policy agenda_bloques_borrado on public.agenda_bloques
  for delete to authenticated using (
    tenant_id = (select public.jwt_tenant_id()) and (select public.es_admin()) and (select public.suscripcion_vigente())
  );

create schema agenda_interna;
revoke all on schema agenda_interna from public, anon, authenticated;

-- El trigger debe detectar también los compromisos externos cuando un
-- escritor de operativos propios no tiene acceso al detalle de la agenda.
create function agenda_interna.verificar_cruce()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  es_propio boolean := tg_table_name = 'operativos';
  tipo_bloque text := 'externo';
  termino date := greatest(new.fecha, new.fecha_fin);
  desde time := new.hora_inicio;
  hasta time := new.hora_fin;
begin
  -- RLS rechaza la escritura. No leer horarios de otra óptica desde el trigger.
  if auth.uid() is not null and new.tenant_id is distinct from public.jwt_tenant_id() then
    return new;
  end if;
  if not es_propio then
    tipo_bloque := new.tipo;
  end if;
  if new.estado = 'cancelado' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.tenant_id is not distinct from old.tenant_id
      and new.fecha is not distinct from old.fecha
      and new.fecha_fin is not distinct from old.fecha_fin
      and new.hora_inicio is not distinct from old.hora_inicio
      and new.hora_fin is not distinct from old.hora_fin
      and old.estado <> 'cancelado' then
      if es_propio then
        return new;
      elsif new.tipo = old.tipo then
        return new;
      end if;
    end if;
  end if;

  -- Ambas tablas toman el mismo bloqueo antes de leer los horarios.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lentia.agenda.' || new.tenant_id::text, 0));

  if desde is null or hasta is null or desde >= hasta then
    desde := time '00:00';
    hasta := time '24:00';
  end if;

  if exists (
    select 1 from public.agenda_bloques b
    where b.tenant_id = new.tenant_id and (es_propio or b.id <> new.id)
      and b.tipo = tipo_bloque and b.estado <> 'cancelado'
      and b.fecha <= termino and coalesce(b.fecha_fin, b.fecha) >= new.fecha
      and b.hora_inicio < hasta and b.hora_fin > desde
  ) or (tipo_bloque = 'externo' and exists (
    select 1 from public.operativos o
    where o.tenant_id = new.tenant_id and (not es_propio or o.id <> new.id)
      and o.estado <> 'cancelado'
      and o.fecha <= termino and greatest(o.fecha_fin, o.fecha) >= new.fecha
      and (
        o.hora_inicio is null or o.hora_fin is null or o.hora_inicio >= o.hora_fin
        or (o.hora_inicio < hasta and o.hora_fin > desde)
      )
  )) then
    raise exception 'Cruce de horario en la agenda' using errcode = '23P01';
  end if;

  return new;
end;
$$;
revoke execute on function agenda_interna.verificar_cruce() from public, anon, authenticated;

create trigger agenda_verificar_cruce
  before insert or update of tenant_id, fecha, fecha_fin, hora_inicio, hora_fin, estado
  on public.operativos for each row execute function agenda_interna.verificar_cruce();
create trigger agenda_verificar_cruce
  before insert or update of tenant_id, tipo, fecha, fecha_fin, hora_inicio, hora_fin, estado
  on public.agenda_bloques for each row execute function agenda_interna.verificar_cruce();
