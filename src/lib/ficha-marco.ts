export function formatoCodigoColor(color: string | null | undefined) {
  return color?.trim().toUpperCase().replace(/[\s-]+/g, "") ?? "";
}

export function prepararCodigoDeMarco(entrada: string, variante: string) {
  const codigo = entrada.trim().toUpperCase().replace(/\s+/g, " ");
  const codigoColor = formatoCodigoColor(variante);
  if (!/^[A-Z0-9 ._/#-]{1,80}$/.test(codigo) || !/[A-Z0-9]/.test(codigo)) {
    return { error: "Ingresa el código de la etiqueta." } as const;
  }
  if (codigoColor && !/^C\d{1,8}[A-Z]?$/.test(codigoColor)) {
    return { error: "Escribe el código de color como C1 o C4A." } as const;
  }
  const conVariante = codigo.match(/^(.+?)[ -]+(C[ -]*\d{1,8}[A-Z]?)$/);
  if (conVariante) {
    const colorEnCodigo = formatoCodigoColor(conVariante[2]);
    if (codigoColor && colorEnCodigo !== codigoColor) {
      return { error: `El código ya indica ${colorEnCodigo}. Revisa el color del marco.` } as const;
    }
    return { codigo, modelo: conVariante[1], codigoColor: colorEnCodigo } as const;
  }
  if (!codigoColor) return { codigo, modelo: codigo, codigoColor: null } as const;
  const sufijo = new RegExp(`${[...codigoColor].join("[ -]*")}$`);
  const modelo = codigo.replace(sufijo, "").trim();
  if (modelo && modelo !== codigo) return { codigo, modelo, codigoColor } as const;
  const completo = `${codigo} ${codigoColor}`;
  if (completo.length > 80) return { error: "El código completo admite hasta 80 caracteres." } as const;
  return { codigo: completo, modelo: codigo, codigoColor } as const;
}
