-- Controles de escritura y bitácora de cobros. Sin modificar filas históricas.
create schema cobranza_interna;
revoke all on schema cobranza_interna from public, anon, authenticated;
grant usage on schema cobranza_interna to authenticated;

create table public.cobranza_historial (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id),
  venta_id uuid not null,
  abono_id uuid,
  usuario_id uuid,
  accion text not null check (accion in ('INSERT','UPDATE','DELETE')),
  antes jsonb,
  despues jsonb,
  creado_en timestamptz not null default clock_timestamp()
);
create index cobranza_historial_venta on public.cobranza_historial(tenant_id, venta_id, id);
alter table public.cobranza_historial enable row level security;
revoke all on public.cobranza_historial from public, anon, authenticated;
grant select on public.cobranza_historial to authenticated;
create policy cobranza_historial_leer on public.cobranza_historial for select to authenticated
  using (tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin');

create function cobranza_interna.auditar() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  anterior jsonb;
  posterior jsonb;
  datos jsonb;
  claves text[];
begin
  if tg_table_name='ventas' then
    claves := array['id','tenant_id','total','fecha','estado_pago','anulada','anulada_motivo',
      'boleta_fecha','boleta_folio','ocultar_voucher','fecha_documentos','reembolso_entidad','operativo_id'];
  else
    claves := array['id','tenant_id','venta_id','monto','fecha','medio_pago','numero_voucher'];
  end if;
  if tg_op<>'INSERT' then
    select jsonb_object_agg(key,value) into anterior from jsonb_each(to_jsonb(old)) where key=any(claves);
  end if;
  if tg_op<>'DELETE' then
    select jsonb_object_agg(key,value) into posterior from jsonb_each(to_jsonb(new)) where key=any(claves);
  end if;
  if anterior is not distinct from posterior then return null; end if;
  datos := coalesce(posterior,anterior);
  insert into public.cobranza_historial(tenant_id,venta_id,abono_id,usuario_id,accion,antes,despues)
  values ((datos->>'tenant_id')::uuid, coalesce(datos->>'venta_id',datos->>'id')::uuid,
    case when tg_table_name='pagos_abonos' then (datos->>'id')::uuid end, auth.uid(),tg_op,anterior,posterior);
  return null;
end;
$$;
revoke all on function cobranza_interna.auditar() from public,anon,authenticated;
create trigger historial_cobranza after update or delete on public.ventas
  for each row execute function cobranza_interna.auditar();
create trigger historial_cobranza after insert or update or delete on public.pagos_abonos
  for each row execute function cobranza_interna.auditar();

-- Las escrituras comerciales conservan sus RPC. Los campos monetarios
-- sensibles se cambian únicamente por funciones que validan la óptica.
revoke update on public.ventas, public.pagos_abonos from authenticated;
grant update (estado_pago,boleta_fecha,boleta_folio,ocultar_voucher,fecha_documentos,reembolso_entidad)
  on public.ventas to authenticated;
grant update (numero_voucher) on public.pagos_abonos to authenticated;
do $$
declare nombre text;
begin
  foreach nombre in array array['ventas','pagos_abonos','retiros_sueldo','gastos_globales','operativos'] loop
    execute format(
      'create policy borrado_financiero_admin on public.%I as restrictive for delete to authenticated using ((select public.jwt_rol()) = ''admin'')',
      nombre);
  end loop;
  foreach nombre in array array['retiros_sueldo','gastos_globales','operativos'] loop
    execute format(
      'create policy alta_financiera_admin on public.%I as restrictive for insert to authenticated with check ((select public.jwt_rol()) = ''admin'')',
      nombre);
    execute format(
      'create policy edicion_financiera_admin on public.%I as restrictive for update to authenticated using ((select public.jwt_rol()) = ''admin'') with check ((select public.jwt_rol()) = ''admin'')',
      nombre);
  end loop;
end;
$$;

create table public.devoluciones_venta (
  abono_id uuid primary key references public.pagos_abonos(id),
  tenant_id uuid not null references public.tenants(id),
  venta_id uuid not null references public.ventas(id),
  monto bigint not null check(monto>0),
  caja text not null check(caja in ('efectivo','digital')),
  creado_por uuid not null references public.users(id),
  creado_en timestamptz not null default clock_timestamp(),
  devuelto_en timestamptz,
  devuelto_por uuid references public.users(id),
  referencia text check(char_length(referencia) between 3 and 250)
);
create index devoluciones_venta_tenant on public.devoluciones_venta(tenant_id,venta_id);
alter table public.devoluciones_venta enable row level security;
revoke all on public.devoluciones_venta from public,anon,authenticated;
grant select on public.devoluciones_venta to authenticated;
create policy devoluciones_venta_leer on public.devoluciones_venta for select to authenticated
  using (tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin');

create function cobranza_interna.actualizar_venta(p_venta_id uuid, p_items jsonb, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_venta record;
  v_item jsonb;
  v_actual record;
  v_cantidad integer;
  v_precio bigint;
  v_descuento bigint;
  v_delta integer;
  v_sucursal uuid;
  v_total bigint;
  v_pagado bigint;
  v_antes jsonb;
begin
  if v_tenant is null or not public.puede_editar_ventas() then
    raise exception 'Sin permiso para editar ventas' using errcode = '42501';
  end if;

  select id, anulada, total into v_venta from public.ventas where id = p_venta_id and tenant_id = v_tenant for update;
  if not found then
    raise exception 'Venta no encontrada' using errcode = 'P0002';
  end if;
  if v_venta.anulada then
    raise exception 'Esta venta está anulada, no se puede editar' using errcode = '22023';
  end if;

  select jsonb_agg(jsonb_build_object('id', id, 'cantidad', cantidad, 'precio_unitario', precio_unitario, 'descuento', descuento))
    into v_antes from public.venta_items where venta_id = p_venta_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    select id, producto_id, cantidad, precio_unitario, descuento into v_actual
      from public.venta_items where id = (v_item ->> 'id')::uuid and venta_id = p_venta_id;
    if not found then
      raise exception 'El ítem % no es de esta venta', v_item ->> 'id' using errcode = '22023';
    end if;
    if (v_item ->> 'cantidad') !~ '^[0-9]+$' or (v_item ->> 'precio_unitario') !~ '^[0-9]+$'
       or (v_item ->> 'descuento') !~ '^[0-9]+$' then
      raise exception 'Valores inválidos en el ítem %', v_item ->> 'id' using errcode = '22023';
    end if;
    v_cantidad := (v_item ->> 'cantidad')::integer;
    v_precio := (v_item ->> 'precio_unitario')::bigint;
    v_descuento := (v_item ->> 'descuento')::bigint;
    if v_cantidad <= 0 then
      raise exception 'La cantidad tiene que ser al menos 1' using errcode = '22023';
    end if;
    if v_descuento > v_cantidad * v_precio then
      raise exception 'El descuento no puede superar el valor del ítem' using errcode = '22023';
    end if;

    update public.venta_items set cantidad = v_cantidad, precio_unitario = v_precio, descuento = v_descuento
     where id = v_actual.id;

    v_delta := v_cantidad - v_actual.cantidad;
    if v_actual.producto_id is not null and v_delta <> 0 then
      select sucursal_id into v_sucursal from public.movimientos_inventario
       where tenant_id = v_tenant and referencia = 'venta:' || p_venta_id and producto_id = v_actual.producto_id limit 1;
      if v_sucursal is not null then
        insert into public.movimientos_inventario (tenant_id, producto_id, sucursal_id, tipo, cantidad, referencia)
        values (v_tenant, v_actual.producto_id, v_sucursal,
                case when v_delta > 0 then 'salida' else 'entrada' end, abs(v_delta), 'edicion_venta:' || p_venta_id);
      end if;
      v_sucursal := null;
    end if;
  end loop;

  select coalesce(sum(cantidad * precio_unitario - descuento), 0) into v_total
    from public.venta_items where venta_id = p_venta_id;
  select coalesce(sum(monto), 0) into v_pagado from public.pagos_abonos where venta_id = p_venta_id;
  if v_total < v_pagado then
    raise exception 'El nuevo total (%) queda bajo lo que ya se pagó (%): eso es una devolución, no una edición', v_total, v_pagado
      using errcode = '22023';
  end if;

  update public.ventas
     set total = v_total,
         estado_pago = case when v_pagado >= v_total then 'pagada' when v_pagado > 0 then 'abono_parcial' else 'pendiente' end
   where id = p_venta_id;

  insert into public.ventas_cambios (tenant_id, venta_id, usuario_id, accion, motivo, antes, despues)
  values (v_tenant, p_venta_id, auth.uid(), 'edicion', nullif(trim(p_motivo), ''),
          jsonb_build_object('total', v_venta.total, 'items', v_antes),
          jsonb_build_object('total', v_total, 'items', p_items));

  return jsonb_build_object('ok', true, 'total', v_total);
end;
$$;

create function cobranza_interna.anular_venta(p_venta_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_venta record;
  v_mov record;
begin
  if v_tenant is null or public.jwt_rol() is distinct from 'admin' or public.suscripcion_vigente() is not true then
    raise exception 'Sin permiso para anular ventas' using errcode = '42501';
  end if;

  select id, anulada, total, estado_pago into v_venta from public.ventas where id = p_venta_id and tenant_id = v_tenant for update;
  if not found then
    raise exception 'Venta no encontrada' using errcode = 'P0002';
  end if;
  if v_venta.anulada then
    return jsonb_build_object('ok', true, 'repetida', true);
  end if;

  for v_mov in select * from public.stock_neto_de_venta(p_venta_id) where neto > 0 loop
    insert into public.movimientos_inventario (tenant_id, producto_id, sucursal_id, tipo, cantidad, referencia)
    values (v_tenant, v_mov.producto_id, v_mov.sucursal_id, 'entrada', v_mov.neto, 'anulacion_venta:' || p_venta_id);
  end loop;

  update public.ordenes_trabajo
     set estado = 'cancelado'
   where id in (select ot_id from public.venta_items where venta_id = p_venta_id and ot_id is not null)
     and estado <> 'entregado';

  update public.ventas set anulada = true, anulada_motivo = nullif(trim(p_motivo), '') where id = p_venta_id;

  insert into public.ventas_cambios (tenant_id, venta_id, usuario_id, accion, motivo, antes, despues)
  values (v_tenant, p_venta_id, auth.uid(), 'anulacion', nullif(trim(p_motivo), ''),
          jsonb_build_object('total', v_venta.total, 'estado_pago', v_venta.estado_pago), jsonb_build_object('anulada', true));

  insert into public.devoluciones_venta(abono_id, tenant_id, venta_id, monto, caja, creado_por)
    select p.id, p.tenant_id, p.venta_id, p.monto,
      case when p.medio_pago is null or p.medio_pago = 'efectivo' then 'efectivo' else 'digital' end, auth.uid()
    from public.pagos_abonos p where p.venta_id = p_venta_id and p.tenant_id = v_tenant and p.monto > 0
    on conflict (abono_id) do nothing;

  return jsonb_build_object('ok', true, 'repetida', false);
end;
$$;

create or replace function public.actualizar_venta(p_venta_id uuid,p_items jsonb,p_motivo text)
returns jsonb language sql security invoker set search_path='' as $$
  select cobranza_interna.actualizar_venta(p_venta_id,p_items,p_motivo);
$$;
create or replace function public.anular_venta(p_venta_id uuid,p_motivo text)
returns jsonb language sql security invoker set search_path='' as $$
  select cobranza_interna.anular_venta(p_venta_id,p_motivo);
$$;

create function cobranza_interna.confirmar_devolucion(p_abono uuid,p_referencia text)
returns void language plpgsql security definer set search_path='' as $$
declare
  t uuid := public.jwt_tenant_id();
  movimiento public.devoluciones_venta;
begin
  if t is null or public.jwt_rol() is distinct from 'admin' or public.suscripcion_vigente() is not true then
    raise exception 'Solo administración puede registrar la devolución' using errcode='42501';
  end if;
  if p_referencia is null or char_length(btrim(p_referencia)) not between 3 and 250 then
    raise exception 'Indica el comprobante o respaldo de la devolución' using errcode='22023';
  end if;
  select * into movimiento from public.devoluciones_venta where tenant_id=t and abono_id=p_abono for update;
  if not found then raise exception 'Devolución no disponible' using errcode='P0002'; end if;
  if movimiento.devuelto_en is not null then return; end if;
  update public.devoluciones_venta set devuelto_en=clock_timestamp(),devuelto_por=auth.uid(),
    referencia=btrim(p_referencia) where abono_id=p_abono and tenant_id=t;
end;
$$;
create function public.confirmar_devolucion_venta(p_abono uuid,p_referencia text)
returns void language sql security invoker set search_path='' as $$
  select cobranza_interna.confirmar_devolucion(p_abono,p_referencia);
$$;

create function cobranza_interna.corregir_documento(
  p_venta uuid,p_abono uuid,p_fecha timestamptz,p_monto bigint,p_medio text,
  p_voucher text,p_folio text,p_boleta date,p_ocultar boolean
)
returns void language plpgsql security definer set search_path='' as $$
declare
  t uuid := public.jwt_tenant_id();
  v public.ventas;
  a public.pagos_abonos;
  pagado bigint;
  monto_nuevo bigint;
  medio_nuevo text;
begin
  if t is null or public.jwt_rol() is distinct from 'admin' or public.suscripcion_vigente() is not true then
    raise exception 'Solo administración puede corregir fechas y abonos' using errcode='42501';
  end if;
  if p_fecha is null or (p_fecha at time zone 'America/Santiago')::date > (now() at time zone 'America/Santiago')::date then
    raise exception 'Revisa la fecha de la corrección' using errcode='22023';
  end if;
  select * into v from public.ventas where id=p_venta and tenant_id=t and not anulada for update;
  if not found then raise exception 'Venta no disponible' using errcode='P0002'; end if;
  if p_abono is null then
    if p_folio is not null and p_folio !~ '^[0-9]{1,20}$' then
      raise exception 'Folio inválido' using errcode='22023';
    end if;
    update public.ventas set fecha=p_fecha,boleta_folio=p_folio,boleta_fecha=p_boleta,ocultar_voucher=coalesce(p_ocultar,false)
      where id=v.id and tenant_id=t;
    return;
  end if;
  select * into a from public.pagos_abonos where id=p_abono and venta_id=v.id and tenant_id=t for update;
  if not found then raise exception 'Abono no disponible' using errcode='P0002'; end if;
  monto_nuevo := coalesce(p_monto,a.monto);
  medio_nuevo := case when p_monto is null then a.medio_pago else p_medio end;
  select coalesce(sum(monto),0) into pagado from public.pagos_abonos where venta_id=v.id and tenant_id=t;
  if p_monto is not null and (monto_nuevo<=0 or pagado-a.monto+monto_nuevo>v.total or medio_nuevo is null
    or medio_nuevo not in ('efectivo','debito','credito','transferencia')) then
    raise exception 'Revisa el monto, el medio y el saldo de la venta' using errcode='22023';
  end if;
  update public.pagos_abonos set fecha=p_fecha,numero_voucher=p_voucher,monto=monto_nuevo,medio_pago=medio_nuevo
    where id=a.id and tenant_id=t;
  if monto_nuevo is distinct from a.monto then
    pagado := pagado-a.monto+monto_nuevo;
    update public.ventas set estado_pago=case when pagado>=v.total then 'pagada' when pagado>0 then 'abono_parcial' else 'pendiente' end
      where id=v.id and tenant_id=t;
  end if;
end;
$$;
create function public.corregir_documento_venta(
  p_venta uuid,p_abono uuid,p_fecha timestamptz,p_monto bigint,p_medio text,
  p_voucher text,p_folio text,p_boleta date,p_ocultar boolean
)
returns void language sql security invoker set search_path='' as $$
  select cobranza_interna.corregir_documento(p_venta,p_abono,p_fecha,p_monto,p_medio,p_voucher,p_folio,p_boleta,p_ocultar);
$$;
revoke all on all functions in schema cobranza_interna from public,anon,authenticated,service_role;
grant execute on function cobranza_interna.actualizar_venta(uuid,jsonb,text),
  cobranza_interna.anular_venta(uuid,text),cobranza_interna.confirmar_devolucion(uuid,text),
  cobranza_interna.corregir_documento(uuid,uuid,timestamptz,bigint,text,text,text,date,boolean) to authenticated;
revoke all on function public.confirmar_devolucion_venta(uuid,text),
  public.corregir_documento_venta(uuid,uuid,timestamptz,bigint,text,text,text,date,boolean) from public,anon;
grant execute on function public.confirmar_devolucion_venta(uuid,text),
  public.corregir_documento_venta(uuid,uuid,timestamptz,bigint,text,text,text,date,boolean) to authenticated;

create or replace function public.caja_global()
returns table(entro_efectivo bigint, entro_digital bigint, entro_debito bigint, entro_credito bigint, salio_efectivo bigint, salio_digital bigint, gastos_operativo bigint)
language sql stable security invoker set search_path = '' as $$
  select
    coalesce((select sum(pa.monto) from public.pagos_abonos pa join public.ventas v on v.id=pa.venta_id and v.tenant_id=pa.tenant_id where pa.tenant_id=(select public.jwt_tenant_id()) and (not v.anulada or exists (
      select 1 from public.devoluciones_venta d where d.abono_id=pa.id and d.tenant_id=pa.tenant_id
    )) and (pa.medio_pago='efectivo' or pa.medio_pago is null)),0)::bigint,
    coalesce((select sum(pa.monto) from public.pagos_abonos pa join public.ventas v on v.id=pa.venta_id and v.tenant_id=pa.tenant_id where pa.tenant_id=(select public.jwt_tenant_id()) and (not v.anulada or exists (
      select 1 from public.devoluciones_venta d where d.abono_id=pa.id and d.tenant_id=pa.tenant_id
    )) and pa.medio_pago is not null and pa.medio_pago<>'efectivo'),0)::bigint,
    coalesce((select sum(pa.monto) from public.pagos_abonos pa join public.ventas v on v.id=pa.venta_id and v.tenant_id=pa.tenant_id where pa.tenant_id=(select public.jwt_tenant_id()) and (not v.anulada or exists (
      select 1 from public.devoluciones_venta d where d.abono_id=pa.id and d.tenant_id=pa.tenant_id
    )) and pa.medio_pago='debito'),0)::bigint,
    coalesce((select sum(pa.monto) from public.pagos_abonos pa join public.ventas v on v.id=pa.venta_id and v.tenant_id=pa.tenant_id where pa.tenant_id=(select public.jwt_tenant_id()) and (not v.anulada or exists (
      select 1 from public.devoluciones_venta d where d.abono_id=pa.id and d.tenant_id=pa.tenant_id
    )) and pa.medio_pago='credito'),0)::bigint,
    (coalesce((select sum(monto) from public.retiros_sueldo where tenant_id=(select public.jwt_tenant_id()) and caja='efectivo'),0) + coalesce((select sum(monto) from public.gastos_globales where tenant_id=(select public.jwt_tenant_id()) and caja='efectivo'),0)
      + coalesce((select sum(case when tipo='deposito' then monto when tipo='retiro' then -monto when caja='efectivo' then monto else 0 end) from public.caja_movimientos where tenant_id=(select public.jwt_tenant_id())),0)
      + coalesce((select sum(d.monto) from public.devoluciones_venta d
        where d.tenant_id=(select public.jwt_tenant_id()) and d.caja='efectivo' and d.devuelto_en is not null),0))::bigint,
    (coalesce((select sum(monto) from public.retiros_sueldo where tenant_id=(select public.jwt_tenant_id()) and caja='digital'),0) + coalesce((select sum(monto) from public.gastos_globales where tenant_id=(select public.jwt_tenant_id()) and caja='digital'),0)
      + coalesce((select sum(case when tipo='deposito' then -monto when tipo='retiro' then monto when caja='digital' then monto else 0 end) from public.caja_movimientos where tenant_id=(select public.jwt_tenant_id())),0)
      + coalesce((select sum(d.monto) from public.devoluciones_venta d
        where d.tenant_id=(select public.jwt_tenant_id()) and d.caja='digital' and d.devuelto_en is not null),0))::bigint,
    coalesce((select sum(costo_transporte+costo_arriendo+costo_viaticos+costo_otros+costo_ayudante+costo_equipos+coalesce(costo_hospedaje,0)+coalesce(costo_comida,0)+coalesce(costo_peajes,0)) from public.operativos where tenant_id=(select public.jwt_tenant_id()) and coalesce(fecha_fin,fecha)<=(now() at time zone 'America/Santiago')::date),0)::bigint;
$$;

-- Un pago nuevo conserva su ámbito aunque después cambie la agenda.
alter table public.retiros_sueldo
  add column chequeo_id uuid references public.chequeos(id),
  add column reparto_verificado boolean not null default false,
  add constraint retiro_un_solo_ambito check(operativo_id is null or chequeo_id is null);
create index retiros_sueldo_chequeo on public.retiros_sueldo(tenant_id,chequeo_id) where chequeo_id is not null;

create function cobranza_interna.proteger_retiro() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op<>'INSERT' and old.reparto_verificado then
    raise exception 'El pago confirmado queda en el historial. Registra una corrección aparte.' using errcode='23514';
  end if;
  if tg_op='DELETE' then return old; end if;
  if new.chequeo_id is not null and not exists (
    select 1 from public.chequeos c where c.id=new.chequeo_id and c.tenant_id=new.tenant_id
  ) then raise exception 'Chequeo de otra óptica o inexistente' using errcode='42501'; end if;
  if new.reparto_verificado and current_user in ('authenticated','anon') then
    raise exception 'Usa el registro de reparto verificado de Caja' using errcode='42501';
  end if;
  return new;
end;
$$;
create trigger proteger_retiro before insert or update or delete on public.retiros_sueldo
  for each row execute function cobranza_interna.proteger_retiro();
revoke all on function cobranza_interna.proteger_retiro() from public,anon,authenticated;

-- Serializa confirmaciones y obliga a recalcular si cambió una fuente de caja.
create table cobranza_interna.version_caja (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  version bigint not null
);
revoke all on cobranza_interna.version_caja from public,anon,authenticated;
create function cobranza_interna.avanzar_version_caja() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  datos jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  t uuid := (case when tg_table_name='tenants' then datos->>'id' else datos->>'tenant_id' end)::uuid;
begin
  if t is null then return null; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('caja:'||t::text,0));
  insert into cobranza_interna.version_caja values (t,1)
    on conflict (tenant_id) do update set version=cobranza_interna.version_caja.version+1;
  return null;
end;
$$;
revoke all on function cobranza_interna.avanzar_version_caja() from public,anon,authenticated;
do $$
declare nombre text;
begin
  foreach nombre in array array['ventas','pagos_abonos','venta_items','ordenes_trabajo','productos',
    'operativos','chequeos','gastos_globales','gastos_asignaciones','caja_movimientos','retiros_sueldo',
    'impuestos_mensuales','impuestos_pagos','caja_conteos','caja_saldos_confirmados','devoluciones_venta'] loop
    execute format('create trigger version_de_reparto after insert or update or delete on public.%I
      for each row execute function cobranza_interna.avanzar_version_caja()', nombre);
  end loop;
end;
$$;
create trigger version_de_reparto after update of comision_debito_pct,comision_credito_pct on public.tenants
  for each row execute function cobranza_interna.avanzar_version_caja();

create function cobranza_interna.leer_version_caja() returns text
language sql stable security definer set search_path='' as $$
  select case when (select public.jwt_rol())='admin'
    then coalesce((select version::text from cobranza_interna.version_caja where tenant_id=(select public.jwt_tenant_id())), '0')
    else null end;
$$;
create function public.version_caja_reparto() returns text
language sql stable security invoker set search_path='' as $$
  select cobranza_interna.leer_version_caja();
$$;
revoke all on function cobranza_interna.leer_version_caja(), public.version_caja_reparto() from public,anon;
grant execute on function cobranza_interna.leer_version_caja(), public.version_caja_reparto() to authenticated;

-- El importe lo valida la acción del servidor con el cálculo y los saldos
-- vigentes. Solo el backend de confianza puede escribir el pago verificado.
create function public.registrar_pago_reparto(
  p_tenant uuid,p_usuario uuid,p_id uuid,p_operativo uuid,p_chequeo uuid,
  p_version text,p_persona text,p_monto bigint,p_caja text
)
returns void language plpgsql security invoker set search_path='' as $$
declare
  v_version text;
  anterior public.retiros_sueldo;
  hoy date := (now() at time zone 'America/Santiago')::date;
begin
  if not exists (select 1 from public.users u where u.id=p_usuario and u.tenant_id=p_tenant
    and u.rol='admin' and u.estado='activo') then
    raise exception 'Pago sin autorización de la óptica' using errcode='42501';
  end if;
  if p_id is null or p_persona is null or p_persona not in ('isadora','ahorro','madre','pablo')
    or p_caja is null or p_caja not in ('efectivo','digital') or p_monto is null or p_monto<=0
    or (p_operativo is null)=(p_chequeo is null) then
    raise exception 'Revisa la persona, caja, monto y operativo' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('caja:'||p_tenant::text,0));
  select * into anterior from public.retiros_sueldo where id=p_id;
  if found then
    if anterior.tenant_id=p_tenant and anterior.reparto_verificado and anterior.persona=p_persona
      and anterior.monto=p_monto and anterior.caja=p_caja and anterior.operativo_id is not distinct from p_operativo
      and anterior.chequeo_id is not distinct from p_chequeo then return; end if;
    raise exception 'El identificador del pago ya se usó' using errcode='23505';
  end if;
  select version::text into v_version from cobranza_interna.version_caja where tenant_id=p_tenant;
  if coalesce(v_version,'0') is distinct from p_version then
    raise exception 'La caja cambió. Actualiza el reparto antes de registrar otro pago.' using errcode='40001';
  end if;
  if (p_operativo is not null and not exists (select 1 from public.operativos o
      where o.id=p_operativo and o.tenant_id=p_tenant and o.chequeo_id is null and o.estado<>'cancelado'))
    or (p_chequeo is not null and not exists (select 1 from public.chequeos c where c.id=p_chequeo and c.tenant_id=p_tenant)) then
    raise exception 'Comprueba el operativo o chequeo del pago' using errcode='42501';
  end if;
  insert into public.retiros_sueldo
    (id,tenant_id,persona,fecha,monto,medio_pago,caja,es_sueldo,motivo,operativo_id,chequeo_id,reparto_verificado,confirmado_en,confirmado_por)
  values (p_id,p_tenant,p_persona,hoy,p_monto,case when p_caja='digital' then 'transferencia' else 'efectivo' end,
    p_caja,true,'Pago de reparto desde Caja',p_operativo,p_chequeo,true,clock_timestamp(),p_usuario);
end;
$$;
grant usage on schema cobranza_interna to service_role;
grant select on cobranza_interna.version_caja to service_role;
revoke all on function public.registrar_pago_reparto(uuid,uuid,uuid,uuid,uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.registrar_pago_reparto(uuid,uuid,uuid,uuid,uuid,text,text,bigint,text) to service_role;

create function public.asociar_retiro_historico(p_id uuid,p_operativo uuid,p_chequeo uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare
  t uuid := public.jwt_tenant_id();
  cambio uuid;
begin
  if t is null or public.jwt_rol() is distinct from 'admin' or public.suscripcion_vigente() is not true then
    raise exception 'Solo administración puede asociar un retiro' using errcode='42501';
  end if;
  if (p_operativo is null)=(p_chequeo is null) then
    raise exception 'Elige un operativo o chequeo' using errcode='22023';
  end if;
  if (p_operativo is not null and not exists (select 1 from public.operativos o where o.id=p_operativo
    and o.tenant_id=t and o.chequeo_id is null and o.estado<>'cancelado'))
    or (p_chequeo is not null and not exists (select 1 from public.chequeos c where c.id=p_chequeo and c.tenant_id=t)) then
    raise exception 'Destino no disponible' using errcode='42501';
  end if;
  perform set_config('lentia.revision_motivo','Asocia retiro sin cambiar su importe',true);
  update public.retiros_sueldo set operativo_id=p_operativo,chequeo_id=p_chequeo
    where id=p_id and tenant_id=t and operativo_id is null and chequeo_id is null returning id into cambio;
  if cambio is null then raise exception 'El retiro cambió. Actualiza el reporte.' using errcode='40001'; end if;
end;
$$;
revoke all on function public.asociar_retiro_historico(uuid,uuid,uuid) from public,anon;
grant execute on function public.asociar_retiro_historico(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';

create function public.devoluciones_venta_pendientes() returns bigint
language sql stable security invoker set search_path='' as $$
  select coalesce(sum(monto),0)::bigint from public.devoluciones_venta
  where tenant_id=(select public.jwt_tenant_id()) and devuelto_en is null;
$$;
revoke all on function public.devoluciones_venta_pendientes() from public,anon;
grant execute on function public.devoluciones_venta_pendientes() to authenticated;

create or replace function public.eliminar_venta_de_ot(p_ot_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid := public.jwt_tenant_id();
  v_venta_id uuid;
  v_ots_venta uuid[];
  v_mov record;
begin
  if v_tenant is null or public.jwt_rol() is distinct from 'admin' or public.suscripcion_vigente() is not true then
    raise exception 'Sin permiso para eliminar órdenes' using errcode = '42501';
  end if;

  select venta_id into v_venta_id from public.venta_items where ot_id = p_ot_id limit 1;
  if v_venta_id is null then
    delete from public.ordenes_trabajo where id = p_ot_id;
    return jsonb_build_object('ok', true);
  end if;

  perform 1 from public.ventas where id = v_venta_id for update;
  if exists (select 1 from public.pagos_abonos where venta_id = v_venta_id) then
    raise exception 'La venta de esta orden ya tiene pagos: hay que anularla, no borrarla' using errcode = '22023';
  end if;

  for v_mov in select * from public.stock_neto_de_venta(v_venta_id) where neto > 0 loop
    insert into public.movimientos_inventario (tenant_id, producto_id, sucursal_id, tipo, cantidad, referencia)
    values (v_tenant, v_mov.producto_id, v_mov.sucursal_id, 'entrada', v_mov.neto, 'anulacion_ot:' || p_ot_id);
  end loop;

  -- Una venta de varios pares tiene varias órdenes: se van todas juntas.
  select array_agg(distinct ot_id) into v_ots_venta
    from public.venta_items where venta_id = v_venta_id and ot_id is not null;
  delete from public.venta_items where venta_id = v_venta_id;
  delete from public.ventas where id = v_venta_id;
  delete from public.ordenes_trabajo where id = p_ot_id or id = any (coalesce(v_ots_venta, '{}'));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function finanzas_privado.versionar() returns trigger
language plpgsql security invoker set search_path='' as $$
declare campos text[] := array['revision_version','confirmado_en','confirmado_por'];
begin
  if tg_op='INSERT' then
    new.revision_version := 0;
    if not (current_user='service_role' and tg_table_name='retiros_sueldo'
      and coalesce((to_jsonb(new)->>'reparto_verificado')::boolean,false)) then
      new.confirmado_en := null;
      new.confirmado_por := null;
    end if;
    return new;
  end if;
  new.revision_version := old.revision_version + 1;
  if (to_jsonb(new)-campos) is distinct from (to_jsonb(old)-campos) then
    if tg_table_name='retiros_sueldo'
      and (to_jsonb(new)-campos-array['operativo_id','chequeo_id'])
        is not distinct from (to_jsonb(old)-campos-array['operativo_id','chequeo_id']) then
      new.confirmado_en := old.confirmado_en; new.confirmado_por := old.confirmado_por;
    else
      new.confirmado_en := null; new.confirmado_por := null;
    end if;
  elsif new.confirmado_en is distinct from old.confirmado_en or new.confirmado_por is distinct from old.confirmado_por then
    if public.jwt_rol() <> 'admin' or public.suscripcion_vigente() is not true then raise exception 'Sin permiso para confirmar'; end if;
    new.confirmado_en := now(); new.confirmado_por := auth.uid();
  end if;
  return new;
end;
$$;

notify pgrst,'reload schema';
