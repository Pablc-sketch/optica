// Identidad del espacio de demostración existente; nunca otorga permisos.
export const PILOTO_TERRENO = '208c5b05-6ad2-42eb-9a4d-34690f27479b';
export function esPilotoTerreno(tenantId: string | null | undefined) { return tenantId === PILOTO_TERRENO; }
export function correoDeAcceso(entrada: string) {
  const texto = entrada.trim().toLowerCase();
  return texto === 'admin' ? 'piloto750293@lentia.invalid' : texto;
}
