-- Un cambio de diseño que ya está decidido pero todavía no corresponde
-- pedir. Mientras dura la promoción de septiembre conviene pedir el
-- MULTIFOCAL ADVANCE (queda bajo el precio del CONFORT); el 1 de octubre
-- hay que volver al CONFORT o el par pasa de $45.280 a $77.648. Dejarlo
-- escrito acá hace que el cambio ocurra solo ese día, en vez de depender
-- de que alguien se acuerde — que es justo como se sigue pidiendo el caro
-- por inercia durante meses.
alter table public.costos_cristales
  add column if not exists diseno_laboratorio_proximo text,
  add column if not exists diseno_proximo_desde date;

-- Qué se le pidió al laboratorio en ESTA orden. Se congela al cerrar la
-- venta, igual que el costo: si una orden se toma el 29 de septiembre y
-- la planilla se imprime el 2 de octubre, el pedido tiene que decir lo
-- que se cotizó, no lo que correspondería pedir ese día.
alter table public.ordenes_trabajo
  add column if not exists diseno_laboratorio text,
  add column if not exists diseno_laboratorio_2 text;

comment on column public.ordenes_trabajo.diseno_laboratorio is
  'Diseño del catálogo del laboratorio con que se pidió este cristal (ej. MULTIFOCAL ADVANCE). Solo en los tallados a medida.';

-- El cambio acordado con Fides: ADVANCE hasta que termine septiembre,
-- CONFORT desde el 1 de octubre.
update public.costos_cristales
set diseno_laboratorio_proximo = 'MULTIFOCAL CONFORT',
    diseno_proximo_desde = '2026-10-01'
where tipo_lente = 'Multifocal' and diseno_laboratorio = 'MULTIFOCAL ADVANCE';
