-- Policarbonato solo se vende en Monofocal Filtro Azul. Bifocal y
-- multifocal en policarbonato salen del catálogo de la óptica P&P (las
-- órdenes ya hechas guardan su cristal por nombre, no se tocan). La
-- plantilla para ópticas nuevas no cambia.
delete from public.costos_cristales
 where tenant_id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
   and tipo_lente in ('Bifocal', 'Multifocal')
   and tratamiento ilike '%policarbonato%';
