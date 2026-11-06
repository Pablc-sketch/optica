-- Los registros de la agenda se comparan por días completos. Las horas
-- históricas se conservan, pero solo los operativos propios usan horarios.
alter table public.agenda_bloques
  alter column hora_inicio drop not null,
  alter column hora_fin drop not null,
  drop constraint agenda_bloques_check2,
  add constraint agenda_bloques_detalles_check check (
    (tipo = 'disponible' and estado = 'confirmado')
    or (tipo = 'externo' and nullif(btrim(nombre), '') is not null and nullif(btrim(optica), '') is not null)
  );

create or replace function agenda_interna.verificar_cruce()
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
      and termino = greatest(old.fecha, old.fecha_fin)
      and old.estado <> 'cancelado' then
      if es_propio then
        if new.hora_inicio is not distinct from old.hora_inicio and new.hora_fin is not distinct from old.hora_fin then
          return new;
        end if;
      elsif new.tipo = old.tipo then
        return new;
      end if;
    end if;
  end if;

  -- Ambas tablas toman el mismo bloqueo antes de leer los horarios.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lentia.agenda.' || new.tenant_id::text, 0));

  if not es_propio or desde is null or hasta is null or desde >= hasta then
    desde := time '00:00';
    hasta := time '24:00';
  end if;

  if exists (
    select 1 from public.agenda_bloques b
    where b.tenant_id = new.tenant_id and (es_propio or b.id <> new.id)
      and b.tipo = tipo_bloque and b.estado <> 'cancelado'
      and b.fecha <= termino and coalesce(b.fecha_fin, b.fecha) >= new.fecha
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
    raise exception 'Cruce en la agenda' using errcode = '23P01';
  end if;

  return new;
end;
$$;
