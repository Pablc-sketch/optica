-- Horario del operativo y datos de la entrega.
--
-- Hasta ahora un operativo solo tenía fecha (y fecha_fin si duraba más de
-- un día), sin hora. Eso alcanzaba para el registro histórico, pero no
-- para planificar: en un mismo día se hacen dos puntos distintos ("Los
-- Molles sede Huaquén de 10 a 13" y "sede Pullalli de 16 a 18"), y sin
-- hora el calendario no puede mostrarlos uno después del otro ni avisar
-- si se pisan.
--
-- Cada sede sigue siendo su propio operativo (tiene sus ventas, sus metas
-- y su reparto de sueldos aparte); lo que faltaba era la hora para poder
-- ordenarlos en el día.
alter table public.operativos
  add column if not exists hora_inicio time,
  add column if not exists hora_fin time;

-- Dónde y a qué hora se entregan los lentes. La fecha ya existía
-- (fecha_entrega_estimada); faltaban la hora y el lugar, que es lo que
-- hay que decirle al paciente cuando se le manda el recordatorio por
-- WhatsApp. Van como texto libre porque en la práctica se dictan así
-- ("10:00 a 12:00", "sede central del condominio") y forzar un formato
-- solo agrega fricción a algo que se escribe una vez por operativo.
alter table public.operativos
  add column if not exists hora_entrega text,
  add column if not exists lugar_entrega text;

comment on column public.operativos.hora_inicio is
  'Hora a la que empieza la atención en este punto. Sirve para ordenar el calendario cuando hay varios operativos el mismo día.';
comment on column public.operativos.lugar_entrega is
  'Dónde se entregan los lentes — puede ser distinto de donde se atendió.';
