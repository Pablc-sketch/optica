-- El ahorro que calcula el reparto de sueldos (20% de lo que queda
-- después de la comisión de Isadora) es puramente teórico: no hay ningún
-- movimiento de plata real asociado, así que no aparecía en ninguna
-- parte y no había forma de saber si ya se había gastado por error o
-- seguía mezclado con la caja normal.
--
-- Se reutiliza retiros_sueldo (mismo mecanismo que ya usan Isadora, la
-- mamá y Pablo) agregando 'ahorro' como una persona más — así "apartar
-- el ahorro" es un movimiento real y visible, no una promesa que se
-- pierde en la cuenta general.
alter table public.retiros_sueldo drop constraint retiros_sueldo_persona_check;
alter table public.retiros_sueldo
  add constraint retiros_sueldo_persona_check check (persona in ('isadora', 'madre', 'pablo', 'ahorro'));

-- El monto puede ser negativo: representa un APORTE (esa persona pone
-- plata al negocio, ej. cubrir una diferencia de caja al pagar al
-- laboratorio), lo opuesto a un retiro. Con el mismo signo, "lo que se le
-- debe - retiro" ya funciona sola para los dos casos: un retiro negativo
-- (aporte) SUMA a lo que se le debe, en vez de restar.
alter table public.retiros_sueldo drop constraint retiros_sueldo_monto_check;
alter table public.retiros_sueldo add constraint retiros_sueldo_monto_check check (monto <> 0);
