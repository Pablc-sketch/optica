import type { DatosRecetaImpresion } from "./receta-datos";

// Paleta de la marca (src/app/globals.css) — la misma que usa el resto de
// la app, para que el correo se sienta parte de lo mismo y no un mail
// genérico de sistema.
const BRAND = "#d97756";
const BRAND_DARK = "#b85c3e";
const CREMA = "#f0eee6";
const TINTA = "#3d3929";
const TINTA_SUAVE = "#6b6553";

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function filaDato(etiqueta: string, valor: string): string {
  return `
    <td style="padding:0 18px 0 0;">
      <p style="margin:0;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:${TINTA_SUAVE};">${escapar(etiqueta)}</p>
      <p style="margin:2px 0 0;font-size:14px;font-weight:600;color:${TINTA};">${escapar(valor)}</p>
    </td>`;
}

// Cuerpo del correo en HTML: los clientes de correo sí saben mostrar una
// tabla con bordes (a diferencia del link de Gmail, que solo manda texto
// plano), así que acá la receta queda cuadrada como una hoja carta, con la
// misma paleta de colores del resto de la app. Todo con estilos inline: los
// clientes de correo ignoran las hojas de estilo externas.
export function construirHtmlReceta(datos: DatosRecetaImpresion, saludoNombre: string): string {
  const filaObs = [
    datos.alertas.length > 0 ? `<b>${escapar(datos.alertas.join(" · "))}</b>` : null,
    ...datos.observaciones.map((o) => escapar(o)),
  ]
    .filter(Boolean)
    .join("<br>");

  return `
<div style="background:${CREMA};padding:32px 16px;font-family:Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;">
    <p style="font-size:15px;line-height:1.5;color:${TINTA};margin:0 0 20px;">
      Hola ${escapar(saludoNombre)}, aquí tienes tu receta óptica de <b>${escapar(datos.opticaNombre)}</b>.
      También va adjunta en PDF para que la guardes o la imprimes.
    </p>

    <table style="width:100%;border-collapse:separate;border-spacing:0;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(61,57,41,.12);">
      <tr>
        <td style="background:${BRAND};padding:20px 24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;">
                <p style="margin:0;font-size:17px;font-weight:700;color:#ffffff;">${escapar(datos.opticaNombre)}</p>
                ${
                  datos.opticaDireccion || datos.opticaTelefono
                    ? `<p style="margin:3px 0 0;font-size:11px;color:#ffffff;opacity:.9;">${escapar(
                        [datos.opticaDireccion, datos.opticaTelefono].filter(Boolean).join(" · ")
                      )}</p>`
                    : ""
                }
              </td>
              <td style="vertical-align:middle;text-align:right;">
                <p style="margin:0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#ffffff;">Receta óptica</p>
                <p style="margin:3px 0 0;font-size:11px;color:#ffffff;opacity:.9;">${escapar(datos.fecha)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding:20px 24px 4px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              ${filaDato("Paciente", datos.pacienteNombre)}
              ${filaDato("RUT", datos.rut)}
              ${datos.edad !== null ? filaDato("Edad", `${datos.edad} años`) : `<td></td>`}
              ${filaDato("Tipo de lente", datos.tipoVision)}
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding:16px 24px 8px;">
          <table style="width:100%;border-collapse:collapse;border:1px solid #e4e0d5;border-radius:8px;overflow:hidden;font-size:13px;">
            <tr style="background:${CREMA};">
              <th style="padding:9px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:${TINTA_SUAVE};border-bottom:1px solid #e4e0d5;"></th>
              <th style="padding:9px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:${TINTA_SUAVE};border-bottom:1px solid #e4e0d5;">Esfera</th>
              <th style="padding:9px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:${TINTA_SUAVE};border-bottom:1px solid #e4e0d5;">Cilindro</th>
              <th style="padding:9px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:${TINTA_SUAVE};border-bottom:1px solid #e4e0d5;">Eje</th>
              <th style="padding:9px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:${TINTA_SUAVE};border-bottom:1px solid #e4e0d5;">Agudeza visual</th>
            </tr>
            <tr>
              <td style="padding:10px;font-weight:700;color:${BRAND_DARK};border-bottom:1px solid #f0eee6;">OD</td>
              <td style="padding:10px;color:${TINTA};border-bottom:1px solid #f0eee6;">${escapar(datos.od.esfera)}</td>
              <td style="padding:10px;color:${TINTA};border-bottom:1px solid #f0eee6;">${escapar(datos.od.cilindro)}</td>
              <td style="padding:10px;color:${TINTA};border-bottom:1px solid #f0eee6;">${escapar(datos.od.eje)}</td>
              <td style="padding:10px;color:${TINTA};border-bottom:1px solid #f0eee6;">${escapar(datos.od.av)}</td>
            </tr>
            <tr>
              <td style="padding:10px;font-weight:700;color:${BRAND_DARK};">OI</td>
              <td style="padding:10px;color:${TINTA};">${escapar(datos.oi.esfera)}</td>
              <td style="padding:10px;color:${TINTA};">${escapar(datos.oi.cilindro)}</td>
              <td style="padding:10px;color:${TINTA};">${escapar(datos.oi.eje)}</td>
              <td style="padding:10px;color:${TINTA};">${escapar(datos.oi.av)}</td>
            </tr>
          </table>
        </td>
      </tr>

      <tr>
        <td style="padding:4px 24px 18px;font-size:12px;color:${TINTA_SUAVE};">
          DP: <b style="color:${TINTA};">${escapar(datos.dp)} mm</b> &nbsp;·&nbsp;
          Altura: <b style="color:${TINTA};">${escapar(datos.altura)} mm</b> &nbsp;·&nbsp;
          ADD: <b style="color:${TINTA};">${escapar(datos.add)}</b>
        </td>
      </tr>

      ${
        filaObs
          ? `<tr><td style="padding:14px 24px;border-top:1px solid #e4e0d5;background:${CREMA};font-size:12px;color:${TINTA};">
               <p style="margin:0 0 5px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:${TINTA_SUAVE};">Observaciones</p>
               ${filaObs}
             </td></tr>`
          : ""
      }
      ${
        datos.notas
          ? `<tr><td style="padding:14px 24px;border-top:1px solid #e4e0d5;font-size:12px;color:${TINTA};">
               <b>Notas de la receta:</b> ${escapar(datos.notas)}
             </td></tr>`
          : ""
      }
      ${
        datos.profesional
          ? `<tr><td style="padding:16px 24px;border-top:1px solid #e4e0d5;text-align:right;font-size:11px;color:${TINTA_SUAVE};">
               <p style="margin:0;font-weight:700;color:${TINTA};">${escapar(datos.profesional.nombre)}</p>
               <p style="margin:2px 0 0;">${escapar(datos.profesional.tituloProfesional)}</p>
               ${datos.profesional.rut ? `<p style="margin:2px 0 0;">RUT: ${escapar(datos.profesional.rut)}</p>` : ""}
               ${datos.profesional.registroProfesional ? `<p style="margin:2px 0 0;">Registro N.° ${escapar(datos.profesional.registroProfesional)}</p>` : ""}
             </td></tr>`
          : ""
      }
    </table>

    <p style="margin:18px 0 0;font-size:11px;color:${TINTA_SUAVE};text-align:center;">
      Enviado automáticamente por ${escapar(datos.opticaNombre)}.
    </p>
  </div>
</div>`.trim();
}
