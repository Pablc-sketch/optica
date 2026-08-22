import type { DatosRecetaImpresion } from "./receta-datos";

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Cuerpo del correo en HTML: los clientes de correo sí saben mostrar una
// tabla con bordes (a diferencia del link de Gmail, que solo manda texto
// plano), así que acá la receta queda "cuadrada" como una hoja carta, igual
// a como se ve impresa. Todo con estilos inline: los clientes de correo
// ignoran las hojas de estilo externas.
export function construirHtmlReceta(datos: DatosRecetaImpresion, saludoNombre: string): string {
  const filaObs = [
    datos.alertas.length > 0 ? `<b>${escapar(datos.alertas.join(" · "))}</b>` : null,
    ...datos.observaciones.map((o) => escapar(o)),
  ]
    .filter(Boolean)
    .join("<br>");

  return `
<div style="max-width:650px;margin:0 auto;padding:24px;font-family:Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <p style="font-size:15px;margin:0 0 16px;">Hola ${escapar(saludoNombre)},</p>
  <p style="font-size:14px;margin:0 0 20px;">Aquí tienes tu receta óptica de ${escapar(datos.opticaNombre)}. También va adjunta en PDF para que la guardes o la imprimas.</p>

  <table style="width:100%;border-collapse:collapse;border:2px solid #333;">
    <tr>
      <td style="padding:16px 16px 10px;border-bottom:2px solid #333;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="vertical-align:top;">
              <p style="margin:0;font-size:16px;font-weight:bold;">${escapar(datos.opticaNombre)}</p>
              ${
                datos.opticaDireccion || datos.opticaTelefono
                  ? `<p style="margin:2px 0 0;font-size:11px;color:#555;">${escapar(
                      [datos.opticaDireccion, datos.opticaTelefono].filter(Boolean).join(" · ")
                    )}</p>`
                  : ""
              }
            </td>
            <td style="vertical-align:top;text-align:right;">
              <p style="margin:0;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.03em;">Receta óptica</p>
              <p style="margin:2px 0 0;font-size:11px;color:#555;">${escapar(datos.fecha)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid #999;font-size:13px;">
        <b>Paciente:</b> ${escapar(datos.pacienteNombre)} &nbsp;·&nbsp;
        <b>RUT:</b> ${escapar(datos.rut)}${datos.edad !== null ? ` &nbsp;·&nbsp; <b>Edad:</b> ${datos.edad} años` : ""} &nbsp;·&nbsp;
        <b>Tipo de visión:</b> ${escapar(datos.tipoVision)}
      </td>
    </tr>
    <tr>
      <td style="padding:14px 16px 6px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="background:#eee;">
            <th style="border:1px solid #999;padding:6px 8px;text-align:left;"></th>
            <th style="border:1px solid #999;padding:6px 8px;text-align:left;">Esfera</th>
            <th style="border:1px solid #999;padding:6px 8px;text-align:left;">Cilindro</th>
            <th style="border:1px solid #999;padding:6px 8px;text-align:left;">Eje</th>
            <th style="border:1px solid #999;padding:6px 8px;text-align:left;">Agudeza visual</th>
          </tr>
          <tr>
            <td style="border:1px solid #999;padding:6px 8px;font-weight:bold;">OD</td>
            <td style="border:1px solid #999;padding:6px 8px;">${escapar(datos.od.esfera)}</td>
            <td style="border:1px solid #999;padding:6px 8px;">${escapar(datos.od.cilindro)}</td>
            <td style="border:1px solid #999;padding:6px 8px;">${escapar(datos.od.eje)}</td>
            <td style="border:1px solid #999;padding:6px 8px;">${escapar(datos.od.av)}</td>
          </tr>
          <tr>
            <td style="border:1px solid #999;padding:6px 8px;font-weight:bold;">OI</td>
            <td style="border:1px solid #999;padding:6px 8px;">${escapar(datos.oi.esfera)}</td>
            <td style="border:1px solid #999;padding:6px 8px;">${escapar(datos.oi.cilindro)}</td>
            <td style="border:1px solid #999;padding:6px 8px;">${escapar(datos.oi.eje)}</td>
            <td style="border:1px solid #999;padding:6px 8px;">${escapar(datos.oi.av)}</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:6px 16px 14px;font-size:12px;color:#333;">
        DP: ${escapar(datos.dp)} mm &nbsp;·&nbsp; Altura: ${escapar(datos.altura)} mm &nbsp;·&nbsp; <b>ADD:</b> ${escapar(datos.add)}
      </td>
    </tr>
    ${
      filaObs
        ? `<tr><td style="padding:12px 16px;border-top:1px solid #999;font-size:12px;background:#fafafa;">
             <p style="margin:0 0 4px;font-size:10px;font-weight:bold;text-transform:uppercase;letter-spacing:.03em;color:#555;">Observaciones</p>
             ${filaObs}
           </td></tr>`
        : ""
    }
    ${
      datos.notas
        ? `<tr><td style="padding:12px 16px;border-top:1px solid #999;font-size:12px;">
             <b>Notas de la receta:</b> ${escapar(datos.notas)}
           </td></tr>`
        : ""
    }
  </table>

  <p style="margin:20px 0 0;font-size:11px;color:#888;">Este correo se generó automáticamente desde ${escapar(datos.opticaNombre)}.</p>
</div>`.trim();
}
