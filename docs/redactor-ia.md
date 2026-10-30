# Redactor de avisos

Disponible dentro de "Avisar la entrega", tanto en el operativo como en
las páginas que reutilizan RecordarEntrega. Genera borradores; el usuario
los revisa y aplica al editor de WhatsApp. No envía nada automáticamente.

El servidor exige administrador activo y suscripción. Consulta sede,
fecha, horario y nombre de la óptica por tenant_id. No consulta pacientes,
recetas, diagnósticos, ventas ni destinatarios para generar el texto.
La descripción libre no debe contener información clínica o RUT.

Se utiliza AI SDK con AI Gateway y OIDC de Vercel. Si la cuenta requiere
verificación o no tiene créditos, se muestra el error y queda disponible
una plantilla básica identificada como "sin IA". No se compran créditos
automáticamente. Puede configurarse AI_GATEWAY_MODEL con un ID vigente del
catálogo. El valor predeterminado se verificó en /v1/models el 30-10-2026.

Límite de entrada: 1.500 caracteres. Salida: 1.000 tokens. Sin reintentos
automáticos y con timeout de 25 segundos. La espera por usuario es local
a cada instancia; configurar presupuestos de Gateway para un límite
global de gasto. No se guardan prompts ni respuestas en la base de Lentia;
el procesamiento externo puede tener registros del proveedor/Gateway.

Pendiente de verificación real: generar un borrador desde una sesión
administradora del sitio. Las pruebas con mocks verifican código y
autorización, no disponibilidad ni crédito del proveedor.
