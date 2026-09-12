-- Caja global: de qué caja sale cada peso, y sueldos marcados como pagados.
--
-- Hasta ahora los retiros y los gastos guardaban solo `medio_pago`, y de
-- ahí se adivinaba la caja: "efectivo" bajaba el efectivo, cualquier otra
-- cosa bajaba la cuenta. El problema es que `medio_pago` es opcional: un
-- retiro guardado sin medio de pago no bajaba NINGUNA caja, la plata
-- desaparecía del cuadre sin aviso. Ahora la caja es una columna propia y
-- obligatoria — efectivo o digital — y `medio_pago` queda solo como dato
-- descriptivo (con qué tarjeta, por transferencia, etc.).
--
-- `es_sueldo` separa dos cosas que antes se veían iguales: un adelanto que
-- alguien saca a cuenta de su sueldo, y el pago del sueldo propiamente
-- tal. Las dos bajan la caja igual, pero en pantalla una dice "ya retiró"
-- y la otra dice "pagado".

alter table public.retiros_sueldo
  add column if not exists caja text not null default 'efectivo'
    check (caja in ('efectivo', 'digital')),
  add column if not exists es_sueldo boolean not null default false;

alter table public.gastos_globales
  add column if not exists caja text not null default 'efectivo'
    check (caja in ('efectivo', 'digital'));

-- Los movimientos que ya existen conservan la caja que se les venía
-- adivinando, para que ningún saldo cambie con esta migración.
update public.retiros_sueldo
   set caja = case when medio_pago = 'efectivo' then 'efectivo' else 'digital' end;

update public.gastos_globales
   set caja = case when medio_pago = 'efectivo' then 'efectivo' else 'digital' end;

comment on column public.retiros_sueldo.caja is
  'De qué caja salió la plata: efectivo (lo que se tiene en la mano) o digital (la cuenta).';
comment on column public.retiros_sueldo.es_sueldo is
  'true cuando es el pago del sueldo del mes, no un adelanto a cuenta.';
comment on column public.gastos_globales.caja is
  'De qué caja salió la plata: efectivo o digital.';

-- La caja global recorre todos los movimientos desde el principio, no solo
-- los del mes: sin índice por tenant eso era un scan completo cada vez que
-- se abre Reportes.
create index if not exists idx_retiros_sueldo_tenant_fecha
  on public.retiros_sueldo (tenant_id, fecha);
create index if not exists idx_gastos_globales_tenant_fecha
  on public.gastos_globales (tenant_id, fecha);
