-- Un registro corregido a cero deja constancia de que no hubo salida.
-- Los aportes negativos siguen permitidos.
alter table public.retiros_sueldo drop constraint retiros_sueldo_monto_check;

create or replace function public.revisar_movimiento_financiero(p_tabla text,p_id uuid,p_version bigint,p_accion text,p_datos jsonb,p_motivo text)
returns void language plpgsql security invoker set search_path='' as $$
declare t uuid := public.jwt_tenant_id(); actual jsonb; op uuid; importe bigint; f date; origen text; detalle text;
begin
  if t is null or public.jwt_rol()<>'admin' or public.suscripcion_vigente() is not true then raise exception 'Sin permiso'; end if;
  if p_id is null or p_version is null or p_version<0 or p_tabla is null or p_accion is null or p_tabla not in ('gastos_globales','retiros_sueldo') or p_accion not in ('crear','guardar','confirmar') then raise exception 'Acción inválida'; end if;
  if length(btrim(coalesce(p_motivo,''))) not between 1 and 250 then raise exception 'Indica el motivo (máximo 250 caracteres)'; end if;
  perform set_config('lentia.revision_motivo',p_motivo,true);
  if p_accion<>'crear' then
    if p_tabla='gastos_globales' then
      select to_jsonb(g) into actual from public.gastos_globales g where id=p_id and tenant_id=t for update;
    else
      select to_jsonb(r) into actual from public.retiros_sueldo r where id=p_id and tenant_id=t for update;
    end if;
    if actual is null then raise exception 'Movimiento no disponible'; end if;
    if (actual->>'revision_version')::bigint is distinct from p_version then raise exception 'El movimiento cambió. Recarga antes de guardar.'; end if;
  end if;
  if p_accion<>'confirmar' then
    importe := (p_datos->>'monto')::bigint;
    f := (p_datos->>'fecha')::date;
    origen := p_datos->>'caja';
    op := nullif(p_datos->>'operativo_id','')::uuid;
    if importe is null or abs(importe::numeric)>9007199254740991 or f is null or f>(now() at time zone 'America/Santiago')::date
      or origen is null or origen not in ('efectivo','digital','personal') then raise exception 'Revisa monto, fecha y origen'; end if;
    if op is not null and not exists(select 1 from public.operativos where id=op and tenant_id=t) then raise exception 'Operativo no disponible'; end if;
    if p_tabla='gastos_globales' then
      detalle := btrim(p_datos->>'descripcion');
      if importe<0 or detalle is null or length(detalle) not between 1 and 250 or coalesce(p_datos->>'categoria','') not in ('compra_inventario','arriendo','otro') then raise exception 'Gasto inválido'; end if;
      -- No romper el vínculo de abonos de costos que usan prefijos estables.
      if actual is not null and (actual->>'descripcion' like 'Costo operativo · %' or actual->>'descripcion' like 'Fides · %' or actual->>'descripcion' like 'Marcos · %')
        and (detalle is distinct from actual->>'descripcion' or op is distinct from (actual->>'operativo_id')::uuid) then raise exception 'Conserva el concepto y operativo de este abono'; end if;
      if p_accion='crear' then
        insert into public.gastos_globales(id,tenant_id,fecha,monto,caja,descripcion,categoria,operativo_id)
        values(p_id,t,f,importe,origen,detalle,p_datos->>'categoria',op);
      else
        update public.gastos_globales set fecha=f,monto=importe,caja=origen,descripcion=detalle,categoria=p_datos->>'categoria',operativo_id=op,
          medio_pago=case when origen='efectivo' then 'efectivo' when origen='digital' then 'transferencia' else null end
        where id=p_id and tenant_id=t;
      end if;
    else
      if coalesce(p_datos->>'persona','') not in ('isadora','madre','pablo','ahorro') or origen='personal'
        or (p_datos->>'persona'='ahorro' and importe<0) or length(coalesce(p_datos->>'motivo',''))>250 then raise exception 'Pago o ahorro inválido'; end if;
      if p_accion='crear' then
        insert into public.retiros_sueldo(id,tenant_id,fecha,monto,caja,persona,motivo,operativo_id,es_sueldo)
        values(p_id,t,f,importe,origen,p_datos->>'persona',p_datos->>'motivo',op,coalesce((p_datos->>'es_sueldo')::boolean,false));
      else
        update public.retiros_sueldo set fecha=f,monto=importe,caja=origen,persona=p_datos->>'persona',motivo=p_datos->>'motivo',operativo_id=op,
          es_sueldo=coalesce((p_datos->>'es_sueldo')::boolean,false),medio_pago=case when origen='efectivo' then 'efectivo' else 'transferencia' end
        where id=p_id and tenant_id=t;
      end if;
    end if;
  end if;
  -- Confirmar es un paso separado dentro de la misma transacción: editar
  -- desde cualquier otra pantalla vuelve a dejar pendiente la revisión.
  if p_tabla='gastos_globales' then
    update public.gastos_globales set confirmado_en=clock_timestamp(),confirmado_por=auth.uid() where id=p_id and tenant_id=t;
  else
    update public.retiros_sueldo set confirmado_en=clock_timestamp(),confirmado_por=auth.uid() where id=p_id and tenant_id=t;
  end if;
end;
$$;
revoke all on function public.revisar_movimiento_financiero(text,uuid,bigint,text,jsonb,text) from public,anon;
grant execute on function public.revisar_movimiento_financiero(text,uuid,bigint,text,jsonb,text) to authenticated;
