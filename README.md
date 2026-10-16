# Mi Ministerio — 1.0.0

Primera versión estable de la aplicación web. Herramienta independiente y no oficial, con licencia MIT.

[Usar Mi Ministerio](https://mi-ministerio-pablo.pablormlopez.chatgpt.site)

## Acceso sencillo

Crea una contraseña de al menos ocho caracteres y confírmala. No necesitas ChatGPT,
Facebook ni una cuenta de Google. Por defecto se recuerda este dispositivo;
puedes marcar «Pedir contraseña cada vez que abra la app» al empezar o en
**Perfil → Privacidad**. Esa opción elimina la clave recordada y bloquea al salir
de la app o tras cinco minutos sin actividad. «Bloquear ahora» también elimina
el acceso recordado. La contraseña no se guarda: los datos se cifran con AES-GCM
y una clave derivada con PBKDF2. El acceso recordado utiliza una CryptoKey no exportable
en IndexedDB. Quien use ese navegador podrá abrir los datos si se recuerda el acceso.

Los espacios existentes conservan su copia cifrada y su preferencia de acceso.
Se mantiene la compatibilidad con las copias antiguas en línea, sin exigir un nuevo inicio de sesión.
Los espacios nuevos guardan los datos localmente y no los envían al servicio de cuentas.

## Interfaz y respaldo

La barra superior de la app contiene la sección, búsqueda y perfil. Se retiró el
aviso de beta. Los controles de descarga e instalación se muestran solo en la
bienvenida web, fuera del modo instalado. El código fuente está en Perfil → Privacidad.

En **Perfil → Privacidad**, puedes descargar y restaurar copias cifradas, exportar
JSON o CSV y guardar manualmente la copia cifrada en Google Drive. Google es opcional:
no hay conexión OAuth ni sincronización automática con Drive. Conserva la contraseña
y descarga copias periódicamente; borrar los datos del navegador sin respaldo causa pérdida de datos.

## Desarrollo y validación

Requiere Node.js 22.13 o posterior:

```sh
npm install
npm test
npm run build
npm run dev
```

Las pruebas cubren informes, cronómetro, lectura, cifrado, contraseña incorrecta,
API heredada, acceso recordado, bloqueo, creación sin conexión y conservación de
copias existentes. La compilación local Vite es estática; el sitio publicado usa
Vinext y conserva el backend heredado. La validación automatizada no sustituye
las pruebas en un teléfono físico.

## Android y Google Sites

La APK existente abre este mismo sitio como Trusted Web Activity y recibe los
cambios de interfaz sin reinstalación. Esta entrega actualiza el sitio y su código;
no incluye un nuevo binario Android firmado. El paquete distribuido anteriormente
mantiene su número de versión. La clave de firma no está en el repositorio.
Consulta `android/README.md` para compilar el contenedor.

`google-sites/mi-ministerio.html` permite insertar el sitio en Google Sites.
El almacenamiento dentro de un iframe puede depender de las restricciones del navegador;
para mayor fiabilidad abre la app directamente.

No incluye biometría ni avisos nativos en segundo plano. Las referencias bíblicas
abren JW Library o la Biblioteca en Línea. Se conservan los créditos y licencias de terceros.
