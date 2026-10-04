-- Lentia, paso 2: sacar policarbonato bifocal/multifocal y revisar que todo quedó bien.
begin;
delete from public.costos_cristales
 where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
   and tipo_lente in ('Bifocal', 'Multifocal')
   and tratamiento ilike '%policarbonato%';
commit;

select
  (select count(*) from public.proveedores where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a' and lower(nombre) = 'fides') as fides,
  (select count(*) from pg_proc where proname in ('registrar_venta','registrar_abono','anular_venta','actualizar_venta')) as funciones_venta,
  (select count(*) from pg_trigger where tgname like 'trg_%' and not tgisinternal) as reglas,
  (select count(*) from public.costos_cristales where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a' and tratamiento ilike '%policarbonato%' and tipo_lente <> 'Monofocal') as poli_bif_multi,
  (select string_agg(distinct tratamiento, ', ') from public.costos_cristales where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a' and tratamiento like 'Polarizado%') as polarizados,
  (select count(*) from public.reparaciones_datos) as folio62_reparado;
