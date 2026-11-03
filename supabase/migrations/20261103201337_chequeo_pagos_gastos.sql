-- La revisión no presupone que un pago histórico ocurrió.
alter table public.gastos_globales add column revision_version bigint not null default 0,
  add column confirmado_en timestamptz, add column confirmado_por uuid references public.users(id);
alter table public.retiros_sueldo add column revision_version bigint not null default 0,
  add column confirmado_en timestamptz, add column confirmado_por uuid references public.users(id);

create table public.revisiones_financieras (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id),
  tabla text not null check(tabla in ('gastos_globales','retiros_sueldo')),
  movimiento_id uuid not null,
  antes jsonb, despues jsonb,
  motivo text not null,
  usuario_id uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index on public.revisiones_financieras(tenant_id,created_at desc);
alter table public.revisiones_financieras enable row level security;
revoke all on public.revisiones_financieras from public,anon,authenticated;
grant select on public.revisiones_financieras to authenticated;
create policy revisiones_financieras_leer on public.revisiones_financieras for select to authenticated
using(tenant_id=(select public.jwt_tenant_id()) and (select public.jwt_rol())='admin');

create schema if not exists finanzas_privado;
revoke all on schema finanzas_privado from public,anon,authenticated;
-- Los triggers reciben tablas fijas; no exponen una RPC con privilegios elevados.
create function finanzas_privado.versionar() returns trigger
language plpgsql security invoker set search_path='' as $$
declare campos text[] := array['revision_version','confirmado_en','confirmado_por'];
begin
  if tg_op='INSERT' then
    new.revision_version := 0; new.confirmado_en := null; new.confirmado_por := null; return new;
  end if;
  new.revision_version := old.revision_version + 1;
  if (to_jsonb(new)-campos) is distinct from (to_jsonb(old)-campos) then
    new.confirmado_en := null; new.confirmado_por := null;
  elsif new.confirmado_en is distinct from old.confirmado_en or new.confirmado_por is distinct from old.confirmado_por then
    if public.jwt_rol() <> 'admin' or public.suscripcion_vigente() is not true then raise exception 'Sin permiso para confirmar'; end if;
    new.confirmado_en := now(); new.confirmado_por := auth.uid();
  end if;
  return new;
end;
$$;
create function finanzas_privado.auditar() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.revisiones_financieras(tenant_id,tabla,movimiento_id,antes,despues,motivo,usuario_id)
  values(coalesce(new.tenant_id,old.tenant_id),tg_table_name,coalesce(new.id,old.id),
    case when tg_op<>'INSERT' then to_jsonb(old) end,
    case when tg_op<>'DELETE' then to_jsonb(new) end,
    coalesce(nullif(current_setting('lentia.revision_motivo',true),''),'Movimiento desde otra pantalla'),auth.uid());
  return coalesce(new,old);
end;
$$;
revoke all on function finanzas_privado.auditar() from public,anon,authenticated;
revoke all on function finanzas_privado.versionar() from public,anon,authenticated;
create trigger revision_version before insert or update on public.gastos_globales for each row execute function finanzas_privado.versionar();
create trigger revision_version before insert or update on public.retiros_sueldo for each row execute function finanzas_privado.versionar();
create trigger revision_historial after insert or update or delete on public.gastos_globales for each row execute function finanzas_privado.auditar();
create trigger revision_historial after insert or update or delete on public.retiros_sueldo for each row execute function finanzas_privado.auditar();

create function public.revisar_movimiento_financiero(p_tabla text,p_id uuid,p_version bigint,p_accion text,p_datos jsonb,p_motivo text)
returns void language plpgsql security invoker set search_path='' as $$
declare t uuid := public.jwt_tenant_id(); actual jsonb; op uuid; importe bigint; f date; origen text; detalle text;
begin
  if t is null or public.jwt_rol()<>'admin' or public.suscripcion_vigente() is not true then raise exception 'Sin permiso'; end if;
  if p_tabla not in ('gastos_globales','retiros_sueldo') or p_accion not in ('crear','guardar','confirmar') then raise exception 'Acción inválida'; end if;
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
