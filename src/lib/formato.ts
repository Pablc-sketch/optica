// Formatos de entrada de datos. Se aplican mientras se escribe (en los
// campos del formulario) y también al guardar, para que el dato quede
// normalizado en la base aunque venga de un flujo distinto.

// Teléfono móvil chileno: +56 9 1234 5678. Acepta que se escriba con o sin
// el 56, con o sin espacios, y va armando el formato a medida que se teclea.
export function formatearTelefono(valor: string | null | undefined): string {
  if (!valor) return "";
  let digitos = valor.replace(/\D/g, "");
  if (digitos.startsWith("56")) digitos = digitos.slice(2);
  digitos = digitos.slice(0, 9);
  if (digitos.length === 0) return "";

  const partes = [digitos.slice(0, 1), digitos.slice(1, 5), digitos.slice(5, 9)].filter(Boolean);
  return `+56 ${partes.join(" ")}`;
}

// Miles con punto, como se escriben los pesos en Chile: 82000 → "82.000".
// Sin el signo $ porque se usa dentro de campos editables, donde el símbolo
// estorba al escribir; para mostrar montos ya guardados está clp().
export function formatearMonto(valor: string | number | null | undefined): string {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  return Number(digitos).toLocaleString("es-CL");
}

// Inverso de formatearMonto: "82.000" → 82000. Lo usan las server actions,
// que reciben el texto tal como quedó en el campo.
export function montoANumero(valor: FormDataEntryValue | string | null | undefined): number {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  return digitos ? Number(digitos) : 0;
}
