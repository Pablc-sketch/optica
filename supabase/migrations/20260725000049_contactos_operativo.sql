-- La agenda de dirigentes: con quién hay que hablar para volver a este
-- lugar.
--
-- Hasta ahora el operativo guardaba UN contacto (contacto_nombre /
-- contacto_telefono). En la práctica en un condominio hay varios: el
-- presidente de la directiva, la administradora, la secretaria — y el que
-- abrió la puerta la primera vez no siempre sigue en el cargo seis meses
-- después. Con un solo campo, para anotar al segundo había que pisar al
-- primero.
--
-- La ficha vive colgada del operativo (no de una agenda suelta) porque lo
-- que se quiere recordar no es "Luigino" sino "Luigino, del condominio de
-- San Pablo 7558, donde fuimos en septiembre y salieron 34 personas". Sin
-- ese contexto el teléfono no sirve para nada.
create table public.contactos_operativo (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  operativo_id uuid not null references public.operativos (id) on delete cascade,
  nombre text not null,
  -- Cargo en texto libre: cada lugar le pone un nombre distinto al mismo
  -- rol ("presidenta del comité", "encargada de la sede", "el tío de la
  -- APR") y forzar una lista cerrada solo obliga a elegir "otro".
  cargo text,
  telefono text,
  email text,
  notas text,
  created_at timestamptz not null default now()
);

alter table public.contactos_operativo enable row level security;

create policy "contactos_operativo: lectura del propio tenant"
  on public.contactos_operativo for select to authenticated
  using (tenant_id = public.jwt_tenant_id());
create policy "contactos_operativo: alta con suscripción vigente"
  on public.contactos_operativo for insert to authenticated
  with check (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());
create policy "contactos_operativo: edición con suscripción vigente"
  on public.contactos_operativo for update to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente())
  with check (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());
create policy "contactos_operativo: borrado con suscripción vigente"
  on public.contactos_operativo for delete to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.suscripcion_vigente());

grant select, insert, update, delete on public.contactos_operativo to authenticated;
grant all on public.contactos_operativo to service_role;

create index idx_contactos_operativo_operativo on public.contactos_operativo (operativo_id);
create index idx_contactos_operativo_tenant on public.contactos_operativo (tenant_id);

-- Cada cuántos meses conviene volver a este lugar. Va en el operativo y no
-- en un ajuste global porque no es lo mismo un condominio (la gente se
-- cambia los lentes cada uno o dos años) que un colegio, donde cada marzo
-- entra un curso nuevo. Seis meses por omisión: es el plazo más corto
-- razonable, y siempre es más fácil postergar un aviso que acordarse solo.
alter table public.operativos
  add column if not exists volver_en_meses integer not null default 6
    check (volver_en_meses between 1 and 60);

comment on column public.operativos.volver_en_meses is
  'Cada cuántos meses conviene volver a este lugar. La agenda de contactos avisa cuando se cumple el plazo desde el último operativo.';

-- El contacto que ya estaba guardado en el operativo pasa a ser la primera
-- ficha de su agenda, para no perderlo ni tener que reescribirlo.
insert into public.contactos_operativo (tenant_id, operativo_id, nombre, telefono)
select o.tenant_id, o.id, o.contacto_nombre, o.contacto_telefono
from public.operativos o
where coalesce(trim(o.contacto_nombre), '') <> ''
  and not exists (
    select 1 from public.contactos_operativo c where c.operativo_id = o.id
  );

-- Las columnas viejas quedan en la tabla pero ya nadie las lee ni las
-- escribe: su contenido se copió arriba. No se borran todavía por si hay
-- que volver a mirarlas; la app entera pasa por contactos_operativo.
comment on column public.operativos.contacto_nombre is
  'OBSOLETA — reemplazada por contactos_operativo. Se conserva solo como respaldo del dato original.';
comment on column public.operativos.contacto_telefono is
  'OBSOLETA — reemplazada por contactos_operativo. Se conserva solo como respaldo del dato original.';
