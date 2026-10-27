-- Guarda pago y voucher en la misma transacción, conservando los bloqueos
-- e idempotencia de las funciones de cobro existentes.
create or replace function public.registrar_venta_con_voucher(p jsonb)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare resultado jsonb;
begin
  resultado := public.registrar_venta(p);
  if not coalesce((resultado ->> 'repetida')::boolean, false) then
    update public.pagos_abonos
       set numero_voucher = nullif(btrim(p ->> 'numero_voucher'), '')
     where venta_id = (p ->> 'venta_id')::uuid
       and tenant_id = public.jwt_tenant_id();
  end if;
  return resultado;
end;
$$;

create or replace function public.registrar_abono_con_voucher(
  p_id uuid, p_venta_id uuid, p_monto bigint, p_medio_pago text, p_numero_voucher text
)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare resultado jsonb;
begin
  resultado := public.registrar_abono(p_id, p_venta_id, p_monto, p_medio_pago);
  if not coalesce((resultado ->> 'repetido')::boolean, false)
     and coalesce((resultado ->> 'aplicado')::bigint, 0) > 0 then
    update public.pagos_abonos
       set numero_voucher = nullif(btrim(p_numero_voucher), '')
     where id = p_id and tenant_id = public.jwt_tenant_id();
  end if;
  return resultado;
end;
$$;

-- Diferido: el INSERT de las funciones originales y el UPDATE del voucher
-- son atómicos. Al confirmar se revisa la fila final, no la imagen inicial.
-- Las filas históricas no se rellenan ni se reescriben automáticamente.
create or replace function public.validar_voucher_pago_diferido()
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
  select medio_pago, numero_voucher into pago from public.pagos_abonos where id = new.id;
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
after insert or update of numero_voucher, medio_pago, monto, venta_id on public.pagos_abonos
deferrable initially deferred for each row
execute function public.validar_voucher_pago_diferido();

revoke all on function public.registrar_venta_con_voucher(jsonb) from public, anon;
revoke all on function public.registrar_abono_con_voucher(uuid, uuid, bigint, text, text) from public, anon;
revoke all on function public.validar_voucher_pago_diferido() from public, anon, authenticated;
grant execute on function public.registrar_venta_con_voucher(jsonb) to authenticated;
grant execute on function public.registrar_abono_con_voucher(uuid, uuid, bigint, text, text) to authenticated;
notify pgrst, 'reload schema';
