# Formato fijo, piel del producto

Cada vídeo comparte el mismo **formato** y lleva una **piel** distinta.

- **Formato** (fijo, este fichero): capítulos, rejilla, layout de capítulo, movimiento, voz, música y duración. Sale del vídeo de referencia https://youtu.be/6f3wKt45Vrc (4:28, 16:9). En `assets/style/` hay un fotograma de cada tipo de escena con la misma composición, renderizado sin piel desde `assets/video.example.json`. Úsalos como referencia de **composición y ritmo**: dónde va cada cosa, qué tamaño tiene y en qué orden aparece.
- **Piel** (por producto): fondo, paleta, tipografía, claro u oscuro y el motivo de marca. Sale de la dirección de diseño del propio producto, igual que su interfaz. La piel de la referencia (blanco roto cálido, orbe pastel difuminado, Inter) es de ese producto: no la reutilices, ni tampoco la de un vídeo anterior.

El vídeo es un **walkthrough de producto y arquitectura**, sereno y exacto. Enseña la app real y, a su lado, lo que pasa detrás de cada pantalla. Sin hype ni caras. Si hay que recortar para cumplir la duración, se recortan capítulos, nunca el formato.

## Formato

### Estructura

| # | Capítulo | Duración (en un vídeo de 3:00) | Qué hay en pantalla |
|---|---|---|---|
| 1 | **Intro** | 0:00-0:10 | El logo y después el tagline como titular de dos o tres líneas, con el motivo de la piel. Subtítulo: "Product and architecture walkthrough". Pie: el contexto a la izquierda (evento, empresa o "Product walkthrough") y la URL desplegada a la derecha. Ver `01-title.jpg`. |
| 2 | **Problema** | ~0:15 | Eyebrow "The problem". Titular: el hecho y después la consecuencia en el color secundario. De dos a cuatro tarjetas de stat: un número grande, una línea y la fuente en letra pequeña. Debajo, el flujo del producto como fila de chips que acaba en una píldora sólida con la promesa. Ver `02-problem.jpg`. |
| 3 | **Arquitectura** | ~0:15 | Eyebrow "Architecture". Titular de una línea ("One Next.js server. Three external services."). El diagrama se construye caja a caja, sincronizado con la voz: clientes → servidor (con sus módulos) → servicios y datos. Ver `03-architecture.jpg`. |
| 4..n | **Un capítulo por momento de la demo** | 15-30 s cada uno | El layout de capítulo de abajo. Ver `04-chapter.jpg`. |
| n+1 | **Under the hood** | ~0:20 | Dos o tres diapositivas de titular + tarjetas ("Claude where it adds value. Code where it must be exact."). Las tarjetas se construyen fila a fila. Un terminal real cuando demuestra algo (un cliente MCP, una pasada de tests). Ver `05-under-the-hood.jpg` y `06-terminal.jpg`. |
| n+2 | **Cómo se construyó** *(opcional)* | ~0:10 | Una línea de tiempo del proceso y una fila de tarjetas con números: horas, tests, versiones y los números clave del producto. Solo cuando el proceso es parte de la historia: un hackathon, un build en público, un público técnico. Ver `07-built.jpg`. |
| n+3 | **Cierre** | ~0:05 | El logo, el tagline (o su versión corta) con el motivo de la piel, y dos píldoras: la URL desplegada (sólida) y la URL del repo o de la documentación (con borde). Ver `08-closing.jpg`. |

Para la descripción de YouTube: un párrafo de pitch y la lista de capítulos con marcas de tiempo (`0:00 Intro`, `0:43 Profile`...). YouTube exige que cada capítulo dure al menos 10 s.

### El layout de capítulo (el núcleo del vídeo)

- **Izquierda, en torno al 40 %**: la app real, grabada, dentro de un marco de dispositivo. Un marco de móvil para apps mobile-first y uno de navegador minimalista para apps de escritorio; cada capítulo puede usar el suyo. Nunca un mockup falso, y nunca un still cuando se puede enseñar el flujo real en movimiento. Las grabaciones de escritorio usan un viewport de 1024-1280 px, que el marco escala a ~0,66: mejor el marco de móvil o una pantalla poco densa.
- **Derecha, en torno al 60 %**, alineado arriba:
  1. Eyebrow: `NN · Nombre del capítulo` en texto secundario pequeño (`02 · Voice onboarding`).
  2. Titular grande en dos frases cortas: la acción del usuario y después el resultado ("She talks. / The profile builds itself."). Variante: la segunda frase en el color secundario.
  3. Una píldora en monoespaciada con la ruta o la llamada a la API que se ve en pantalla (`● /onboarding`, `POST /api/agent`).
  4. "BEHIND THE SCREEN" en versalitas pequeñas y debajo tarjetas que aparecen una a una cuando la voz llega a ellas. Cada tarjeta lleva a la izquierda una etiqueta monoespaciada (el componente, el modelo o la regla: `Browser`, `Claude Haiku`, `Measured`, `Fallback`) y a la derecha una o dos líneas con **el término clave en negrita**, cifras exactas y `código en línea`.
- **Abajo**: una nota de honestidad cuando algo de la grabación está escenificado (`● Microphone input simulated for this recording`, `● Test mode: nothing is charged`), y una barra de progreso con todos los capítulos y el actual marcado.

### Rejilla, escala tipográfica y movimiento

- 16:9, render a 1920x1080 (mínimo 1280x720), 30 fps. Márgenes laterales de 120 px. Tamaños y posiciones están en `compose.mjs` y no cambian con la piel.
- Una sola familia sans para todo, con titulares grandes y tracking ajustado. La monoespaciada solo para rutas, código, etiquetas y valores.
- Movimiento: fundidos y deslizamientos cortos (200-400 ms), con los elementos apareciendo en el orden en que la voz los nombra. El diagrama, las listas de tarjetas y el motivo se construyen; nunca aparecen de golpe. Nada de zooms, barridos, glitches, 3D ni transiciones de stock.
- Sin subtítulos incrustados: el SRT se sube junto al vídeo.

## Piel

La piel es todo lo que el formato deja abierto: fondo, colores, fuentes, claro u oscuro, radio de esquinas, profundidad y el motivo de marca. Vive en `video.json` como `theme` (campos en `assets/video.example.json`), y `compose.mjs` la convierte en variables CSS. Sin `theme` renderiza grises neutros sin motivo y lo dice en `report.json`.

### De dónde sale

- **Producto con interfaz**: de su sistema de diseño (un `DIRECTION.md`, `design-system.md`, tokens en `src/styles/**`, la hoja de estilos global, la config de Tailwind). La escala de neutros da el fondo, las superficies y el texto; el acento y los colores de estado dan `accents`; las fuentes del producto son las del vídeo; su firma visual da el motivo. Así la app grabada y el marco que la rodea parecen un solo producto.
- **Producto sin interfaz** (una CLI, una API, una librería): escribe una dirección corta (`video/DIRECTION.md`, como mucho 20 líneas) con:
  - un nombre para la dirección;
  - un mundo de referencia sacado del dominio del producto;
  - la paleta, con el trabajo de cada color;
  - la pareja tipográfica;
  - el motivo y qué representa;
  - las respuestas a los tests de abajo.

### Qué fija una piel

- **Fondo**: un color, o una textura discreta sacada de la dirección (una rejilla tenue para papel técnico). Nunca un degradado de fondo de pantalla.
- **Paleta**: una escala de neutros (fondo, superficies, líneas, texto, texto secundario) y como mucho cuatro acentos. Los acentos solo se usan donde significan algo: el motivo, un capítulo sobre lo que ese color representa, la sintaxis del terminal. Nunca como decoración.
- **Fuentes**: la sans y la mono del producto, en `video/fonts/` con su licencia (OFL o la del producto). Inter o la pila del sistema solo si la dirección del producto lo dice.
- **Claro u oscuro**: lo que diga la dirección. Una piel oscura necesita su propio terminal oscuro y marcos de dispositivo que sigan separándose del fondo.
- **Motivo**: un elemento dibujado en la intro y el cierre que dice qué es el producto, hecho de trazos que se dibujan solos (`pathLength="1"`) y puntos que aparecen (`data-pop`). También puede ser `orb`, si la dirección lo pide, o `none`.
- **Forma y profundidad**: una familia de radios y una sola forma de mostrar profundidad: bordes, escalones de tono o una sombra suave, nunca las tres.

### Tests (una piel que falle uno se rehace)

- **Contraste**: WCAG AA para cada token de texto sobre su superficie: 4,5:1 para texto y 3:1 para tamaño titular. `compose.mjs` lo comprueba y `report.json` lista cada fallo.
- **Personalidad**: tapa el logo. Si la piel le valdría igual a un producto de otro dominio, es genérica.
- **Nada por costumbre**: ninguna pareja tipográfica, paleta o motivo heredados de un vídeo anterior o de la referencia, salvo que la dirección del producto lo pida.
- **Nada de defaults de IA**:
  - crema cálido con serif de titular y acento terracota;
  - casi negro con acento verde neón;
  - rejilla suiza en blanco y negro con un rojo;
  - degradados morado-azul, brillos y cristal.

## Voz

- Locución con el proveedor que elija el usuario (ver "Producción de la voz"). En inglés por defecto, o en el idioma que pida el usuario; la interfaz del producto mantiene su propio idioma.
- Tono: sereno y preciso, un narrador que explica un producto y su ingeniería, a unas 145 palabras por minuto. Frases cortas y declarativas. Nada de "revolutionary" ni "seamless", y ninguna pregunta al público.
- Abre y cierra con el tagline ("This is X. Tagline. Here's the product, and how it's built." … "Tagline."). Una persona de los datos de demo lleva la historia ("Ana just talks.").
- En cada capítulo: qué hace el usuario y después cómo funciona, con **cifras reales** del código y de mediciones ("about 1.8 seconds per turn", "from 49 to 52", "twelve hundred tests run without a key").
- Dice en voz alta los límites honestos y las reglas de diseño: qué hace el modelo y qué decide el código, qué no se hace nunca, qué es mock o modo test.
- Cada capítulo dura 0,4 s de entrada, su clip y 1,2 s de pausa. A 145 ppm, un vídeo de 3:00 lleva unas 400 palabras.

### Producción de la voz

El usuario elige siempre entre cuatro proveedores (`voice.provider`). Se le presentan los cuatro, con ElevenLabs como recomendado:

- **`elevenlabs`**: la voz más natural. Se cobra a la cuenta de ElevenLabs del usuario, con su clave, y ElevenLabs devuelve los tiempos de cada carácter.
- **`kokoro`**: Kokoro-82M en local con `hyperframes tts`; gratis y sin cuenta. Voz por defecto `bm_george` (inglés británico, la más cercana a la referencia) o `ef_dora` en español.
- **`recorded`**: la voz del propio usuario, un audio por capítulo en `video/vo-takes/`.
- **`none`**: sin audio, solo tiempos estimados (un borrador silencioso).

Con Kokoro y con la voz grabada no hay tiempos por carácter: `voice.mjs` transcribe cada clip con `hyperframes transcribe` (Whisper, en local) y alinea el texto del guion con las palabras transcritas. Las que la transcripción escribe distinto ("thirty-seven" frente a "37") toman tiempos interpolados entre sus vecinas. Así las tarjetas siguen apareciendo en la palabra que las nombra, con cualquier proveedor.

Para ElevenLabs:

- **Clave**: es del usuario. Se lee de `ELEVENLABS_API_KEY`, nunca del repo, y nunca se imprime en logs, informes o commits.
- **Voz**: la de la referencia, ElevenLabs "George - Warm, Captivating Storyteller", con modelo `eleven_multilingual_v2`, stability 0.55, similarity 0.8, style 0.12 y speed 1. Se busca por nombre en la cuenta; `ELEVENLABS_VOICE_ID` o `voice.name` en `video.json` la sustituyen. No elijas otra voz por tu cuenta.
- **Sonoridad**: la voz se normaliza a -16 LUFS con pico real de -1,5 dB, con una ganancia constante y un limitador de picos. Nunca un normalizador dinámico, que bombea.
- **Bordes limpios**: los clips se generan solo con `previous_text`, porque `next_text` hace que el modelo empiece la primera palabra del clip siguiente. `compose.mjs` silencia las ráfagas sueltas en los bordes y hace fundidos de 10 y 30 ms sin cortar habla.
- **Un clip por capítulo**, nunca un fichero largo, para poder regrabar y reajustar un capítulo solo. Vale igual para Kokoro y para la voz grabada.
- **Créditos**: la generación gasta los del usuario. Primero `--dry-run`, cada clip una vez, y solo se regenera lo que está mal. Una persona lo escucha antes de publicar.

## Música (opcional)

La referencia no lleva música. Esta skill admite una cama musical discreta que baja bajo la voz; con `--no-music` (o sin `music` en `video.json`) el vídeo queda igual que la referencia.

- **La pista** la elige el usuario: un archivo suyo con licencia para publicarlo, o una pista Creative Commons buscada con `scripts/find-music.mjs` (CC0 o CC BY por defecto; la atribución queda en `music/CREDITS.md` y va en la descripción). Música tranquila y constante, sin voces ni drops grandes: acompaña la explicación, no compite con ella.
- **Duración**: si la pista es más corta que el vídeo, alárgala con `scripts/loop-music.mjs`, que empalma en los micro-silencios periódicos de la propia pista y comprueba cada costura. Si no, `compose.mjs` hace un fundido al final de la pista.
- **`video.json`**:
  ```json
  "music": { "src": "music/bed.mp3", "start": 0, "bedLufs": -22, "duckDb": 9, "pad": 0.2, "ramp": 0.35, "fadeIn": 1.5, "fadeOut": 3 }
  ```
  - `src`: la pista, relativa a `video.json`. `start`: desde qué segundo de la pista empieza.
  - `bedLufs`: el nivel de la cama donde nadie habla.
  - `duckDb`: cuánto baja bajo cada clip de voz.
  - `pad` y `ramp`: el margen y la rampa del ducking, en segundos.
  - `fadeIn` y `fadeOut`: los fundidos de entrada y salida, en segundos.
- **Cómo se mezcla**: después del render y de normalizar la voz, así que la voz conserva sus -16 LUFS. Con los valores por defecto, la música queda unos 15 dB por debajo de la voz mientras se habla. En este formato la voz casi no para (las pausas son de 1,6 s), así que ese es el nivel que más se oye.
- **El criterio es medible**: bajo cada clip, la mezcla tiene que medir como la voz sola (diferencia ≤ 1 dB, `report.json` → `music.check`). Si mide más, la música se está comiendo la locución. El pico final se queda por debajo de -1 dBTP.

## Lo que nunca entra

Material de stock, caras o avatares, emojis, listas de viñetas tipo diapositiva, interfaz falsa, secretos o datos personales reales en pantalla, afirmaciones que el código no respalde y nada que contradiga el README del producto. Tampoco efectos de sonido.
