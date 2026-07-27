// Formato chileno estándar: puntos de miles en el cuerpo y guion antes del
// dígito verificador (ej. 12.345.678-9). Acepta el RUT venga como venga
// (con o sin puntos/guion, con la k en mayúscula o minúscula) y lo
// normaliza siempre al mismo formato para guardar y mostrar.
export function formatearRut(valor: string | null | undefined): string {
  if (!valor) return "";
  const limpio = valor.replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length < 2) return limpio;

  const cuerpo = limpio.slice(0, -1).replace(/^0+/, "") || "0";
  const dv = limpio.slice(-1);
  const cuerpoConPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cuerpoConPuntos}-${dv}`;
}
