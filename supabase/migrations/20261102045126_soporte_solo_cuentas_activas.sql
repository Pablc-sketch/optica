-- Una cuenta de soporte desactivada tampoco puede consultar metadatos de ópticas.
create or replace function public.listar_opticas()
returns table(tenant_id uuid,nombre_comercial text,rut_empresa text,creada timestamptz,
  plan text,estado text,fecha_renovacion date,usuarios bigint,pacientes bigint,ventas bigint)
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.users u where u.id=auth.uid() and u.es_superadmin and u.estado='activo') then
    raise exception 'Solo el equipo de soporte activo puede ver el panel de ópticas' using errcode='42501';
  end if;
  return query select t.id,t.nombre_comercial,t.rut_empresa,t.created_at,
    s.plan,s.estado,s.fecha_renovacion,
    (select count(*) from public.users u2 where u2.tenant_id=t.id),
    (select count(*) from public.pacientes p where p.tenant_id=t.id),
    (select count(*) from public.ventas v where v.tenant_id=t.id)
  from public.tenants t left join public.suscripciones s on s.tenant_id=t.id order by t.created_at desc;
end;
$$;
revoke execute on function public.listar_opticas() from public,anon;
grant execute on function public.listar_opticas() to authenticated;
