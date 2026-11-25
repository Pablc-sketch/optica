create table public.chequeos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 100),
  desde date not null,
  hasta date not null check (hasta >= desde),
  ahorro_pct numeric not null default 20 check (ahorro_pct between 0 and 100),
  creado_en timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, nombre, desde, hasta)
);

alter table public.chequeos enable row level security;
grant select, insert, update on public.chequeos to authenticated;

create policy chequeos_lectura on public.chequeos for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.jwt_rol()) in ('admin','clinico','ventas'));
create policy chequeos_creacion on public.chequeos for insert to authenticated
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.jwt_rol()) = 'admin' and (select public.suscripcion_vigente()));
create policy chequeos_edicion on public.chequeos for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.jwt_rol()) = 'admin' and (select public.suscripcion_vigente()))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.jwt_rol()) = 'admin' and (select public.suscripcion_vigente()));

alter table public.operativos add column chequeo_id uuid,
  add foreign key (tenant_id, chequeo_id) references public.chequeos(tenant_id, id);
alter table public.gastos_globales add column chequeo_id uuid,
  add foreign key (tenant_id, chequeo_id) references public.chequeos(tenant_id, id),
  add check (chequeo_id is null or operativo_id is null);
create index operativos_chequeo_idx on public.operativos (tenant_id, chequeo_id) where chequeo_id is not null;
create index gastos_chequeo_idx on public.gastos_globales (tenant_id, chequeo_id) where chequeo_id is not null;

create function public.proteger_asignacion_chequeo() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user = 'authenticated' and public.jwt_rol() is distinct from 'admin' then
    if (tg_op = 'INSERT' and new.chequeo_id is not null)
      or (tg_op = 'UPDATE' and new.chequeo_id is distinct from old.chequeo_id) then
      raise exception 'Solo el administrador puede asignar chequeos.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_asignacion_chequeo() from public, anon;
create trigger operativo_proteger_chequeo before insert or update of chequeo_id on public.operativos
for each row execute function public.proteger_asignacion_chequeo();
create trigger gasto_proteger_chequeo before insert or update of chequeo_id on public.gastos_globales
for each row execute function public.proteger_asignacion_chequeo();

create function public.guardar_chequeo(
  p_id uuid, p_nombre text, p_desde date, p_hasta date, p_ahorro numeric, p_sedes uuid[]
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_id uuid := p_id;
begin
  if v_tenant is null or public.jwt_rol() is distinct from 'admin' or public.suscripcion_vigente() is distinct from true then
    raise exception 'Solo el administrador puede editar chequeos.' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('chequeos:' || v_tenant::text, 0));
  if p_sedes is null or cardinality(p_sedes) > 300 or exists (
    select 1 from unnest(p_sedes) as elegida(id)
    left join public.operativos o on o.id = elegida.id and o.tenant_id = v_tenant
    where o.id is null or o.fecha < p_desde or coalesce(o.fecha_fin,o.fecha) > p_hasta
      or o.chequeo_id is not null and o.chequeo_id is distinct from v_id
  ) then
    raise exception 'Hay sedes fuera de las fechas o que ya pertenecen a otro chequeo.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.chequeos(tenant_id,nombre,desde,hasta,ahorro_pct)
    values(v_tenant,btrim(p_nombre),p_desde,p_hasta,p_ahorro) returning id into v_id;
  else
    update public.chequeos set nombre=btrim(p_nombre), desde=p_desde, hasta=p_hasta, ahorro_pct=p_ahorro
    where tenant_id=v_tenant and id=v_id;
    if not found then raise exception 'Chequeo no disponible.' using errcode = '22023'; end if;
  end if;

  update public.operativos set chequeo_id=null
  where tenant_id=v_tenant and chequeo_id=v_id and not (id = any(p_sedes));
  update public.operativos set chequeo_id=v_id
  where tenant_id=v_tenant and id=any(p_sedes) and chequeo_id is distinct from v_id;
  return v_id;
end;
$$;
revoke all on function public.guardar_chequeo(uuid,text,date,date,numeric,uuid[]) from public, anon;
grant execute on function public.guardar_chequeo(uuid,text,date,date,numeric,uuid[]) to authenticated;
