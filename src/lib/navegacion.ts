export type EnlaceMenu = { href: string; label: string; principal?: boolean; movil?: boolean };
const ENLACES: EnlaceMenu[] = [
  { href: '/', label: 'Inicio', principal: true, movil: true },
  { href: '/pacientes', label: 'Pacientes', principal: true },
  { href: '/ventas', label: 'Vender', principal: true, movil: true },
  { href: '/cobros', label: 'Cobros', principal: true, movil: true },
  { href: '/entregas', label: 'Entregas', principal: true },
  { href: '/ot', label: 'Órdenes', principal: true },
  { href: '/seguros', label: 'Reembolsos', principal: true },
  { href: '/caja/mercadopago', label: 'Caja MP', principal: true, movil: true },
  { href: '/operativos', label: 'Operativos' },
  { href: '/laboratorio', label: 'Laboratorio' },
  { href: '/avisos', label: 'Avisos' },
  { href: '/ot/buscar', label: 'Buscar OT' },
  { href: '/ventas/historial', label: 'Historial de ventas' },
  { href: '/boleta', label: 'Boletas' },
  { href: '/inventario', label: 'Inventario' },
  { href: '/pagos', label: 'Por pagar' },
  { href: '/reportes', label: 'Reportes' },
  { href: '/precios', label: 'Precios' },
  { href: '/configuracion', label: 'Configuración' },
  { href: '/suscripcion', label: 'Suscripción' },
];
const PERMITIDOS: Record<string, string[]> = {
  ventas: ['/pacientes', '/ventas', '/ventas/historial', '/ot', '/ot/buscar', '/cobros', '/entregas', '/avisos', '/seguros', '/configuracion'],
  clinico: ['/pacientes', '/ot', '/ot/buscar', '/inventario', '/configuracion'],
  bodega: ['/ot', '/ot/buscar', '/inventario', '/configuracion'],
};
export function menuParaRol(rol: string, mercadoPago: boolean, superadmin = false): EnlaceMenu[] {
  const nav = ENLACES.filter(n => (rol === 'admin' || PERMITIDOS[rol]?.includes(n.href))
    && (n.href !== '/caja/mercadopago' || (rol === 'admin' && mercadoPago)));
  if (!nav.some(n => n.movil) && nav.length) nav[0] = { ...nav[0], movil: true };
  return superadmin ? [...nav, { href: '/superadmin', label: 'Ópticas' }] : nav;
}
export function enlaceActivo(nav: EnlaceMenu[], pathname: string) {
  return nav.filter(n => n.href === '/' ? pathname === '/' : pathname === n.href || pathname.startsWith(n.href + '/'))
    .sort((a,b) => b.href.length - a.href.length)[0]?.href;
}
