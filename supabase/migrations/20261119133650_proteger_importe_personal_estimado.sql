create function public.exigir_importe_personal_exacto() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.tipo='devolucion' and exists(select 1 from public.gastos_globales where id=new.gasto_id and tenant_id=new.tenant_id and monto_estimado) then
  raise exception 'Confirma primero el importe exacto del comprobante personal.' using errcode='23514';
 end if;
 return new;
end;
$$;
create trigger b_exigir_importe_personal_exacto before insert on public.caja_movimientos for each row execute function public.exigir_importe_personal_exacto();
revoke all on function public.exigir_importe_personal_exacto() from public,anon;
