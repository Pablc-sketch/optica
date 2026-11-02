-- Archivo de operaciones verificadas contra Mercado Pago. Nunca inserta abonos.
create table public.mercadopago_pagos (
  tenant_id uuid not null references public.tenants(id),
  pago_id text not null check (pago_id ~ '^[0-9]{1,30}$'),
  collector_id text not null,
  fecha timestamptz not null,
  actualizado_en_proveedor timestamptz not null,
  monto bigint not null check (monto > 0),
  monto_devuelto bigint not null default 0 check (monto_devuelto >= 0),
  estado text not null,
  medio_pago text check (medio_pago in ('debito','credito')),
  guardado_en timestamptz not null default now(),
  primary key (tenant_id, pago_id)
);
create index mercadopago_pagos_fecha on public.mercadopago_pagos(tenant_id, fecha desc);
create index pagos_abonos_voucher_busqueda on public.pagos_abonos(tenant_id, numero_voucher);

create table public.mercadopago_sync (
  tenant_id uuid primary key references public.tenants(id),
  collector_id text,
  ultima_correcta timestamptz,
  ultimo_intento timestamptz,
  estado text not null default 'pendiente' check (estado in ('pendiente','sincronizando','correcto','error')),
  run_id uuid,
  bloqueado_hasta timestamptz
);
alter table public.mercadopago_pagos enable row level security;
alter table public.mercadopago_sync enable row level security;
revoke all on public.mercadopago_pagos, public.mercadopago_sync from anon, authenticated;
grant select on public.mercadopago_pagos, public.mercadopago_sync to authenticated;
grant all on public.mercadopago_pagos, public.mercadopago_sync to service_role;
create policy mercadopago_pagos_lectura on public.mercadopago_pagos for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.puede_ver_clinico()));
create policy mercadopago_sync_lectura on public.mercadopago_sync for select to authenticated
  using (tenant_id = (select public.jwt_tenant_id()) and (select public.jwt_rol()) = 'admin');

-- Relación calculada con las filas actuales: corregir, borrar o duplicar un
-- voucher invalida la coincidencia inmediatamente, sin mover dinero ni triggers
-- privilegiados. Nunca se busca un paciente por nombre, importe o fecha.
create view public.mercadopago_conciliacion with (security_invoker = true) as
select m.*, a.id as abono_id, a.venta_id, v.paciente_id, p.nombre as paciente_nombre,
  case
    when c.cantidad = 0 then 'sin_abono'
    when c.cantidad > 1 then 'voucher_repetido'
    when v.anulada then 'venta_anulada'
    when m.estado <> 'approved' or m.monto_devuelto > 0 then 'revisar_pago'
    when m.monto <> a.monto or m.medio_pago is null or m.medio_pago is distinct from a.medio_pago then 'diferencia'
    else 'vinculado'
  end as conciliacion
from public.mercadopago_pagos m
cross join lateral (
  select count(*) as cantidad, (array_agg(b.id order by b.id))[1] as id
  from public.pagos_abonos b
  where b.tenant_id = m.tenant_id and b.numero_voucher = m.pago_id
) c
left join public.pagos_abonos a on c.cantidad = 1 and a.id = c.id and a.tenant_id = m.tenant_id
left join public.ventas v on v.id = a.venta_id and v.tenant_id = m.tenant_id
left join public.pacientes p on p.id = v.paciente_id and p.tenant_id = m.tenant_id;
revoke all on public.mercadopago_conciliacion from anon, authenticated;
grant select on public.mercadopago_conciliacion to authenticated, service_role;

-- Arrendamiento de ejecución: solicitudes concurrentes/reintentos no pisan
-- snapshots. Solo el servidor puede escribir datos del proveedor o checkpoints.
create function public.mercadopago_iniciar_sync(p_tenant uuid, p_run uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.mercadopago_sync(tenant_id) values(p_tenant) on conflict do nothing;
  update public.mercadopago_sync
    set run_id = p_run, bloqueado_hasta = now() + interval '5 minutes', ultimo_intento = now(), estado = 'sincronizando'
    where tenant_id = p_tenant and (bloqueado_hasta is null or bloqueado_hasta < now());
  return found;
end;
$$;
create function public.mercadopago_finalizar_sync(p_tenant uuid, p_run uuid, p_collector text, p_hasta timestamptz)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.mercadopago_sync set
    collector_id = coalesce(collector_id, p_collector),
    ultima_correcta = coalesce(p_hasta, ultima_correcta),
    estado = case when p_hasta is null then 'error' else 'correcto' end,
    run_id = null, bloqueado_hasta = null
    where tenant_id = p_tenant and run_id = p_run;
  return found;
end;
$$;
revoke all on function public.mercadopago_iniciar_sync(uuid,uuid) from public, anon, authenticated;
revoke all on function public.mercadopago_finalizar_sync(uuid,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.mercadopago_iniciar_sync(uuid,uuid) to service_role;
grant execute on function public.mercadopago_finalizar_sync(uuid,uuid,text,timestamptz) to service_role;
notify pgrst, 'reload schema';
