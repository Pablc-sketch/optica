-- Razón social, separada del nombre comercial.
--
-- La óptica se llama "Óptica Global" en el letrero y en los mensajes a
-- los pacientes, pero en los documentos legales es "Ópticas P&P SpA" —
-- que es el nombre con que le factura el laboratorio y el que tiene que
-- ir en el certificado de compra de Fonasa. Sin separarlos, el
-- certificado salía con el nombre de fantasía, que no calza con el RUT de
-- la empresa y le puede costar el reembolso al paciente.
--
-- Queda nulable: si una óptica no la carga, los documentos usan el
-- nombre comercial como hasta ahora.
alter table public.tenants
  add column if not exists razon_social text;

comment on column public.tenants.razon_social is
  'Nombre legal de la empresa, para documentos formales (certificado Fonasa, facturas). null = usar nombre_comercial.';

update public.tenants
set razon_social = 'Ópticas P&P SpA'
where id = '7e4b2a1a-8926-4262-92e2-1f0e75951b9a'
  and razon_social is null;
