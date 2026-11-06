import {describe,expect,it} from 'vitest';
import {costoPorChequeo,leerTurno,totalPresupuesto} from '@/lib/agenda-terreno';
import {correoDeAcceso,esPilotoTerreno,PILOTO_TERRENO} from '@/lib/piloto-terreno';

const id='00000000-0000-4000-8000-000000000001';
function datos(cambios: Record<string,string> = {}) {
  const form = new FormData();
  for(const [k,v] of Object.entries({id,nombre:'Sede norte',direccion:'Av. Central 1',fecha:'2026-11-10',
    inicio:'09:00',fin:'13:00',vendedora:id,tecnologo:id,coordinador:id,kit:id,meta:'25',bencina:'10.000',...cambios})) form.set(k,v);
  return form;
}
describe('agenda de terreno',()=>{
  it('calcula por chequeo sin presentar cero exámenes como costo cero',()=>{
    expect(costoPorChequeo(totalPresupuesto({bencina:10000,hospedaje:20000}),25)).toBe(1200);
    expect(costoPorChequeo(30000,0)).toBeNull();
  });
  it('persiste lugar, roles y gasto en pesos',()=>{
    expect(leerTurno(datos())).toMatchObject({direccion:'Av. Central 1',meta:25,kit:id,presupuesto:{bencina:10000}});
  });
  it('rechaza horarios inválidos, días inexistentes, recursos vacíos y montos negativos',()=>{
    const casos: Record<string,string>[] = [{fin:'08:30'},{inicio:'25:00'},{fecha:'2026-02-30'},{kit:''},{viaticos:'-2'}];
    for(const cambio of casos)
      expect(()=>leerTurno(datos(cambio))).toThrow();
  });
  it('acepta un rango nocturno explícito y no lo confunde con un horario invertido',()=>{
    expect(leerTurno(datos({inicio:'21:00',fin:'08:00',fecha_fin:'2026-11-11'})).fecha_fin).toBe('2026-11-11');
  });
  it('solo el alias admin apunta al piloto y no cambia el acceso por correo',()=>{
    expect(correoDeAcceso(' ADMIN ')).toBe('piloto750293@lentia.invalid');
    expect(correoDeAcceso('Personal@ejemplo.cl')).toBe('personal@ejemplo.cl');
    expect(esPilotoTerreno(id)).toBe(false);
    expect(esPilotoTerreno(PILOTO_TERRENO)).toBe(true);
  });
});
