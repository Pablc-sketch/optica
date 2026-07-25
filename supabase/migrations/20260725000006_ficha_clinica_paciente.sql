-- Ficha clínica del paciente: antecedentes relevantes para la atención
-- óptica. La diabetes y la hipertensión cambian la conducta clínica
-- (retinopatía, variación refractiva), y el resto condiciona la
-- recomendación de cristales y el seguimiento.

alter table public.pacientes
  add column diabetes boolean not null default false,
  add column hipertension boolean not null default false,
  add column glaucoma boolean not null default false,
  add column cirugia_ocular boolean not null default false,
  add column usa_lentes_contacto boolean not null default false,
  add column alergias text,
  add column medicamentos text,
  add column ocupacion text,
  add column horas_pantalla text,
  add column antecedentes_otros text,
  add column ultima_visita date;

comment on column public.pacientes.horas_pantalla is
  'Exposición diaria a pantallas; orienta la recomendación de filtro azul.';
