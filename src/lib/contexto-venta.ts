// A qué operativo queda atribuida una venta (hallazgo F01 de la auditoría
// del 08-10-2026).
//
// Antes, al elegir un paciente cuya receta venía de un operativo, la venta
// tomaba ese operativo; pero al elegir DESPUÉS a otro paciente sin
// operativo, quedaba pegado el del anterior y la venta entraba al cierre
// equivocado.
//
// Reglas:
//  1. Si quien vende fijó un operativo de jornada ("estamos en Educa"), ese
//     manda para todos los pacientes. La receta de otro operativo es solo
//     un dato: no cambia la venta en silencio.
//  2. Sin jornada fijada, el operativo es el de la receta del paciente
//     elegido, y si no tiene, ninguno (venta particular). Nunca el del
//     paciente anterior.
export type ContextoVenta = {
  operativoId: string | null;
  origen: "sesion_activa" | "receta" | "particular";
  // La receta viene de otro operativo que el de la jornada: se avisa.
  recetaDeOtroOperativo: string | null;
};

export function resolverContextoVenta(
  operativoSesion: string | null,
  operativoReceta: string | null | undefined
): ContextoVenta {
  const receta = operativoReceta ?? null;
  if (operativoSesion) {
    return {
      operativoId: operativoSesion,
      origen: "sesion_activa",
      recetaDeOtroOperativo: receta && receta !== operativoSesion ? receta : null,
    };
  }
  if (receta) return { operativoId: receta, origen: "receta", recetaDeOtroOperativo: null };
  return { operativoId: null, origen: "particular", recetaDeOtroOperativo: null };
}
