---
name: product-walkthrough-video
description: Produce un vídeo explicativo de producto (walkthrough de producto y arquitectura, 16:9, 2-5 min) con el formato del vídeo de referencia youtu.be/6f3wKt45Vrc. La app real grabada en un marco de móvil o navegador y, al lado, lo que pasa detrás de cada pantalla con cifras reales; voz en off con ElevenLabs, música opcional con ducking y render con HyperFrames. Úsala siempre que se pida un vídeo que explique o enseñe un producto, una app, una demo técnica, un "cómo funciona" o un walkthrough para YouTube, un jurado, inversores o la documentación, aunque no diga "walkthrough". No es para promos cortas con ritmo de redes, reels verticales ni vídeos con caras o avatares.
---

# Vídeo explicativo de producto

Conviertes un producto (repo + URL de la app) en un vídeo de 2-5 minutos que enseña la app real funcionando y explica, con cifras reales, qué pasa detrás de cada pantalla. El formato es fijo y sale de un vídeo de referencia; el aspecto (colores, fuentes, motivo) es el del propio producto. Tono sereno y exacto: un narrador que explica un producto y su ingeniería. Nada de hype.

Todo el trabajo pesado lo hacen tres scripts deterministas. Tu trabajo es el guion, el `video.json`, la piel y la revisión.

## Ficheros de la skill

- `references/format.md`: **léelo antes de empezar.** El formato fijo (capítulos, layout, movimiento, voz, música) y cómo se deriva la piel del producto.
- `references/script.md`: cómo escribir el guion (`video/SCRIPT.md`), que el usuario aprueba antes de grabar.
- `assets/video.example.json`: todos los tipos de escena y campos de `video.json`. Léelo una vez entero.
- `assets/style/*.jpg`: un fotograma de composición por tipo de escena, renderizado desde `assets/video.example.json` sin piel (grises neutros, producto ficticio "Fieldnote"). Son la referencia de **composición y ritmo**: no tienen colores que copiar.
- `assets/motif.example.svg`: ejemplo de motivo que se dibuja solo.
- `scripts/record.mjs`: graba la app con Playwright, una toma continua por capítulo, con el viewport del dispositivo.
- `scripts/voice.mjs`: un clip de ElevenLabs por escena, con tiempos por carácter. Solo regenera lo que cambia.
- `scripts/compose.mjs`: compone en HyperFrames, renderiza, normaliza la voz, mezcla la música y escribe el SRT, los capítulos, los fotogramas, el style-board y `report.json`.
- `scripts/find-music.mjs`: lista los audios de la máquina, o busca y descarga música Creative Commons de Openverse con su atribución.
- `scripts/loop-music.mjs` y `scripts/analyze-music.mjs`: alargan una pista sin costura audible y analizan su arco de energía. Vienen de [launch-video-kit](https://github.com/borjaperfra/launch-video-kit) (MIT, Borja Pérez Francés); los créditos completos están en `CREDITS.md`.

Lee la cabecera de cada script una vez: documenta argumentos, salidas y códigos de salida.

## Dónde vive el vídeo

En el repo del producto, en `video/`. Copia allí los tres scripts principales (y los de música si hay música) para que el vídeo se pueda reconstruir sin la skill:

```
video/
  SCRIPT.md        guion aprobado
  video.json       la especificación que leen los scripts
  record.mjs voice.mjs compose.mjs [loop-music.mjs]
  fonts/ music/ cards/ motif.svg DIRECTION.md   (los que hagan falta)
  captions.srt chapters.txt NOTES.md            (copiados de out/ al final)
  .gitignore       out/ takes/ *.mp4 *.webm *.mov *.mp3 *.wav
```

No los parchees en el proyecto. Si a un script le falta algo, rodéalo en `video.json` (un paso `eval`, otro selector, una escena `html`) y dilo en el informe. Si el arreglo es general, mejóralo en la skill.

## Procedimiento

### 1. Entender el producto
Lee el README (sobre todo el diagrama de arquitectura), la spec si la hay, el código de las pantallas que vas a enseñar y sus tests e2e (selectores, endpoints de reset y demo, modo mock). Busca el sistema de diseño (tokens, fuentes, `DIRECTION.md` o similar): de ahí sale la piel. Pregunta al usuario solo lo que no puedas deducir:
- la URL de la demo (mejor la desplegada: es lo que verá el público);
- la duración máxima (por defecto unos 3:00);
- para quién es el vídeo (YouTube, jurado, inversores, docs), que cambia qué capítulos pesan;
- si quiere música; si la quiere, un archivo suyo o qué tipo de música buscar (paso 8).

### 2. Guion → aprobación
Escribe `video/SCRIPT.md` siguiendo `references/script.md`. Cada cifra que vaya a pantalla o a la voz tiene que existir en el código, en los tests o en una medición que hayas hecho tú; anota de dónde sale. **Para aquí y enséñaselo al usuario.** La grabación lleva minutos y la voz gasta sus créditos de ElevenLabs, así que ningún paso posterior compensa un guion equivocado. Aplica sus cambios antes de seguir.

### 3. Preflight
- `ffmpeg -version`, Node 22 o superior.
- Playwright: `node -e "require.resolve('playwright')"` desde la raíz del proyecto. Si el proyecto no lo tiene, instálalo fuera del repo (`npm i --prefix <scratch>/pw playwright@<versión cuyo Chromium ya esté en ~/.cache/ms-playwright>`) y exporta `PLAYWRIGHT_MODULE=<scratch>/pw`.
- HyperFrames: `npx --yes hyperframes@<versión de compose.mjs> doctor`.
- Nada de instalaciones globales ni dependencias nuevas en el proyecto.
- Voz: `test -n "$ELEVENLABS_API_KEY"`, sin imprimirla nunca. Si falta y puedes pedir un secreto (en T3 Code: `request_secret` con `delivery: "file"`, y después `ELEVENLABS_API_KEY="$(cat <file>)" node video/voice.mjs ...` en el mismo comando), pídela una vez; si no, sigue en silencio con tiempos estimados.

### 4. La app
Comprueba la URL con `curl`. Los planes gratuitos se duermen: llama dos veces y espera. Si no hay URL, arranca el build de producción en un puerto libre con el modo demo o mock, apunta el PID y para solo ese proceso al acabar. Usa solo cuentas de prueba. Si grabas en modo mock algo que el guion promete en vivo, dilo en la nota de honestidad de la escena y en `NOTES.md`.

### 5. `video.json`
Escríbelo desde `SCRIPT.md`, una escena por capítulo y en orden. Los tipos y campos están en `assets/video.example.json`.
- **`voice`**: el texto exacto del capítulo. Los números como se dicen ("one point eight seconds").
- **`cue`**: en cada tarjeta, stat, caja, fila y línea de terminal, una frase corta copiada de la voz de esa escena, justo donde el narrador la nombra. Los elementos sin `cue` se reparten uniformemente, y se nota.
- **`device`**: `phone` para pantallas móviles y `browser` para escritorio. Un capítulo que necesite una persona (login personal, 2FA, un dispositivo real) lleva `manual` y `take: "takes/<id>.mp4"`.
- **Selectores**: `data-testid`, roles y texto visible, sacados del código y de los e2e. Pon `{"mark": "in"}` cuando la página esté lista. Cada capítulo empieza con sus propios pasos de reset/seed y su `goto`, para poder regrabarlo solo.
- **Esperas**: espera al contenido real, nunca a un skeleton. Planifica la grabación contra la voz: se acelera hasta `maxSpeed` (2x) si dura más y congela el último frame si dura menos.
- **Secretos**: nunca dentro de `video.json`; usa `{"fill": sel, "env": "VAR"}`.
- **Arquitectura**: las mismas cajas y nombres que el diagrama del README, con las flechas de izquierda a derecha.
- **Terminal**: ejecuta tú el comando y pega su salida real, recortada si hace falta, nunca inventada. Enmascara los tokens.
- **Marca y piel**: `brand.name`, `brand.logo` y `theme`, según la sección "Skin" de `references/format.md`.
- **Música** (opcional): `"music": {"src": "music/<pista>"}`; los demás campos están en `references/format.md`.

### 6. Grabar
`node video/record.mjs video/video.json`. Graba una toma por capítulo, porque en una toma larga el vídeo de Playwright se desfasa del reloj y el corte enseña el capítulo anterior; por eso cada capítulo inicia sesión y carga su estado. Tarda minutos: lánzalo en segundo plano o con un timeout largo, sin `| tail`. Si falla una escena, lee el error (nombra el paso) y `out/stills/<id>-error.png`, corrígelo y regraba solo esa con `--shots <id>`. Como mucho tres rondas; después se queda con su still y lo dices.

### 7. Voz
Primero `node video/voice.mjs video/video.json --dry-run`, que imprime los caracteres que se van a cobrar. Después sin `--dry-run`. Genera cada clip una vez y regenera (`--only <id>`) solo el que cambie de texto o suene mal. No cambies la voz ni el modelo por tu cuenta. Si el usuario no quiere gastar todavía, usa `--estimate`: sale un borrador silencioso con los mismos cortes.

### 8. Música (si la hay)
Si el usuario no quiere música, el vídeo va sin ella, como la referencia. Si la quiere, pregúntale una de dos cosas:
- **Un archivo de su máquina.** `node <skill>/scripts/find-music.mjs local` lista los audios de Música y Descargas con su duración. Ahí también salen notas de voz y locuciones, así que pregunta cuál es música y si tiene licencia para publicarla.
- **Un tipo de música para descargar.** Por ejemplo "piano ambiental tranquilo" o "lo-fi suave".
  - Busca con `find-music.mjs search "<una a tres palabras en inglés>" --min <duración del vídeo>`, en Openverse: música Creative Commons, sin clave.
  - Enséñale 3-4 candidatas con su licencia y el enlace para escucharlas, y deja que elija él: tú no puedes oírlas.
  - Descarga la elegida con `find-music.mjs get <id> --out video/music`.
  - Por defecto solo salen CC0 y CC BY. Poner música bajo un vídeo es una adaptación: ND no vale, NC impide el uso comercial y SA obligaría a licenciar el vídeo igual.
  - CC BY exige atribución. `get` la escribe en `video/music/CREDITS.md`; va en la descripción del vídeo y en `NOTES.md`.
Nunca elijas ni descargues una pista sin que el usuario la haya escogido. Si la pista dura menos que el vídeo, `compose.mjs` lo avisa: alárgala con `loop-music.mjs`, primero sin `--loop` para analizarla y luego con los puntos de corte que proponga. Escoger qué tramo se repite es una decisión musical: enséñale al usuario las opciones.

### 9. Componer y renderizar
`node video/compose.mjs video/video.json --style-dir <esta skill>/assets/style`.
- `--only id1,id2` saca una preview corta en segundos. Úsala mientras ajustas.
- **Exit 2**: te pasas de la duración. Recorta primero texto de voz y después capítulos enteros, empezando por el menos importante. No encojas el estilo: ni letra más pequeña ni ritmo más rápido.
- **Exit 1**: degradado (sin voz, stills o placeholders). Dilo en el informe.
- `--no-music` saca la versión sin música, igual que la referencia.

### 10. Revisar contra la referencia
- **Composición**: `out/style-board.png` pone cada escena junto al fotograma de referencia de su tipo. Mismo layout, márgenes, tamaños y orden de aparición; nada se desborda ni se solapa; la barra de capítulos marca el capítulo actual.
- **Piel**: la contrastas con la dirección del producto, nunca con los colores de la referencia. `report.json` trae `theme` y su lista `contrast` está vacía. Pasa los tests de `references/format.md`.
- **Fotogramas**: lee cada `out/frames/<escena>.png` a tamaño completo. La grabación enseña el resultado del que habla la voz (no el skeleton ni el estado previo al clic) y el texto de la app se lee. En pantalla no hay secretos, emails personales, toasts de error ni overlays de desarrollo.
- **Tiempos**: en `report.json` y `captions.srt`, cada tarjeta aparece cuando la voz la nombra.
- **Audio**: `report.json` → `loudness` (voz a -16 LUFS, pico por debajo de -1 dBTP) y, con música, `music.check`. Bajo cada clip la mezcla tiene que medir como la voz sola (`ok: true`, diferencia ≤ 1 dB). Si no, sube `duckDb` o baja `bedLufs`. Que la música "suene bien" lo decide una persona escuchando; que no se coma la voz lo dice el número.
- Corrige y vuelve a renderizar. Como mucho dos rondas; lo que quede, al informe.

### 11. Entregar
- Copia `out/captions.srt` y `out/chapters.txt` a `video/`.
- Escribe `video/NOTES.md` con:
  - dónde está el render y cuánto dura frente al límite;
  - una tabla de escenas: id, inicio, origen (grabada, take, still, placeholder) y voz (generada o estimada);
  - lo que le queda a la persona: tomas manuales, poner la clave, verlo entero y subirlo con el SRT y la lista de capítulos;
  - cómo reconstruirlo: comandos, URL usada y entorno.
- Haz commit solo si te lo piden, y con pathspec (`git add video && git commit -m "docs(video): ..." -- video`). Nunca subas el vídeo a ninguna plataforma.

## Degradar, nunca acabar con las manos vacías
1. **Sin clave de ElevenLabs**: tiempos estimados y borrador silencioso con los mismos cortes y el mismo SRT. En el informe, los comandos para cuando haya clave.
2. **Falla la grabación de vídeo**: stills (`--no-video`).
3. **Sin navegador o app inaccesible**: placeholders. Se renderiza igual, y la animática con tiempos sirve para grabar encima.
4. **Sin HyperFrames**: `compose.mjs --no-render`; entregas `out/hf/` y el comando para renderizar.
5. **Sin pista de música, pista no encontrada u Openverse caído**: el vídeo sale sin música, avisado en `report.json`. Openverse limita las peticiones anónimas: si devuelve un aviso de límite, espera un minuto.

## Informe final al usuario
- Nivel alcanzado (completo, silencioso, stills, animática), ruta del vídeo y duración frente al límite.
- URL de la demo usada y si era la desplegada.
- Voz (generada, parcial o estimada) y caracteres cobrados.
- Música: pista, nivel y peor diferencia de `music.check`.
- Qué revisaste y qué corregiste.
- Qué necesita a una persona.
