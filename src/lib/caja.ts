// La caja del negocio, partida en dos: lo que está en la mano y lo que
// está en la cuenta.
//
// Son dos cajas distintas de verdad, no una sola con etiquetas: el
// efectivo se puede usar al tiro, la plata de la cuenta llega después y
// llega con menos (la máquina POS se queda con su comisión). Mezclarlas
// en un solo número hacía imposible responder la pregunta que se hace
// todos los días: "¿cuánto efectivo tengo que debería estar en el sobre?".
//
// Cada movimiento sabe de qué caja sale. Antes se adivinaba mirando el
// medio de pago, y un retiro guardado sin medio de pago no bajaba ninguna
// de las dos: la plata salía de verdad pero el cuadre seguía igual.

export type Caja = "efectivo" | "digital";

export type Entrada = { monto: number; medio_pago: string | null };
// El monto de una salida puede ser negativo: así se guarda un APORTE
// (alguien pone plata propia en el negocio), y sumarlo tal cual hace que
// la caja suba en vez de bajar, sin necesitar un camino aparte.
export type Salida = { monto: number; caja: string };

export type ResumenCaja = {
  entroEfectivo: number;
  entroDigital: number;
  salioEfectivo: number;
  salioDigital: number;
  comisionTarjeta: number;
  hayEfectivo: number;
  hayDigital: number;
  total: number;
};

// Un pago en efectivo es la única entrada que queda en la mano; débito,
// crédito y transferencia van todos a la cuenta. Un pago sin medio
// anotado se trata como efectivo porque es lo que pasa cuando alguien
// cobra rápido y no alcanza a elegir en la pantalla: casi siempre fue
// plata en la mano, y contarlo como digital dejaría un faltante fantasma
// en el sobre.
export function cajaDelPago(medioPago: string | null | undefined): Caja {
  return medioPago === "efectivo" || !medioPago ? "efectivo" : "digital";
}

function sumar(movimientos: { monto: number }[]): number {
  return movimientos.reduce((s, m) => s + m.monto, 0);
}

// Totales ya sumados, vengan de donde vengan. La caja global los pide a la
// base con la función caja_global() (sumar miles de pagos en el navegador
// se topaba con el corte de 1.000 filas de PostgREST y devolvía menos
// plata de la real, sin avisar); la del período los arma con los
// movimientos que ya trajo la página.
export type TotalesCaja = {
  entroEfectivo: number;
  entroDigital: number;
  entroDebito: number;
  entroCredito: number;
  salioEfectivo: number;
  salioDigital: number;
};

export type Comisiones = { comisionDebitoPct?: number; comisionCreditoPct?: number };

export function resumirCaja(
  t: TotalesCaja,
  { comisionDebitoPct = 0, comisionCreditoPct = 0 }: Comisiones = {}
): ResumenCaja {
  // Lo que el procesador de tarjeta se queda antes de depositar. El débito
  // suele liquidarse sin comisión y el crédito no, así que van con tasas
  // separadas en vez de un solo porcentaje promedio.
  const comisionTarjeta = Math.round(
    (t.entroDebito * comisionDebitoPct + t.entroCredito * comisionCreditoPct) / 100
  );
  const hayEfectivo = t.entroEfectivo - t.salioEfectivo;
  const hayDigital = t.entroDigital - t.salioDigital - comisionTarjeta;

  return {
    entroEfectivo: t.entroEfectivo,
    entroDigital: t.entroDigital,
    salioEfectivo: t.salioEfectivo,
    salioDigital: t.salioDigital,
    comisionTarjeta,
    hayEfectivo,
    hayDigital,
    total: hayEfectivo + hayDigital,
  };
}

export function calcularCaja({
  entradas,
  salidas,
  salidaDigitalExtra = 0,
  comisionDebitoPct = 0,
  comisionCreditoPct = 0,
}: {
  entradas: Entrada[];
  salidas: Salida[];
  // Costos que no son un movimiento guardado (los gastos propios de cada
  // operativo: arriendo de equipos, transporte, viáticos). Siempre salen
  // de la cuenta.
  salidaDigitalExtra?: number;
} & Comisiones): ResumenCaja {
  return resumirCaja(
    {
      entroEfectivo: sumar(entradas.filter((e) => cajaDelPago(e.medio_pago) === "efectivo")),
      entroDigital: sumar(entradas.filter((e) => cajaDelPago(e.medio_pago) === "digital")),
      entroDebito: sumar(entradas.filter((e) => e.medio_pago === "debito")),
      entroCredito: sumar(entradas.filter((e) => e.medio_pago === "credito")),
      salioEfectivo: sumar(salidas.filter((s) => s.caja === "efectivo")),
      salioDigital: sumar(salidas.filter((s) => s.caja !== "efectivo")) + salidaDigitalExtra,
    },
    { comisionDebitoPct, comisionCreditoPct }
  );
}
