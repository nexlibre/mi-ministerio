# Cronómetro flotante 1.1.0 — auditoría y trabajo pendiente

**Estado: no implementado. No desplegar ni distribuir como 1.1.0.** Esta rama
conserva la aplicación existente y añade componentes experimentales para la
ventana y el canal TWA. Todavía no existe una opción accesible en la interfaz
ni un flujo completo de activación y finalización.

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
  interfaz no crea todavía esa identidad ni controla el flujo completo. Falta
  serializar otras operaciones y tratar restauración y cambio de espacio.
- `floating-finish.ts` y el bloqueo nativo de finalización son componentes
  probados aisladamente; no están conectados al formulario de Actividad.
- `FloatingTwaLauncher` usa la misma sesión para TWA y postMessage. Es código
  experimental: requiere verificar la asociación digital publicada y probar
  navegación y reconexión en un navegador y dispositivo reales.
- `FloatingService` está conectado al diario nativo y tiene una ventana
  compacta, pero no se puede activar desde la interfaz. El flujo nativo para
  permisos existe y exige un token de activación; no se solicitan permisos en
  el lanzamiento normal. Falta la opción y sus ajustes en Actividad.
  `OverlayPositionTest` comprueba límites y coordenadas relativas, no los
  gestos reales ni los insets de dispositivos Android.
- `TimerJournal` usa almacenamiento atómico fuera de las copias Android.
  Contiene identificadores opacos, marcas temporales y estado del cronómetro
  sin cifrar, no datos del perfil ni la clave. Los componentes de recuperación
  y confirmación durable aún necesitan integración y validación de extremo a
  extremo, especialmente después de restaurar una copia.

## Diseño pendiente antes de implementar

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

## Despliegue, firma y validación

El código web tendría que publicarse en el origen exacto de la TWA y la APK
necesitaría el código Android correspondiente: actualizar solo uno de los dos no
integra la función. Servir Digital Asset Links en `/.well-known/assetlinks.json`
con las relaciones y huellas requeridas por la TWA y el canal postMessage, y
verificar realmente el certificado de la APK y el archivo servido. El archivo
`android/assetlinks.json` del repositorio no prueba el estado del sitio publicado.

La firma original no está disponible. Una clave diferente no actualiza la app
original del mismo paquete. Se creó una clave local nueva para el paquete
`.testing` y se verificó la firma de una APK de prueba sin la función completa.
No presupone acceso a los datos del navegador original, no es una entrega final
y no debe presentarse como actualización. No desinstalar la aplicación original.

Pendiente en teléfono físico: activar y denegar/conceder el permiso; salir a otra
app; arrastrar a bordes, rotar y recuperar posición; pausar/reanudar en ambas
interfaces; volver, desbloquear y guardar una sola actividad; cerrar/reabrir,
terminar proceso, perder/reconectar canal y revocar permiso; comprobar los cuatro
estilos y el tamaño mínimo. Repetir con ambos modos de contraseña, datos antiguos
y copia restaurada. Ninguna compilación sustituye estas pruebas.
