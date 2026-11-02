alter table public.ventas add column fecha_documentos date;
alter table public.ventas add column reembolso_entidad text not null default 'fonasa'
  check (reembolso_entidad in ('fonasa','banmedica','complementario'));
create function public.guardar_reembolso(p_venta uuid,p_fecha date,p_entidad text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v public.ventas;
begin
  if public.jwt_rol() not in ('admin','ventas') or public.suscripcion_vigente() is not true then
    raise exception 'Sin permiso para editar el reembolso' using errcode='42501'; end if;
  if p_fecha is null or p_entidad is null or p_entidad not in ('fonasa','banmedica','complementario') then
    raise exception 'Revisa la fecha y el destino del reembolso' using errcode='23514'; end if;
  select * into v from public.ventas where id=p_venta and tenant_id=public.jwt_tenant_id() and not anulada for update;
  if not found then raise exception 'Compra no disponible' using errcode='42501'; end if;
  if v.fecha_documentos is not distinct from p_fecha and v.reembolso_entidad=p_entidad then return true; end if;
  update public.ventas set fecha_documentos=p_fecha,reembolso_entidad=p_entidad where id=v.id;
  insert into public.ventas_cambios(tenant_id,venta_id,usuario_id,accion,motivo,antes,despues)
    values(v.tenant_id,v.id,auth.uid(),'edicion','Fecha y destino del reembolso',
      jsonb_build_object('fecha_documentos',v.fecha_documentos,'entidad',v.reembolso_entidad),
      jsonb_build_object('fecha_documentos',p_fecha,'entidad',p_entidad));
  return true;
end;
$$;
revoke all on function public.guardar_reembolso(uuid,date,text) from public,anon;
grant execute on function public.guardar_reembolso(uuid,date,text) to authenticated;
notify pgrst,'reload schema';
