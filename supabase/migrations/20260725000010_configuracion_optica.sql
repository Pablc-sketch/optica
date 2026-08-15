-- Configuración de la óptica: datos de contacto y plazo de entrega.
--
-- Hasta ahora Configuración solo permitía cambiar nombre comercial, RUT y
-- el factor de venta. Faltaban dos cosas que la óptica sí necesita definir:
--
-- 1. Teléfono y dirección: aparecen en el comprobante y en la orden de
--    trabajo, que son documentos que se entregan al cliente. Sin esto, los
--    impresos salen sin forma de contactar a la óptica.
-- 2. Plazo de entrega: estaba fijo en 7 días dentro del código de la venta,
--    así que ninguna óptica podía ajustarlo a lo que demora su laboratorio.
--
-- Las policies de tenants ya cubren estas columnas: la edición sigue
-- restringida al admin del propio tenant ("tenants: edición de admin").

alter table public.tenants
  add column if not exists telefono text,
  add column if not exists direccion text,
  add column if not exists dias_entrega_default integer not null default 7;

-- Guardado para poder aplicar el bloque a mano en una base que ya lo tenga
-- (add constraint no admite "if not exists").
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tenants_dias_entrega_positivo') then
    alter table public.tenants
      add constraint tenants_dias_entrega_positivo
      check (dias_entrega_default > 0 and dias_entrega_default <= 90);
  end if;
end $$;
