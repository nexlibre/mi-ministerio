# Cronómetro flotante 1.1.0 — auditoría y trabajo pendiente

**Estado: integración experimental; no validada para distribución 1.1.0.**
Esta rama conserva la aplicación existente y conecta la opción de Actividad, el
canal TWA y el diario. El flujo funciona en una simulación automatizada, pero
no se han validado Chrome, permisos, gestos ni recuperación en Android real.

## Base comprobada

- La rama remota `feature/1.1.0-floating-stopwatch` apunta a `d4106a6`, igual
  que `main`. Los commits locales mencionados no estaban presentes; GitHub
  tampoco encontró `98eada6` ni `399651f` al consultarlos.
- `LauncherActivity` deriva de Android Browser Helper. El contenedor abre el
  sitio HTTPS mediante TWA; el fallback configurado es Custom Tabs. No existe
  `FloatingService`, `FloatingActivity` ni `floating-bridge` en la base original.
  En Android Browser Helper 2.6.2, `LauncherActivity` permite personalizar el
  callback y el `TwaLauncher`, pero la sesión de `TwaLauncher` es privada.
  El canal debe usar la misma sesión que abre la TWA; crear una segunda sesión
  para mensajes no conecta automáticamente con la página ya abierta.
- El cronómetro vive en el estado web cifrado, que `change()` guarda
  asíncronamente en IndexedDB y, para cuentas antiguas, sincroniza con revisión
  del servidor. El modo de contraseña bloquea al ocultar la página y elimina la
  clave de memoria. El formulario web detiene el cronómetro y solo crea el
  registro cuando el usuario confirma los detalles.
- La nueva protección identifica cada cronómetro y rechaza una finalización
  repetida o asociada a un cronómetro distinto o reanudado. Los cronómetros
  antiguos sin identificador lo reciben al finalizar. Esto es una protección en
  memoria y en el estado cifrado de la web, **no** una garantía de sincronización
  entre procesos o pestañas, ni una transacción durable entre web y Android.
- `timer-sync.ts` añade revisiones e identificadores a pausas y reanudaciones,
  detecta reintentos recientes y rechaza comandos obsoletos. La página ya usa
  esas transiciones. El historial queda dentro del estado cifrado y está limitado
  a 128 comandos: un reintento más antiguo se trata como conflicto, no se aplica.
  El resultado de la función no es una confirmación de persistencia.
- `floating-reconcile.ts` comprueba persistencia y rechaza reemplazos concurrentes;
  se probó con IndexedDB y datos cifrados ficticios. La página registra el
  transporte y puede procesar comandos para un espacio identificado, pero la
  interfaz crea una identidad y enlaza los controles; falta validar otras
  operaciones concurrentes, restauración y cambio de espacio en dispositivos.
- `floating-finish.ts` y el bloqueo nativo se conectan al formulario de
  Actividad y al descarte. Existe una prueba web integrada con nativo simulado,
  incluida pérdida de una confirmación; no sustituye pruebas de Android real.
- `FloatingTwaLauncher` usa la misma sesión para TWA y postMessage. Es código
  experimental: requiere verificar la asociación digital publicada y probar
  navegación y reconexión en un navegador y dispositivo reales.
- `FloatingService` está conectado al diario nativo y tiene una ventana
  compacta, con activación desde Actividad. El flujo nativo para permisos
  exige un token de activación; no se solicitan permisos en el lanzamiento
  normal. Falta verificar el flujo real de permisos y la interacción táctil.
  `OverlayPositionTest` comprueba límites y coordenadas relativas, no los
  gestos reales ni los insets de dispositivos Android.
- `TimerJournal` usa almacenamiento atómico fuera de las copias Android.
  Contiene identificadores opacos, marcas temporales y estado del cronómetro
  sin cifrar, no datos del perfil ni la clave. Los componentes de recuperación
  y confirmación durable aún necesitan integración y validación de extremo a
  extremo, especialmente después de restaurar una copia.

## Requisitos de validación pendientes

1. Mantener el mismo origen de navegador y IndexedDB; no sustituir la TWA por
   WebView. Diseñar y probar una sesión Custom Tabs/postMessage bidireccional
   con validación de origen y asociación digital; cerrar puertos antiguos y
   verificar la sesión tras recarga, desconexión y vuelta a primer plano. No
   aceptar comandos de orígenes o sesiones no autorizados. Verificar el soporte
   real del navegador y ofrecer un estado de indisponibilidad claro.
2. Definir una autoridad del cronómetro y un protocolo con identificador de
   sesión, revisión monotónica y comandos identificados, confirmados solo tras
   persistencia durable. Evitar que una copia antigua sobrescriba pausas o
   reanudaciones; resolver explícitamente conflictos y eventos repetidos. La
   finalización debe ser idempotente y crear el registro una sola vez dentro
   del almacén cifrado. No escribir sobre un espacio bloqueado, restaurado o
   diferente. No transmitir personas, notas, claves ni contraseña al servicio.
3. Resolver el comportamiento mientras la página está bloqueada, suspendida o
   terminada: cola durable mínima, reconciliación tras desbloqueo, reinicio y
   cambio de visibilidad, y presentación de errores en vez de simular éxito.
   Establecer explícitamente qué información del cronómetro queda sin cifrar
   si Android debe seguir mostrando y controlando el tiempo mientras la web
   está bloqueada, y comprobar que no debilite la promesa de privacidad.
4. Crear la opción desactivada por defecto y sus ajustes en Actividad. Solicitar
   el permiso de superposición solo mediante una acción explícita; tratar
   cancelación, denegación y revocación. El servicio debe cumplir las
   restricciones de inicio en segundo plano, tipo de servicio y notificación de
   la versión Android objetivo; ocultar/cerrar no debe finalizar ni duplicar la
   actividad. No asumir que un permiso de notificaciones permite superposición.
5. Implementar una ventana compacta con una zona de arrastre separada de los
   controles. Escalar la ventana completa, limitar la posición al área útil y
   volver a limitarla al cambiar orientación/insets/tamaño. Persistir posición y
   ajustes; probar Cristal, Oscuro, Claro y Minimalista, opacidad y colores de
   ambos estados, y tamaño mínimo con zonas táctiles utilizables.

## Integración y limitaciones de validación

La opción de ajustes de `components/ministerio/floating-settings.tsx` está
conectada a Actividad y el servicio puede recibir preferencias visuales por el
puente. Las pruebas de renderizado comprueban que el enlace de activación
solo aparece con paquete y token válidos y conexión preparada; no comprueban que
Android lo abra ni que los controles sean usables en pantalla. El recibo de una
finalización pendiente se conserva junto al registro cifrado y no puede ser
reemplazado por otro; se reintenta al reconectar y en la prueba simulada.
El descarte también usa un recibo cifrado y bloqueo/confirmación en dos fases
sin borrar primero el diario nativo. Las instantáneas que envía el puente esperan a la cola de
escritura y exigen que el estado actual ya esté guardado; esto no resuelve todas
las carreras con restauración ni sincronización remota.

Se corrigió la recepción del puerto de Chrome: el evento `window.message`
transfiere el puerto y el saludo llega después a ese puerto. Las pruebas con
MessageChannel real verifican ese orden, pero no sustituyen Chrome en Android.
Las instantáneas y sus respuestas `sync-ready` se correlacionan con un ID; un
mensaje retrasado no puede liberar los controles ni iniciar una finalización
antes de que se haya guardado la pausa correspondiente. La prueba de la app
simula expresamente esa carrera. Los tokens de permiso se renuevan al volver a
primer plano y periódicamente para que no caduquen mientras la pantalla está
abierta. Estas medidas aún requieren validación real de Chrome y Android.

Antes de distribuir, validar la serialización de cambios de la bóveda con los
comandos del puente y la recuperación tras perder un ACK, especialmente en
Android real, junto al orden durable de cancelación y desactivación. El permiso puede ocultar y bloquear la página antes de que llegue el resultado;
la prueba simulada cubre ese caso, pero falta comprobarlo con Android y Chrome. La
reconexión y restauración requieren una fuente de verdad y resolución explícita
de conflictos, también si falla la escritura cifrada. El servicio y la UI no
se consideran integrados solo porque sus componentes compilen.

## Despliegue, firma y validación

El código web tendría que publicarse en el origen exacto de la TWA y la APK
necesitaría el código Android correspondiente: actualizar solo uno de los dos no
integra la función. Servir Digital Asset Links en `/.well-known/assetlinks.json`
con las relaciones y huellas requeridas por la TWA y el canal postMessage, y
verificar realmente el certificado de la APK y el archivo servido. El archivo
`android/assetlinks.json` del repositorio no prueba el estado del sitio publicado.
La consulta al archivo servido el 29 de octubre de 2026 encontró únicamente
`common.handle_all_urls` para el paquete original: no incluye `common.use_as_origin`
ni la variante `.testing`, por lo que no se puede dar por validado el puente.

La firma original no está disponible. Una clave diferente no actualiza la app
original del mismo paquete. Se creó una clave local nueva para el paquete
`.testing` y se verificó la firma de una APK de prueba sin la función completa.
Tras reconstruirse el entorno, el almacén de claves, su contraseña y esa APK ya
no están disponibles aquí; no debe asumirse que una clave nueva tendría la misma
huella ni podría actualizar aquella APK de prueba. No se ha comprobado que exista
una copia guardada fuera del entorno. Ninguna de las variantes presupone acceso a
los datos del navegador original. No desinstalar la aplicación original.

Para la siguiente prueba se generó otra clave local distinta y se firmó la APK
`com.pablormlopez.miministerio.testing`; su certificado SHA-256 es
`72:75:A3:38:04:41:31:15:E4:DD:87:35:CC:2C:92:9A:3F:79:56:26:EF:EC:9E:1F:FB:09:5B:4D:11:93:42:0B`.
El APK se verificó con esquemas v1/v2/v3, pero abre la web publicada anterior;
su firma no demuestra que el flotante funcione. La clave privada no está en Git
ni debe subirse. El archivo de asociación para esta huella no está publicado.

Pendiente en teléfono físico: activar y denegar/conceder el permiso; salir a otra
app; arrastrar a bordes, rotar y recuperar posición; pausar/reanudar en ambas
interfaces; volver, desbloquear y guardar una sola actividad; cerrar/reabrir,
terminar proceso, perder/reconectar canal y revocar permiso; comprobar los cuatro
estilos y el tamaño mínimo. Repetir con ambos modos de contraseña, datos antiguos
y copia restaurada. Ninguna compilación sustituye estas pruebas.
