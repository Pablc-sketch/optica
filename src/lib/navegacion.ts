export type EnlaceMenu = { href: string; label: string; principal?: boolean; movil?: boolean };
const ENLACES: EnlaceMenu[] = [
  { href: '/', label: 'Inicio', principal: true, movil: true },
  { href: '/ventas', label: 'Vender', principal: true, movil: true },
  { href: '/cobros', label: 'Cobros', principal: true, movil: true },
  { href: '/entregas', label: 'Entregas', principal: true },
  { href: '/caja', label: 'Finanzas', principal: true, movil: true },
  { href: '/pacientes', label: 'Pacientes' },
  { href: '/operativos', label: 'Operativos' },
  { href: '/ot', label: 'Órdenes' },
  { href: '/inventario', label: 'Inventario' },
  { href: '/laboratorio', label: 'Laboratorio' },
  { href: '/seguros', label: 'Reembolsos' },
  { href: '/configuracion', label: 'Configuración' },
];
const PERMITIDOS: Record<string, string[]> = {
  ventas: ['/pacientes', '/ventas', '/ventas/historial', '/ot', '/ot/buscar', '/cobros', '/entregas', '/avisos', '/seguros', '/configuracion'],
  clinico: ['/pacientes', '/ot', '/ot/buscar', '/inventario', '/configuracion'],
  bodega: ['/ot', '/ot/buscar', '/inventario', '/configuracion'],
};
export function menuParaRol(rol: string, _mercadoPago: boolean, superadmin = false): EnlaceMenu[] {
  const nav = ENLACES.filter(n => (rol === 'admin' || PERMITIDOS[rol]?.includes(n.href))
    && (n.href !== '/seguros' || rol !== 'admin'));
  if (!nav.some(n => n.movil) && nav.length) nav[0] = { ...nav[0], principal: true, movil: true };
  return superadmin ? [...nav, { href: '/superadmin', label: 'Ópticas' }] : nav;
}
export function enlaceActivo(nav: EnlaceMenu[], pathname: string) {
  const ruta = nav.some(n => n.href === '/caja') && ['/pagos','/reportes','/boleta','/seguros'].some(p => pathname === p || pathname.startsWith(p+'/')) ? '/caja' : pathname;
  return nav.filter(n => n.href === '/' ? ruta === '/' : ruta === n.href || ruta.startsWith(n.href + '/'))
    .sort((a,b) => b.href.length - a.href.length)[0]?.href;
}
