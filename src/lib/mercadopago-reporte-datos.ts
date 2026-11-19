// El texto se procesa solo en el servidor. Se devuelve exclusivamente un saldo.
export class ReporteMPInvalido extends Error {
 constructor(public codigo:string){super('No se pudo verificar el reporte de saldo');}
}
export function filasCSV(texto:string){
 if(texto.length>5_000_000||texto.includes('\0'))throw new ReporteMPInvalido('ARCHIVO_INVALIDO');
 const primera=texto.replace(/^\uFEFF/,'').split(/\r?\n/,1)[0];
 const separador=(primera.match(/;/g)?.length??0)>(primera.match(/,/g)?.length??0)?';':',';
 const filas:string[][]=[];let fila:string[]=[];let celda='';let comillas=false;
 const s=texto.replace(/^\uFEFF/,'');
 for(let i=0;i<s.length;i++){
  const c=s[i];
  if(c==='"'){if(comillas&&s[i+1]==='"'){celda+='"';i++;}else comillas=!comillas;}
  else if(!comillas&&c===separador){fila.push(celda);celda='';}
  else if(!comillas&&(c==='\n'||c==='\r')){if(c==='\r'&&s[i+1]==='\n')i++;fila.push(celda);if(fila.some(v=>v.trim()))filas.push(fila);fila=[];celda='';}
  else celda+=c;
  if(celda.length>100_000||fila.length>200||filas.length>100_000)throw new ReporteMPInvalido('ARCHIVO_GRANDE');
 }
 if(comillas)throw new ReporteMPInvalido('CSV_INCOMPLETO');
 fila.push(celda);if(fila.some(v=>v.trim()))filas.push(fila);
 return filas;
}
function centavos(texto:string):bigint|null{
 const s=texto.trim();if(!s)return null;
 if(!/^-?\d+(?:\.\d{1,2})?$/.test(s))throw new ReporteMPInvalido('IMPORTE_INVALIDO');
 const signo=s.startsWith('-')?BigInt(-1):BigInt(1);const [entero,decimal='']=s.replace('-','').split('.');
 const n=signo*(BigInt(entero)*BigInt(100)+BigInt(decimal.padEnd(2,'0')));
 if(n>BigInt(Number.MAX_SAFE_INTEGER)||n< -BigInt(Number.MAX_SAFE_INTEGER))throw new ReporteMPInvalido('IMPORTE_FUERA_RANGO');
 return n;
}
export function saldoDeReporteCSV(texto:string,monedaReporte:string,hastaMovimientos?:string){
 if(monedaReporte!=='CLP')throw new ReporteMPInvalido('MONEDA_NO_CONFIRMADA');
 const [encabezado,...datos]=filasCSV(texto);
 if(!encabezado||!datos.length)throw new ReporteMPInvalido('REPORTE_VACIO');
 const cab=encabezado.map(x=>x.trim().toUpperCase());
 if(new Set(cab).size!==cab.length)throw new ReporteMPInvalido('COLUMNAS_REPETIDAS');
 const indice=(c:string)=>cab.indexOf(c);
 for(const k of ['RECORD_TYPE','NET_CREDIT_AMOUNT','NET_DEBIT_AMOUNT'])if(indice(k)<0)throw new ReporteMPInvalido('FALTAN_COLUMNAS');
 let inicial:bigint|null=null;let movimientos=BigInt(0);let saldoFinal:bigint|null=null;let totalNeto:bigint|null=null;
 for(const f of datos){
  if(f.length!==cab.length)throw new ReporteMPInvalido('FILA_INCOMPLETA');
  const get=(k:string)=>indice(k)<0?'':f[indice(k)].trim();
  if(get('CURRENCY')&&get('CURRENCY')!=='CLP')throw new ReporteMPInvalido('MONEDA_MIXTA');
  const tipo=get('RECORD_TYPE').toLowerCase();
  // available_balance es informativo (pre/post retiro); no se suma como ingreso.
  if(tipo==='available_balance')continue;
  if(!['initial_available_balance','release','total'].includes(tipo))throw new ReporteMPInvalido('TIPO_NO_RECONOCIDO');
  if(tipo==='release'&&hastaMovimientos){const fecha=Date.parse(get('DATE'));if(!Number.isFinite(fecha)||fecha>Date.parse(hastaMovimientos))throw new ReporteMPInvalido('MOVIMIENTO_POSTERIOR_CORTE');}
  const credito=centavos(get('NET_CREDIT_AMOUNT'));const debito=centavos(get('NET_DEBIT_AMOUNT'));
  if(credito===null&&debito===null)throw new ReporteMPInvalido('SIN_IMPORTE');
  if((credito??BigInt(0))<BigInt(0)||(debito??BigInt(0))<BigInt(0))throw new ReporteMPInvalido('NETO_NEGATIVO');
  const neto=(credito??BigInt(0))-(debito??BigInt(0));
  if(tipo==='initial_available_balance'){if(inicial!==null)throw new ReporteMPInvalido('SALDO_INICIAL_REPETIDO');inicial=neto;}
  else if(tipo==='release')movimientos+=neto;
  else {if(totalNeto!==null)throw new ReporteMPInvalido('TOTAL_REPETIDO');totalNeto=neto;saldoFinal=centavos(get('BALANCE_AMOUNT'));}
 }
 if(inicial===null)throw new ReporteMPInvalido('FALTA_SALDO_INICIAL');
 const cierre=inicial+movimientos;
 if(totalNeto!==null&&totalNeto!==cierre)throw new ReporteMPInvalido('TOTAL_NO_CUADRA');
 if(saldoFinal!==null&&saldoFinal!==cierre)throw new ReporteMPInvalido('SALDO_NO_CUADRA');
 if(cierre>BigInt(Number.MAX_SAFE_INTEGER)||cierre< -BigInt(Number.MAX_SAFE_INTEGER))throw new ReporteMPInvalido('IMPORTE_FUERA_RANGO');
 return Number(cierre)/100;
}
