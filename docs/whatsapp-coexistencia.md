# WhatsApp Business en coexistencia — auditoría, cambios y paso a paso

Fecha: 2026-11-21. Rama: `claude/optica-web-project-continue-vxtbyf`. **Sin publicar ni tocar producción.**

Objetivo: el WhatsApp Business de la óptica sigue funcionando en el celular, Lentia recibe los mensajes nuevos solo y deja las inscripciones «por confirmar». Lentia no envía mensajes ni llama.

## 1. Auditoría del código y de producción (antes de este cambio)

| Revisado | Encontrado | Qué se hizo |
|---|---|---|
| Alta oficial de Meta para el mismo número (coexistencia) | **No existía.** Solo había un formulario manual para pegar el `phone_number_id`, que exigía un token de sistema (`WHATSAPP_ACCESS_TOKEN`) y no hace el alta de coexistencia. | Botón «Conectar mi WhatsApp Business con Meta» con **Embedded Signup v5** (versión vigente desde 20-10-2026; en v5 la conexión de la app WhatsApp Business viene activada por defecto). El formulario manual queda como «avanzado». |
| Suscripción de mensajes | **Faltaba.** Nadie llamaba a `POST /{WABA_ID}/subscribed_apps`, así que Meta nunca avisaría a Lentia. | Se llama una vez al terminar el alta, con el token del negocio que entrega Meta. El token no se guarda. |
| Configuración del servidor | En Vercel (producción) **no hay ninguna variable de Meta**. La ruta `/api/whatsapp/webhook` ya existe, valida la firma de Meta y no exige sesión. | Variables nuevas documentadas abajo. Versión de Graph actualizada a `v27.0` (la que indica Meta). |
| No migrar ni desconectar el número | El código anterior no registraba números. | El alta **no** llama a `/register` (Meta indica omitirlo en coexistencia) y **rechaza** cualquier alta que no venga de la app WhatsApp Business (`FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` / `is_on_biz_app`). |
| Historial y agenda | El webhook procesaba el campo `history`. | Se ignoran `history` y `smb_app_state_sync`, y nunca se llama a `smb_app_data`. No se importan ni la agenda ni el historial. |
| Privacidad | La versión anterior **mandaba a Claude los últimos 30 mensajes y el nombre de perfil** para sugerir el operativo. | **Eliminado.** La detección es con reglas dentro de Lentia. Nombres, teléfonos y chats no salen de Lentia hacia ninguna IA. |
| «Solo al aprobar entra a la lista» | La versión anterior anotaba directo en la lista del operativo como «por confirmar». | Ahora las sugerencias viven en una tabla aparte (`whatsapp_sugerencias`). Solo «Aprobar» crea la fila en `inscritos_operativo`, que es la lista para llamar. |
| Duplicados | Había deduplicación por mensaje (`wamid`) y por persona. | Ahora hay una sola sugerencia pendiente por **teléfono + operativo**, y una por teléfono cuando hay duda. Si ese teléfono ya está en la lista del operativo, no se vuelve a sugerir. Todo lo garantiza la base de datos, también cuando dos avisos llegan al mismo tiempo. |
| Producción (solo lectura) | `whatsapp_numeros`, `whatsapp_chats`, `whatsapp_mensajes` e `inscritos_operativo`: todos en 0 filas. | Nada que migrar. |

Se reutiliza lo que ya funcionaba:
- el webhook con firma de Meta y el paso libre en el proxy;
- las tablas de chats y mensajes;
- la tabla `inscritos_operativo` con su regla «misma persona = mismo teléfono y nombre»;
- el interruptor «automático», el botón de pausa y la página de integraciones.

## 2. Cómo funciona ahora

1. Una persona escribe a tu WhatsApp Business. Tú lo ves y respondes en el celular como siempre.
2. Meta avisa a Lentia (`messages`). Lentia guarda el mensaje una sola vez y revisa con reglas:
   - **¿Pide inscribirse?** Busca palabras como inscribir, anotar, agendar, hora, cupo, examen o lentes, o que nombre una sede.
   - **¿Qué operativo?** Compara con el nombre del operativo, sus «Sectores que cubre» y la comuna. Si el mensaje trae una fecha (28/11, «28 de noviembre»), también la usa.
   - **¿Nombre?** Lo toma de «me llamo…», «mi nombre es…» o «soy…». Si no lo dice, usa el nombre del perfil de WhatsApp y lo marca para que lo revises.
3. Aparece en **WhatsApp → Por confirmar** con nombre, teléfono y operativo (sede y fecha).
   - Si hay duda (dos sedes el mismo día, o no dijo la sede), queda pendiente con un selector y las sedes posibles arriba.
4. **Aprobar** la pasa a la lista para llamar del operativo. **Descartar** no inscribe a nadie.
5. Tus respuestas desde el celular se guardan como contexto del chat, pero nunca crean sugerencias.

## 3. Pruebas con datos ficticios (todas pasan)

- `tests/whatsapp-flujo-real.test.ts`: de punta a punta con el código real y Postgres local.
  - Aviso firmado → webhook → detección → base de datos → pantalla «Por confirmar» visible → «Aprobar» → aparece en la lista de Labrador y no en la de El Rosario.
  - El reenvío del mismo aviso no duplica nada.
  - Después de aprobada, un mensaje igual no vuelve a sugerir.
  - Dos sedes el mismo día: queda en duda con ambas y se aprueba en la sede elegida.
  - No se hace ninguna llamada a servicios externos.
- `tests/db/pruebas-whatsapp-sugerencias.sql` (34 comprobaciones):
  - mensaje recibido, mensaje repetido, actualización sin duplicar y dos sedes el mismo día;
  - permisos: ventas no ve ni aprueba, y otra óptica no ve ni aprueba;
  - un usuario no puede inyectar mensajes;
  - con las sugerencias apagadas, el mensaje solo se guarda;
  - la óptica sale del número que recibió el mensaje.
- `tests/db/probar.sh`: además, dos mensajes simultáneos del mismo teléfono y sede dejan dos mensajes guardados y **una** sugerencia.
- `tests/whatsapp-inscripcion.test.ts`: la detección (sede, dos sedes el mismo día, misma sede en dos fechas, duda, conversación normal, nombre).
- `tests/meta-alta.test.ts`: el alta llama solo a `oauth/access_token`, a la lectura del número y a `subscribed_apps`; nunca a `register`, `smb_app_data` ni `messages`. No guarda el token y rechaza números que no vienen de la app.
- `tests/whatsapp-webhook.test.ts`: firma de Meta, desafío de verificación, historial y agenda ignorados, mensajes sin teléfono saltados.

## 4. Qué falta verificar con el número real

- Que Meta permita coexistencia para tu número y país. La documentación no menciona restricciones por país.
- La forma exacta del aviso `messages` en coexistencia. Meta indica que algunos avisos traen un identificador de usuario en vez del teléfono; esos mensajes se saltan, porque sin teléfono no hay a quién llamar.
- Que tras el alta lleguen los avisos (Vercel → Logs de `/api/whatsapp/webhook`).
- Lo que Meta desactiva en la app al conectar en coexistencia, según su documentación: listas de difusión, mensajes temporales, «ver una vez» y ubicación en tiempo real en chats 1 a 1. Además desvincula los dispositivos acompañantes (WhatsApp Web y escritorio; luego se pueden volver a vincular, salvo Windows y WearOS). **Esto conviene saberlo antes de conectar.**

## 5. Paso a paso exacto en Meta (lo que tú autorizas)

Nunca pegues claves ni códigos en el chat. Todo se carga directo en Meta y en Vercel.

**A. Requisitos de la cuenta (una vez)**
1. En **business.facebook.com → Configuración del negocio → Centro de seguridad**, inicia la **verificación del negocio** de Lentia.
2. Para usar el alta oficial, la app de Lentia debe ser **Tech Provider** (o hacerse a través de un Solution Partner). En el panel de la app: **WhatsApp → Inicio rápido / Tech Provider**, sigue el alta de proveedor tecnológico.
3. Solicita **acceso avanzado** (App Review) para `whatsapp_business_management` y `whatsapp_business_messaging`.

**B. La app de Meta**
4. En **developers.facebook.com → Mis apps**, crea o abre la app de Lentia (tipo «Business») y agrega el producto **WhatsApp**.
5. **Facebook Login for Business → Configuración**: activa en *Sí* Client OAuth login, Web OAuth login, Enforce HTTPS, Embedded Browser OAuth Login, Use Strict Mode for redirect URIs y Login with the JavaScript SDK.
   - En *Allowed domains* y *Valid OAuth redirect URIs* pon `https://lentiaapp.cl/`.
6. **Facebook Login for Business → Configuraciones → Crear**: variante **WhatsApp Embedded Signup**, producto **WhatsApp Cloud API**, permisos `whatsapp_business_management` y `whatsapp_business_messaging`. Copia el **ID de configuración**.
7. **Configuración de la app → Básica**: copia el **Identificador de la app** y el **Secreto de la app**.
8. **WhatsApp → Configuración → Webhook**:
   - URL de devolución de llamada: `https://lentiaapp.cl/api/whatsapp/webhook`.
   - Token de verificación: un texto que tú inventes.
   - Suscribe los campos `messages`, `smb_message_echoes` y `account_update`.
   - **No** suscribas `history` ni `smb_app_state_sync`.
   - Este paso se completa después de publicar (punto C).

**C. Vercel (Production)**
9. Agrega estas variables y luego vuelve a publicar:
   - `NEXT_PUBLIC_META_APP_ID`: el identificador de la app.
   - `NEXT_PUBLIC_META_CONFIG_ID`: el ID de configuración.
   - `WHATSAPP_APP_SECRET`: el secreto de la app.
   - `WHATSAPP_VERIFY_TOKEN`: el mismo texto del punto 8.

**D. Conectar tu número (sin migrarlo)**
10. En el celular, actualiza **WhatsApp Business a la versión 2.24.17 o superior**.
11. En Lentia: **Configuración → Cuentas y boletas → «Conectar mi WhatsApp Business con Meta»**.
    - En la ventana de Meta elige **conectar la app de WhatsApp Business existente** (no «número nuevo») y confirma desde el celular con el código QR que te muestre.
    - Si te ofrece compartir el historial de chats, puedes decir que no: Lentia no lo usa.
12. Lentia muestra «Conectado: +56 9 …». Desde ese momento los mensajes nuevos llegan a **WhatsApp → Por confirmar**.

## 6. Para publicar (requiere tu aprobación)

1. Aplicar en Supabase la migración `supabase/migrations/20261122010000_whatsapp_coexistencia_sugerencias.sql`. Solo agrega una tabla, columnas y funciones; no cambia datos.
2. Unir la rama a `master`. Vercel publica solo.
3. Recién después: pasos C y D de Meta.
