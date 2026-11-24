create function public.registrar_gasto_caja_operativo(
  p_id uuid, p_operativo uuid, p_clave text, p_fecha date, p_monto bigint, p_caja text
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  tenant uuid := public.jwt_tenant_id();
  prefijo text := 'Costo operativo · ' || p_clave || ' · ';
  etiqueta text;
  anterior public.gastos_globales%rowtype;
  costo_registrado bigint;
  pagado bigint;
begin
  if tenant is null or public.jwt_rol() is distinct from 'admin' or public.suscripcion_vigente() is not true then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;

  etiqueta := case p_clave
    when 'costo_transporte' then 'Bencina y transporte'
    when 'costo_equipos' then 'Arriendo de equipo'
    when 'costo_comida' then 'Comida'
    when 'costo_hospedaje' then 'Hospedaje'
    when 'costo_peajes' then 'Peajes y TAG'
    when 'costo_otros' then 'Otro gasto'
  end;
  if p_id is null or p_operativo is null or etiqueta is null or p_fecha is null
    or p_fecha > (now() at time zone 'America/Santiago')::date
    or p_monto is null or p_monto <= 0 or p_monto > 9007199254740991
    or p_caja is null or p_caja not in ('efectivo', 'digital', 'personal') then
    raise exception 'Gasto inválido' using errcode = '22023';
  end if;

  -- Serializa los gastos rápidos de la misma sede y guarda presupuesto y abono en la misma transacción.
  execute format('select %I from public.operativos where id = $1 and tenant_id = $2 and estado <> ''cancelado'' for update', p_clave)
    into costo_registrado using p_operativo, tenant;
  if costo_registrado is null then
    raise exception 'Operativo no disponible' using errcode = '22023';
  end if;

  insert into public.gastos_globales (id, tenant_id, operativo_id, fecha, categoria, descripcion, monto, caja, medio_pago)
  values (p_id, tenant, p_operativo, p_fecha, 'otro', prefijo || etiqueta, p_monto, p_caja,
    case p_caja when 'efectivo' then 'efectivo' when 'digital' then 'transferencia' else null end)
  on conflict (id) do nothing
  returning * into anterior;

  if anterior.id is null then
    select * into anterior from public.gastos_globales g where g.id = p_id and g.tenant_id = tenant;
    if anterior.id is null or anterior.operativo_id is distinct from p_operativo or anterior.fecha <> p_fecha
      or anterior.monto <> p_monto or anterior.caja <> p_caja or anterior.descripcion <> (prefijo || etiqueta) then
      raise exception 'Identificador de gasto ya utilizado' using errcode = '23505';
    end if;
    return;
  end if;

  select coalesce((select sum(g.monto) from public.gastos_globales g
      where g.tenant_id = tenant and g.operativo_id = p_operativo and starts_with(g.descripcion, prefijo)), 0)
    + coalesce((select sum(a.monto) from public.gastos_asignaciones a
      where a.tenant_id = tenant and a.operativo_id = p_operativo and a.clave = p_clave and a.anulado_en is null), 0)
    into pagado;
  if pagado > costo_registrado then
    execute format('update public.operativos set %I = $1 where id = $2 and tenant_id = $3', p_clave)
      using pagado, p_operativo, tenant;
  end if;
end;
$$;

revoke all on function public.registrar_gasto_caja_operativo(uuid, uuid, text, date, bigint, text) from public, anon;
grant execute on function public.registrar_gasto_caja_operativo(uuid, uuid, text, date, bigint, text) to authenticated;
