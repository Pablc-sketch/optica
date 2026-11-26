create table public.avisos_medicion_altura (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  venta_id uuid not null references public.ventas(id) on delete cascade,
  ot_id uuid not null references public.ordenes_trabajo(id) on delete cascade,
  par smallint not null check (par in (1, 2)),
  destinatario_id uuid references public.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  tomada_en timestamptz,
  tomada_por uuid references public.users(id) on delete set null,
  unique (ot_id, par)
);
create index avisos_medicion_altura_pendientes on public.avisos_medicion_altura(tenant_id, creado_en desc)
  where tomada_en is null;
create index avisos_medicion_altura_venta on public.avisos_medicion_altura(tenant_id, venta_id);
alter table public.avisos_medicion_altura enable row level security;
revoke all on public.avisos_medicion_altura from public, anon, authenticated;
grant select on public.avisos_medicion_altura to authenticated;
grant update(tomada_en, tomada_por) on public.avisos_medicion_altura to authenticated;

create policy avisos_altura_lectura on public.avisos_medicion_altura
  for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id())
    and (select public.jwt_rol()) in ('admin','clinico')
    and (destinatario_id is null or destinatario_id = (select auth.uid())));

create policy avisos_altura_confirmacion on public.avisos_medicion_altura
  for update to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.puede_editar_clinico())
    and tomada_en is null and (destinatario_id is null or destinatario_id = (select auth.uid())))
  with check (tenant_id = (select public.jwt_tenant_id()) and (select public.puede_editar_clinico())
    and tomada_en is not null and tomada_por = (select auth.uid())
    and (destinatario_id is null or destinatario_id = (select auth.uid())));

create schema if not exists alertas_privadas;
revoke all on schema alertas_privadas from public, anon, authenticated;
create function alertas_privadas.crear_aviso_altura()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.avisos_medicion_altura (tenant_id, venta_id, ot_id, par, destinatario_id)
  select ot.tenant_id, v.id, ot.id, lente.par, u.id
  from public.ordenes_trabajo ot
  join public.ventas v on v.id = new.venta_id and v.tenant_id = ot.tenant_id and not v.anulada
  left join public.recetas r on r.id = ot.receta_id and r.tenant_id = ot.tenant_id
  left join public.users u on u.id = r.profesional_id and u.tenant_id = ot.tenant_id
    and u.estado = 'activo' and u.rol in ('admin','clinico')
  cross join lateral (values (1, ot.tipo_lente), (2, ot.tipo_lente_2)) lente(par,tipo)
  where ot.id = new.ot_id and ot.tenant_id = new.tenant_id and ot.estado not in ('cancelado','entregado')
    and (new.cristal_slot is null or new.cristal_slot = lente.par)
    and lower(btrim(lente.tipo)) in ('bifocal','multifocal')
  on conflict (ot_id, par) do nothing;
  return new;
end;
$$;
revoke execute on function alertas_privadas.crear_aviso_altura() from public, anon, authenticated;
create trigger venta_item_aviso_altura
  after insert on public.venta_items for each row when (new.ot_id is not null)
  execute function alertas_privadas.crear_aviso_altura();

do $$
begin
  if exists (select from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.avisos_medicion_altura;
  end if;
end $$;

create table public.dispositivos_avisos_altura (
  huella text primary key check (huella ~ '^[0-9a-f]{64}$'),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  usuario_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null check (char_length(endpoint) between 1 and 2048),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{22}$')
);
create index dispositivos_avisos_altura_usuario on public.dispositivos_avisos_altura(tenant_id, usuario_id);
alter table public.dispositivos_avisos_altura enable row level security;
revoke all on public.dispositivos_avisos_altura from public, anon, authenticated;
grant select, insert, update, delete on public.dispositivos_avisos_altura to authenticated;

create policy avisos_altura_dispositivo_propio on public.dispositivos_avisos_altura
  for all to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and usuario_id = (select auth.uid()))
  with check (tenant_id = (select public.jwt_tenant_id()) and usuario_id = (select auth.uid())
    and (select public.puede_editar_clinico()));
