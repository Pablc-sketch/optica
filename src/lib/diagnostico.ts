// Diagnóstico refractivo que se imprime en la receta, sacado de los
// números de la graduación (no se escribe a mano):
//   esfera negativa → miopía; positiva → hipermetropía
//   cilindro distinto de 0 → astigmatismo
//   adición mayor que 0 → presbicia
type Potencias = {
  od_esfera: number | null;
  od_cilindro: number | null;
  od_add: number | null;
  oi_esfera: number | null;
  oi_cilindro: number | null;
  oi_add: number | null;
};

function deUnOjo(esfera: number | null, cilindro: number | null): string[] | null {
  if (esfera === null && cilindro === null) return null;
  const partes: string[] = [];
  if (esfera !== null && esfera < 0) partes.push("miopía");
  if (esfera !== null && esfera > 0) partes.push("hipermetropía");
  if (cilindro !== null && cilindro !== 0) partes.push("astigmatismo");
  return partes;
}

const unir = (partes: string[]) => partes.join(" y ");
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// null si la receta no tiene datos suficientes para diagnosticar.
export function diagnosticoDeReceta(r: Potencias): string | null {
  const od = deUnOjo(r.od_esfera, r.od_cilindro);
  const oi = deUnOjo(r.oi_esfera, r.oi_cilindro);
  const presbicia = (r.od_add ?? 0) > 0 || (r.oi_add ?? 0) > 0;

  const partes: string[] = [];
  if (od && oi && unir(od) === unir(oi)) {
    partes.push(od.length > 0 ? `${mayuscula(unir(od))} en ambos ojos` : "Sin alteración refractiva en ambos ojos");
  } else {
    const ojo = (nombre: string, p: string[] | null) =>
      p === null ? null : `${nombre}: ${p.length > 0 ? unir(p) : "sin alteración refractiva"}`;
    const ojos = [ojo("OD", od), ojo("OI", oi)].filter(Boolean);
    if (ojos.length > 0) partes.push(ojos.join(" · "));
  }
  if (presbicia) partes.push("Presbicia");
  return partes.length > 0 ? partes.join(" · ") : null;
}
