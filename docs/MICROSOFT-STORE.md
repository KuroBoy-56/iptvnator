# MPX Player para Microsoft Store (AppX) — versión 1.5.22

Desde la 1.5.22 MPX Player tiene **dos distribuciones de Windows independientes**:

| | EXE tradicional | Microsoft Store |
| --- | --- | --- |
| Comando | `pnpm run make:app` (igual que siempre) | `pnpm run make:store` |
| Destino | NSIS (`.exe`) | AppX x64 (`.appx`) |
| Configuración | `electron-builder.json` (sin cambios) | `electron-builder.store.json` encima de la del EXE |
| Salida | `dist/executables` | `dist/store` |
| Identidad | `appId` de siempre | la de Partner Center (variables de entorno) |
| Firma | la tuya (si la usas) | sin firmar: Microsoft firma el paquete al publicarlo |
| Actualizaciones | ninguna integrada por ahora (actualizador propio más adelante) | las hace Microsoft Store |

Las dos llevan el mismo diseño, las mismas funciones y **MPV y VLC integrados** (la carpeta `bin/` completa).

## Cómo funciona `make:store`

`tools/packaging/make-store.mjs`:

1. Comprueba que estés en Windows, que la identidad de Partner Center esté completa y válida y que `bin/` tenga MPV y
   VLC (`bin/mpv/mpv.exe`, `bin/vlc/vlc.exe`, `libvlc.dll`, `libvlccore.dll`, `plugins/`; avisa si faltan `axvlc.dll`,
   `npvlc.dll` o `locale/`). Si algo falta se detiene **antes** de compilar y dice qué falta y dónde ponerlo.
2. Ejecuta `nx run electron-backend:make-store`, que reutiliza la compilación del EXE:
   - `electron-backend:build` (Angular en producción, backend, workers),
   - `electron-backend:generate-builder-metadata` (versión sincronizada con `package.json`),
   - `electron-backend:prepare-store` (`tools/packaging/prepare-store.mjs`): genera los recursos gráficos AppX y la
     configuración resuelta `dist/store-config/electron-builder.store.resolved.json`,
   - el mismo ejecutor `nx-electron:make` del EXE con `outputPath: dist/store` y
     `makerOptionsPath: apps/electron-backend/src/app/options/maker.store.options.json`.
3. Verifica que haya un `.appx` en `dist/store` y que `dist/store/win-unpacked/resources/bin` tenga **los mismos
   archivos y bytes** que `bin/` (MPV y VLC completos).

Por qué la configuración se arma con un script y no solo con `extends`: Electron Builder 26 **junta** las listas al
heredar (`deepAssign` concatena arrays), así que `win.target` quedaría NSIS + AppX. El script hace que las listas de
`electron-builder.store.json` reemplacen a las del EXE, quita las secciones de otras plataformas y de NSIS, pone
`publish: null` (sin `app-update.yml`) y escribe el resultado sin `extends`. `electron-builder.json` no se toca.

Si `CSC_LINK`, `WIN_CSC_LINK` o `CSC_NAME` están definidas (el certificado del EXE), `make:store` no las pasa a esta
compilación: el paquete para la Store va sin firmar y **nunca** con un certificado autofirmado.

## Identidad de Partner Center (pendiente)

Todavía no está reservado el nombre en Partner Center, así que **no hay valores en el repositorio** y no se usa la
identidad heredada (`com.fourgray.iptvnator`). Cuando lo reserves, en Partner Center › MPX Player › Administración de
productos › **Identidad del producto** están estos datos:

| Variable | Dato de Partner Center |
| --- | --- |
| `APPX_IDENTITY_NAME` | `Package/Identity/Name` (por ejemplo `12345Empresa.MPXPlayer`) |
| `APPX_PUBLISHER` | `Package/Identity/Publisher` (empieza con `CN=`; debe ser **exactamente** igual) |
| `APPX_PUBLISHER_DISPLAY_NAME` | `Package/Properties/PublisherDisplayName` |
| `APPX_APPLICATION_ID` | Id de la aplicación dentro del paquete; lo eliges tú (letras y números, por ejemplo `MPXPlayer`) |

El **Product ID** de la Store (12 caracteres que empiezan con `9`, por ejemplo `9NBLGGH4R315`) no es ninguno de estos:
si lo pones en una variable, `make:store` lo rechaza. También rechaza valores de ejemplo (`XXXX`, `TODO`…), un
publisher sin `CN=` y la identidad de IPTVnator.

## Comandos de PowerShell (terminal de Visual Studio Code)

Ejecuta cada bloque por separado, en la carpeta del proyecto.

Instalar las dependencias (después de bajar los cambios; `electron-updater` ya no está en el lockfile):

```powershell
pnpm install --frozen-lockfile
```

Memoria para la compilación (igual que para el EXE):

```powershell
$env:NODE_OPTIONS="--max-old-space-size=4096 --max-http-header-size=32768"
```

La identidad de Partner Center (cambia los valores por los tuyos; sirven para esa ventana de la terminal):

```powershell
$env:APPX_IDENTITY_NAME="12345TuEmpresa.MPXPlayer"
```

```powershell
$env:APPX_PUBLISHER="CN=TU-PUBLISHER-DE-PARTNER-CENTER"
```

```powershell
$env:APPX_PUBLISHER_DISPLAY_NAME="Tu nombre de editor"
```

```powershell
$env:APPX_APPLICATION_ID="MPXPlayer"
```

Generar el paquete de Microsoft Store:

```powershell
pnpm run make:store
```

El EXE de siempre (no cambió):

```powershell
pnpm run make:app
```

Para no escribir la identidad cada vez, puedes guardarla en tu usuario de Windows (y abrir una terminal nueva):

```powershell
[Environment]::SetEnvironmentVariable("APPX_IDENTITY_NAME", "12345TuEmpresa.MPXPlayer", "User")
```

Para probar el `.appx` en tu equipo antes de subirlo hay que firmarlo con un certificado de prueba e instalarlo en modo
desarrollador; **ese paquete firmado no se sube a la Store**. Lo que se sube a Partner Center es el `.appx` sin firmar
de `dist/store`. Que el paquete se genere bien no significa que Microsoft lo apruebe: la certificación la hace
Partner Center.

## Recursos gráficos

`prepare-store.mjs` los genera con Sharp desde `apps/web/src/assets/icons/icon-1024.png` (no se toca el original) en
`apps/electron-backend/store/appx/` (carpeta `appx` de los recursos de compilación de la Store):

| Archivo | Tamaño | Logotipo |
| --- | --- | --- |
| `StoreLogo.png` | 50 × 50 | entero |
| `Square44x44Logo.png` | 44 × 44 | entero |
| `Square150x150Logo.png` | 150 × 150 | 100 px centrado |
| `Wide310x150Logo.png` | 310 × 150 | 100 px centrado |

Fondo transparente, mismas proporciones y transparencia del logotipo; el fondo del mosaico es `transparent`
(`appx.backgroundColor`). Idiomas del paquete: es-MX (principal), en-US, pt-BR y fr-FR (los cuatro de la app; la
ficha de la Store solo puede usar idiomas que declare el paquete).

## Permisos (capacidades) y entorno AppX

- Solo `runFullTrust` (lo pone Electron Builder): MPX Player es una app de escritorio de **plena confianza**, no una app
  UWP en contenedor, así que no se agregan `internetClient` ni `privateNetworkClientServer`: Windows no limita la red
  de las apps de plena confianza y las conexiones IPTV, M3U, EPG, panel y TMDB funcionan igual que en el EXE.
- **MPV y VLC**: van en `resources/bin` dentro del paquete (instalado en `C:\Program Files\WindowsApps\…`, de solo
  lectura). La app los encuentra igual que en el EXE (`process.resourcesPath/bin/mpv/mpv.exe` y
  `bin/vlc/vlc.exe`) y una app de plena confianza puede ejecutarlos. En el paquete de la Store se abren con la carpeta
  del usuario como directorio de trabajo (`external-player-cwd.ts`, `process.windowsStore`), porque la de instalación
  no se puede escribir; en el EXE no cambia nada. La conexión con MPV (tubería con nombre) y VLC (HTTP local) es la
  misma.
- Configuración y caché de MPV / VLC (`%APPDATA%\mpv`, `%APPDATA%\vlc`) y los datos de Electron (`%APPDATA%`): Windows
  los guarda aparte para cada app empaquetada. Si `bin/mpv` trae `portable_config`, MPV la **lee** igual, pero no
  puede escribir en ella (es de solo lectura dentro del paquete). VLC vuelve a revisar sus complementos si no trae
  `plugins.dat`.
- La base de datos (`~\.iptvnator\databases`) y las descargas van a la carpeta del usuario, como en el EXE. La versión
  Store y la EXE no comparten ajustes de Electron (cada una tiene su `%APPDATA%`), pero sí la sesión del panel.
- La app no registra protocolos, asociaciones de archivo ni inicio automático; no hace falta declararlos.

## Pantallas táctiles y lápiz (todas las distribuciones de Windows)

- `apps/web/src/app/touch/input-modality.ts` marca `<html data-input="mouse|touch|pen">` con Pointer Events (el
  último uso; en un portátil táctil cambia solo). No reemplaza eventos: un toque es un clic, sin duplicados.
- `apps/web/src/_touch.scss` (solo interacción, el diseño no cambia):
  - con el dedo se ocultan las flechas de las filas (aparecían solo con el mouse y, invisibles, tapaban el borde de
    las tarjetas); las filas se deslizan con el dedo y se detienen en una tarjeta; «Ver todo» queda visible;
  - áreas de toque de ~44 × 44 px alrededor de los controles pequeños (lupa, perfil, chips, menú superior, menú de
    perfil, «Ver todo»), sin cambiar su tamaño visible;
  - el divisor de los paneles laterales es más ancho con el dedo y no desplaza la página al arrastrarlo
    (`touch-action: none` solo ahí, nunca global);
  - `touch-action: manipulation` en enlaces, botones, tarjetas y chips (sin la espera del doble toque de zoom).
- Buscadores (`type="search"`): `inputmode="search"` y `enterkeyhint="search"`; el teclado táctil de Windows se abre
  al tocarlos y muestra la tecla de buscar.
- Ya eran táctiles: desplazamiento vertical y horizontal de listas y filas, tarjetas, canales (un toque elige; doble
  toque = doble clic; mantener pulsado = menú contextual), menús y diálogos de Material, sliders y barras de progreso
  y volumen (`input type="range"` / Material), reproductor integrado (Video.js / ArtPlayer) y arrastrar para ordenar
  (solo desde el asa).
- **Límites de MPV y VLC externos**: son ventanas nativas propias. MPV con su interfaz por defecto (OSC) responde al
  toque como a un clic (barra de progreso, pausa), pero no tiene gestos; VLC (Qt) responde al toque como mouse en sus
  botones y barras, sin gestos. El **MPV integrado** en Windows dibuja el video en una ventana nativa hija: los toques
  sobre el video los recibe MPV, no la app; los controles de la app (barra de abajo) sí son táctiles.

## Pendiente

- Reservar el nombre en Partner Center y poner la identidad (arriba).
- Probar el paquete en un Windows 11 con pantalla táctil (instalación de prueba firmada aparte) antes de enviarlo.
- x86 y ARM64: no se generan; MPV y VLC de `bin/` son x64.
