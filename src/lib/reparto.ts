import { calcularSueldos } from "./sueldos";

export const PERSONAS_REPARTO = ["isadora", "ahorro", "madre", "pablo"] as const;
export type PersonaReparto = typeof PERSONAS_REPARTO[number];
export type MontosReparto = Record<PersonaReparto, number>;
export type ReglasReparto = { ahorroPct: number; parteMadrePct: number };
export type RetiroReparto = { persona: string; monto: number };

export function retirosPorPersona(retiros: readonly RetiroReparto[]): MontosReparto {
  return Object.fromEntries(PERSONAS_REPARTO.map(persona => [
    persona, retiros.filter(r => r.persona === persona).reduce((total, r) => total + r.monto, 0),
  ])) as MontosReparto;
}

export function calcularReparto(
  saldoTrasCompromisos: number, porCobrar: number, comisionPendiente: number,
  retirado: MontosReparto, reglas: ReglasReparto,
) {
  const previo = retirado.ahorro + retirado.madre + retirado.pablo;
  const repartir = (saldo: number) => calcularSueldos(0, saldo + previo, {
    comisionVendedoraPct: 0, comisionVendedoraBase: "venta_total", ...reglas,
  });
  const pendiente = (reparto: ReturnType<typeof repartir>, isadora: number): MontosReparto => ({
    isadora,
    ahorro: Math.max(0, reparto.ahorro - retirado.ahorro),
    madre: Math.max(0, reparto.parteMadre - retirado.madre),
    pablo: Math.max(0, reparto.partePablo - retirado.pablo),
  });
  const proyectado = saldoTrasCompromisos + porCobrar;
  const reparto = repartir(proyectado);
  const repartoPendiente = pendiente(reparto, comisionPendiente);

  function pagableConCaja(cajaTrasReservas: number): MontosReparto {
    // El saldo de entrada ya reservó la comisión. Se puede abonar a Isadora
    // con el dinero disponible después de las otras obligaciones.
    const tope = Math.min(saldoTrasCompromisos, cajaTrasReservas);
    const isadora = Math.max(0, Math.min(comisionPendiente, tope + comisionPendiente));
    const paraSociosYAhorro = Math.max(0, tope);
    const resultado = pendiente(repartir(paraSociosYAhorro), isadora);
    // Un adelanto mayor a la cuota de una persona no aumenta la caja.
    // Distribuye el límite disponible entre los saldos restantes en pesos enteros.
    const personas = ["ahorro", "madre", "pablo"] as const;
    let acumulado = 0;
    const total = personas.reduce((suma, persona) => suma + resultado[persona], 0);
    if (total > paraSociosYAhorro) for (const persona of personas) {
      const anterior = Math.round(acumulado * paraSociosYAhorro / total);
      acumulado += resultado[persona];
      resultado[persona] = Math.round(acumulado * paraSociosYAhorro / total) - anterior;
    }
    return resultado;
  }
  return { proyectado, reparto, repartoPendiente, retirado, pagableConCaja };
}
