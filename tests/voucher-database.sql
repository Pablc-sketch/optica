begin;
create temporary table pagos_abonos (
 id uuid primary key default gen_random_uuid(), tenant_id uuid, venta_id uuid,
 monto bigint, medio_pago text, numero_voucher text
);
create function pg_temp.jwt_tenant_id() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
create function pg_temp.registrar_venta(p jsonb) returns jsonb language plpgsql as $$
begin
 if exists (select 1 from pg_temp.pagos_abonos where venta_id=(p->>'venta_id')::uuid) then
  return jsonb_build_object('repetida',true);
 end if;
 if (p->>'abono')::bigint > 0 then
  insert into pg_temp.pagos_abonos(tenant_id,venta_id,monto,medio_pago)
  values(pg_temp.jwt_tenant_id(),(p->>'venta_id')::uuid,(p->>'abono')::bigint,p->>'medio_pago');
 end if;
 return jsonb_build_object('repetida',false);
end $$;
create function pg_temp.registrar_abono(p_id uuid,p_venta_id uuid,p_monto bigint,p_medio_pago text)
returns jsonb language plpgsql as $$
begin
 if exists(select 1 from pg_temp.pagos_abonos where id=p_id) then return jsonb_build_object('repetido',true,'aplicado',0); end if;
 insert into pg_temp.pagos_abonos(id,tenant_id,venta_id,monto,medio_pago)
 values(p_id,pg_temp.jwt_tenant_id(),p_venta_id,p_monto,p_medio_pago);
 return jsonb_build_object('repetido',false,'aplicado',p_monto);
end $$;
insert into pg_temp.pagos_abonos(id,tenant_id,venta_id,monto,medio_pago)
values('00000000-0000-4000-8000-000000000009',pg_temp.jwt_tenant_id(),'00000000-0000-4000-8000-000000000099',100,'debito');
-- Guarda pago y voucher en la misma transacción, conservando los bloqueos
-- e idempotencia de las funciones de cobro existentes.
create or replace function pg_temp.registrar_venta_con_voucher(p jsonb)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare resultado jsonb;
begin
  resultado := pg_temp.registrar_venta(p);
  if not coalesce((resultado ->> 'repetida')::boolean, false) then
    update pg_temp.pagos_abonos
       set numero_voucher = nullif(btrim(p ->> 'numero_voucher'), '')
     where venta_id = (p ->> 'venta_id')::uuid
       and tenant_id = pg_temp.jwt_tenant_id();
  end if;
  return resultado;
end;
$$;

create or replace function pg_temp.registrar_abono_con_voucher(
  p_id uuid, p_venta_id uuid, p_monto bigint, p_medio_pago text, p_numero_voucher text
)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare resultado jsonb;
begin
  resultado := pg_temp.registrar_abono(p_id, p_venta_id, p_monto, p_medio_pago);
  if not coalesce((resultado ->> 'repetido')::boolean, false)
     and coalesce((resultado ->> 'aplicado')::bigint, 0) > 0 then
    update pg_temp.pagos_abonos
       set numero_voucher = nullif(btrim(p_numero_voucher), '')
     where id = p_id and tenant_id = pg_temp.jwt_tenant_id();
  end if;
  return resultado;
end;
$$;

-- Diferido: el INSERT de las funciones originales y el UPDATE del voucher
-- son atómicos. Al confirmar se revisa la fila final, no la imagen inicial.
-- Las filas históricas no se rellenan ni se reescriben automáticamente.
create or replace function pg_temp.validar_voucher_pago_diferido()
returns trigger language plpgsql security invoker set search_path = public
as $$
declare pago record;
begin
  if tg_op = 'UPDATE' and old.numero_voucher is null and new.numero_voucher is null
     and old.medio_pago is not distinct from new.medio_pago
     and old.monto is not distinct from new.monto
     and old.venta_id is not distinct from new.venta_id then
    return null;
  end if;
  select medio_pago, numero_voucher into pago from pg_temp.pagos_abonos where id = new.id;
  if not found then return null; end if;
  if pago.medio_pago in ('debito', 'credito') and nullif(btrim(pago.numero_voucher), '') is null then
    raise exception 'Anota el número de operación o voucher de la máquina de Mercado Pago. Actualiza la página si no aparece el campo.' using errcode = '23514';
  end if;
  if pago.numero_voucher is not null and (
    length(pago.numero_voucher) > 80 or pago.numero_voucher !~ '^[A-Za-z0-9/-]+$' or pago.numero_voucher !~ '[0-9]'
  ) then
    raise exception 'Número de voucher inválido: copia la operación del comprobante, sin datos de tarjeta.' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger pago_requiere_voucher_tarjeta
after insert or update of numero_voucher, medio_pago, monto, venta_id on pg_temp.pagos_abonos
deferrable initially deferred for each row
execute function pg_temp.validar_voucher_pago_diferido();

revoke all on function pg_temp.registrar_venta_con_voucher(jsonb) from public, anon;
revoke all on function pg_temp.registrar_abono_con_voucher(uuid, uuid, bigint, text, text) from public, anon;
revoke all on function pg_temp.validar_voucher_pago_diferido() from public, anon, authenticated;
grant execute on function pg_temp.registrar_venta_con_voucher(jsonb) to authenticated;
grant execute on function pg_temp.registrar_abono_con_voucher(uuid, uuid, bigint, text, text) to authenticated;
notify pgrst, 'reload schema';

grant select, insert, update on pg_temp.pagos_abonos to authenticated;
do $$ declare nombre text; begin
 select nspname into nombre from pg_namespace where oid=pg_my_temp_schema();
 execute format('grant usage on schema %I to authenticated', nombre);
end $$;
set local role authenticated;
do $$
declare sale uuid := '00000000-0000-4000-8000-000000000002'; payment uuid := '00000000-0000-4000-8000-000000000003'; valor text;
begin
 -- Las llamadas antiguas no pueden saltarse el requisito.
 begin
  perform pg_temp.registrar_venta(jsonb_build_object('venta_id',sale,'abono',80,'medio_pago','debito'));
  set constraints pago_requiere_voucher_tarjeta immediate;
  raise exception 'FALLO: aceptó tarjeta sin voucher';
 exception when check_violation then null;
 end;
 set constraints pago_requiere_voucher_tarjeta deferred;
 if exists(select 1 from pg_temp.pagos_abonos where venta_id=sale) then raise exception 'FALLO: no revirtió el pago inválido'; end if;
 -- El INSERT y el voucher se confirman juntos.
 perform pg_temp.registrar_venta_con_voucher(jsonb_build_object('venta_id',sale,'abono',80,'medio_pago','debito','numero_voucher','000123'));
 set constraints pago_requiere_voucher_tarjeta immediate;
 select numero_voucher into valor from pg_temp.pagos_abonos where venta_id=sale;
 if valor <> '000123' then raise exception 'FALLO: perdió ceros o voucher'; end if;
 set constraints pago_requiere_voucher_tarjeta deferred;
 -- Un reintento no vuelve a cobrar ni sobrescribe el antecedente.
 perform pg_temp.registrar_venta_con_voucher(jsonb_build_object('venta_id',sale,'abono',80,'medio_pago','debito','numero_voucher','999999'));
 if (select count(*) from pg_temp.pagos_abonos where venta_id=sale) <> 1 then raise exception 'FALLO: duplicó venta'; end if;
 select numero_voucher into valor from pg_temp.pagos_abonos where venta_id=sale;
 if valor <> '000123' then raise exception 'FALLO: reescribió voucher'; end if;
 perform pg_temp.registrar_abono_con_voucher(payment,sale,145,'credito','000456');
 set constraints pago_requiere_voucher_tarjeta immediate;
 set constraints pago_requiere_voucher_tarjeta deferred;
 perform pg_temp.registrar_abono_con_voucher(payment,sale,145,'credito','999999');
 if (select count(*) from pg_temp.pagos_abonos where id=payment) <> 1 then raise exception 'FALLO: duplicó abono'; end if;
 select numero_voucher into valor from pg_temp.pagos_abonos where id=payment;
 if valor <> '000456' then raise exception 'FALLO: reescribió voucher de abono'; end if;
 -- No permite borrar un voucher ya guardado.
 begin
  update pg_temp.pagos_abonos set numero_voucher=null where id=payment;
  set constraints pago_requiere_voucher_tarjeta immediate;
  raise exception 'FALLO: borró voucher';
 exception when check_violation then null;
 end;
 set constraints pago_requiere_voucher_tarjeta deferred;
 -- El efectivo no exige un número ficticio.
 perform pg_temp.registrar_abono_con_voucher('00000000-0000-4000-8000-000000000004',sale,10,'efectivo',null);
 set constraints pago_requiere_voucher_tarjeta immediate;
 set constraints pago_requiere_voucher_tarjeta deferred;
 -- Cambiar un pago de efectivo a tarjeta tampoco elude el requisito.
 begin
  update pg_temp.pagos_abonos set medio_pago='debito' where id='00000000-0000-4000-8000-000000000004';
  set constraints pago_requiere_voucher_tarjeta immediate;
  raise exception 'FALLO: cambió a tarjeta sin voucher';
 exception when check_violation then null;
 end;
 set constraints pago_requiere_voucher_tarjeta deferred;
 -- Rechaza números inválidos en la propia base.
 begin
  perform pg_temp.registrar_abono_con_voucher('00000000-0000-4000-8000-000000000005',sale,10,'credito','sin voucher');
  set constraints pago_requiere_voucher_tarjeta immediate;
  raise exception 'FALLO: aceptó referencia inválida';
 exception when check_violation then null;
 end;
 set constraints pago_requiere_voucher_tarjeta deferred;
 -- No inventa datos históricos; sí permite completarlos con el original.
 if (select numero_voucher from pg_temp.pagos_abonos where id='00000000-0000-4000-8000-000000000009') is not null then raise exception 'FALLO: alteró histórico'; end if;
 update pg_temp.pagos_abonos set numero_voucher='000789' where id='00000000-0000-4000-8000-000000000009';
 set constraints pago_requiere_voucher_tarjeta immediate;
end $$;
select 'Validación SQL aprobada: requisito, atomicidad, ceros, reintentos, históricos y efectivo; solo tablas temporales' as resultado;
rollback;
