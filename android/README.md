# Mi Ministerio para Android — 0.3.1-beta

Proyecto generado con Bubblewrap, basado en Android Browser Helper (Apache-2.0).
Abre la aplicación web existente como Trusted Web Activity (TWA).
Requiere Android 6 o posterior y un navegador compatible actualizado.
No incorpora una copia nativa independiente ni añade sincronización u offline completo.

## Compilar

Requiere JDK 17 y Android SDK Platform 36 / Build Tools 35.0.0.
Define ANDROID_HOME o crea `local.properties` con `sdk.dir=...`.

```sh
cd android
./gradlew assembleRelease
```

Produce `app/build/outputs/apk/release/app-release-unsigned.apk`.
Alinea el paquete con `zipalign` y fírmalo con `apksigner` del SDK.
La clave del propietario NO está en este repositorio. Se entregó por separado;
para actualizar la app instalada, conserva esa clave, el identificador de paquete
y aumenta `versionCode` en `app/build.gradle`.

El archivo público `assetlinks.json` debe servirse en
`https://mi-ministerio-pablo.pablormlopez.chatgpt.site/.well-known/assetlinks.json`.
Su huella SHA-256 identifica el certificado de la versión distribuida.
Si se firma con otra clave, publica su huella para validar otro paquete.
Sin la asociación válida, el navegador puede mostrar su barra de dirección.

El inicio de sesión externo se realiza en el navegador; no se capturan credenciales
mediante un WebView. La aplicación utiliza el mismo sitio y sus actualizaciones.
El almacenamiento offline y las cuentas conservan las limitaciones de la web.
Prueba en un dispositivo real instalación, apertura, sesión, guardado y reapertura
antes de considerar esta beta una versión estable.

## Variante de firma de pruebas (no es una actualización)

El parámetro `-PministerioTesting` genera el mismo contenedor TWA con el
identificador `com.pablormlopez.miministerio.testing`. No actualiza la app
original ni implica que el cronómetro flotante esté terminado. Para el
artefacto sin firmar de esta variante: `bash gradlew assembleRelease
-PministerioTesting`. Desde la raíz, `scripts/sign-testing-apk.sh` solo firma
ese identificador y comprueba la firma y alineación. Requiere `ANDROID_HOME`,
las herramientas Android y el almacén local de pruebas en `private-signing/`,
que nunca debe subirse a Git.

La verificación TWA y el puente necesitan Digital Asset Links publicados para
el paquete de pruebas y su huella. Este cambio **no** los publica. Usar otro
paquete o navegador puede afectar al acceso a datos; no desinstales la app
original ni supongas que comparte el almacenamiento sin verificarlo.

`assetlinks.testing.example.json` es solo una plantilla: sustituir el marcador
por la huella verificada de la clave realmente usada y combinarlo con las
relaciones existentes antes de cualquier publicación autorizada. La clave de
prueba anterior se perdió del entorno y su huella no corresponde a claves nuevas.
