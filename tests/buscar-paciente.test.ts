import {describe,it,expect} from 'vitest';
import {coincidePaciente} from '../src/lib/buscar-paciente';
describe('búsqueda de paciente al vender',()=>{
  const p={nombre:'Fernanda González',rut:'20.812.996-1'};
  it('encuentra un RUT completo o parcial sin insertar puntos mientras se escribe',()=>{
    for(const texto of ['208129961','20.812.996-1','2081','20812996-1']) expect(coincidePaciente(p,texto)).toBe(true);
  });
  it('encuentra nombres con y sin tildes y conserva la coincidencia parcial',()=>{
    expect(coincidePaciente(p,'gonzalez')).toBe(true);
    expect(coincidePaciente(p,'FERNANDA')).toBe(true);
  });
  it('no confunde otro RUT ni un paciente sin RUT',()=>{
    expect(coincidePaciente(p,'80387040')).toBe(false);
    expect(coincidePaciente({...p,rut:null},'2081')).toBe(false);
  });
});
