import { describe,expect,it,vi,afterEach } from 'vitest';
import { movimientosFinanzas, resumenMovimientos, prepararRegistroFinanzas, periodoFinanzas, celdaCsv } from '../src/lib/finanzas';

const id='9df2e1b4-8aa9-4ca0-b3ac-96dd9e3ff7e8';
const operativo='ade4df6e-bf6c-41b1-9d94-14ff5cb902b0';
const vacio={cobros:[],gastos:[],retiros:[],traslados:[]};
function form(datos:Record<string,string>={}) {
  const f=new FormData();
  for(const [k,v] of Object.entries({id,tipo:'gasto',fecha:'2026-11-03',monto:'25.000',caja:'digital',descripcion:'Compra de bandejas',categoria:'otro',...datos}))f.set(k,v);
  return f;
}
afterEach(()=>vi.useRealTimers());
describe('Finanzas · efectos de dinero',()=>{
  it('un traslado se muestra una vez y conserva el total, pero afecta ambas cuentas',()=>{
    const filas=movimientosFinanzas({...vacio,traslados:[{id,fecha:'2026-11-03',tipo:'deposito',caja:'digital',monto:80000,descripcion:'Depósito del efectivo'}]});
    expect(filas).toHaveLength(1);
    expect(resumenMovimientos(filas)).toEqual({entradas:0,salidas:0,neto:0,personal:0,traslados:1});
    expect(resumenMovimientos(filas,'digital').neto).toBe(80000);
    expect(resumenMovimientos(filas,'efectivo').neto).toBe(-80000);
  });
  it('un gasto pagado personalmente no reduce la caja; su devolución sí, una sola vez',()=>{
    const filas=movimientosFinanzas({...vacio,gastos:[{id,fecha:'2026-11-02',monto:30000,caja:'personal',descripcion:'Equipo'}],
      traslados:[{id:'d',fecha:'2026-11-03',monto:20000,caja:'digital',tipo:'devolucion',descripcion:'Reintegro parcial'}]});
    expect(resumenMovimientos(filas)).toMatchObject({entradas:0,salidas:20000,neto:-20000,personal:30000});
    expect(resumenMovimientos(filas,'personal').neto).toBe(0);
  });
  it('distingue ventas, sueldos, aportes, retiros y ahorro sin sumar el costo dos veces',()=>{
    const filas=movimientosFinanzas({...vacio,cobros:[{id:'c',fecha:'2026-11-03T23:00:00Z',monto:100000,medio_pago:'debito',venta_id:'venta'}],
      retiros:[{id:'r',fecha:'2026-11-03',monto:20000,caja:'digital',persona:'madre',operativo_id:operativo,es_sueldo:true},
        {id:'a',fecha:'2026-11-03',monto:-10000,caja:'digital',persona:'pablo',operativo_id:null},
        {id:'s',fecha:'2026-11-03',monto:5000,caja:'efectivo',persona:'ahorro',operativo_id:operativo}]});
    expect(filas.map(f=>f.tipo).sort()).toEqual(['ahorro','aporte','cobro','sueldo']);
    expect(resumenMovimientos(filas)).toMatchObject({entradas:110000,salidas:25000,neto:85000});
  });
  it('usa el día chileno en el historial, incluyendo cobros cerca de medianoche UTC',()=>{
    const [f]=movimientosFinanzas({...vacio,cobros:[{id,fecha:'2026-11-04T02:59:59Z',monto:100,medio_pago:null,venta_id:'venta'}]});
    expect(f.fecha).toBe('2026-11-03');
    expect(f.efectivo).toBe(100);
    expect(f.nota).toContain('Sin medio de pago');
  });
});
describe('Finanzas · registro seguro',()=>{
  it('acepta pesos con miles, conserva el origen personal y nunca los asigna a la caja bancaria',()=>{
    const r=prepararRegistroFinanzas(form({caja:'personal'}),'2026-11-03');
    expect(r).toMatchObject({movimiento:{monto:25000,caja:'personal',tabla:'gastos_globales',operativo_id:null}});
  });
  it('un aporte se ingresa en positivo en pantalla y se guarda con su signo contable',()=>{
    expect(prepararRegistroFinanzas(form({tipo:'aporte',persona:'pablo',operativo_id:operativo}),'2026-11-03')).toMatchObject({movimiento:{monto:-25000,es_sueldo:false,persona:'pablo',operativo_id:operativo}});
  });
  it('exige operativo para un sueldo, adelanto o ahorro y rechaza personas u orígenes inventados',()=>{
    for(const tipo of ['sueldo','retiro','aporte','ahorro']) expect(prepararRegistroFinanzas(form({tipo,persona:'pablo'}),'2026-11-03')).toHaveProperty('error');
    expect(prepararRegistroFinanzas(form({tipo:'sueldo',persona:'madre',operativo_id:operativo}),'2026-11-03')).toMatchObject({movimiento:{es_sueldo:true,operativo_id:operativo}});
    for(const datos of [{tipo:'sueldo',persona:'pablo',operativo_id:operativo,caja:'personal'},{tipo:'aporte',persona:'ahorro'},{tipo:'aporte',persona:'otra'},{caja:'desconocida'}] as Record<string,string>[])expect(prepararRegistroFinanzas(form(datos),'2026-11-03')).toHaveProperty('error');
  });
  it('no acepta un monto vacío, decimal, negativo, desbordado, cero o una fecha imposible/futura',()=>{
    for(const monto of ['', '1,5','1.5','-5000','9007199254740992','0'])expect(prepararRegistroFinanzas(form({monto}),'2026-11-03')).toHaveProperty('error');
    for(const fecha of ['2026-11-04','2026-02-30',''])expect(prepararRegistroFinanzas(form({fecha}),'2026-11-03')).toHaveProperty('error');
  });
  it('evita disfrazar un gasto general como un abono de Fides, marcos o costos del operativo',()=>{
    for(const descripcion of ['Fides · Sede','Marcos · Sede','Costo operativo · costo_equipos · Sede'])expect(prepararRegistroFinanzas(form({descripcion}),'2026-11-03')).toHaveProperty('error');
  });
  it('normaliza meses inválidos sin aceptar sintaxis de consulta y mantiene los límites del mes',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-04T02:00:00Z'));
    expect(periodoFinanzas('2026-02')).toEqual({mes:'2026-02',desde:'2026-02-01',hasta:'2026-02-28'});
    expect(periodoFinanzas('2026-99')).toMatchObject({mes:'2026-11'});
    expect(periodoFinanzas('2026-01,tenant_id.neq.x')).toMatchObject({mes:'2026-11'});
  });
  it('exporta textos con comillas y neutraliza fórmulas de Excel sin cambiar los números',()=>{
    expect(celdaCsv('Equipo "nuevo"')).toBe('"Equipo ""nuevo"""');
    for(const valor of ['=1+1','+SUM(A1)','-2+3','@cmd','\t=1'])expect(celdaCsv(valor)).toContain("'");
    expect(celdaCsv(-25000)).toBe('"-25000"');
  });
});
