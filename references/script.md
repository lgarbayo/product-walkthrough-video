# El guion (`video/SCRIPT.md`)

El guion es lo que el usuario aprueba antes de grabar y antes de gastar créditos de voz. Sigue el formato de `references/format.md`, así que escríbelo con esta forma: luego se traduce casi línea a línea a `video.json`.

## Duración

El límite lo da el usuario (por defecto 3:00). Apunta 6 segundos por debajo. La voz marca el ritmo a unas 145 palabras por minuto y cada capítulo añade 1,6 s (entrada y pausa). Un capítulo dura `palabras / 145 * 60 + 1.6` segundos, y un vídeo de 3:00 lleva unas 400 palabras de voz. `voice.mjs --estimate` añade pausas tras cada punto y coma, así que mide en torno a un 8 % más que esta fórmula: deja ese margen al escribir. Suma los capítulos; si no caben, quita momentos enteros, nunca el formato.

## Capítulos, en orden

1. **Intro** (~10 s): el tagline como titular de dos o tres líneas, el subtítulo "Product and architecture walkthrough", el contexto (evento, empresa) y la URL desplegada.
2. **Problema** (~15 s): un titular (el hecho y después la consecuencia en gris) y de dos a cuatro tarjetas de stat. Cada una es un número grande, una línea y su fuente. Solo números con una fuente que puedas citar. Después, el flujo del producto en chips que acaba en una promesa de una línea.
3. **Arquitectura** (~15 s): un titular de una línea y el diagrama en columnas: clientes, el servidor y sus módulos, servicios y datos. Con los nombres y flechas del diagrama del README.
4. **Un capítulo por momento de la demo** (15-30 s cada uno). Es el núcleo del vídeo.
5. **Under the hood** (~20 s): una o dos diapositivas, cada una con un titular y paneles de filas etiqueta/valor. Añade un terminal cuando una salida real demuestre algo, y da el comando exacto.
6. **Cómo se construyó** (~10 s, opcional): solo si el proceso es parte de la historia.
7. **Cierre** (~5 s): el tagline (o su versión corta), la URL desplegada y la del repo o la documentación.

## Para cada capítulo

- **Nombre**: para la barra de capítulos y el eyebrow (`03 · Voice onboarding`).
- **Titular**: dos frases cortas, la acción del usuario y el resultado ("She talks. / The profile builds itself.").
- **Ruta**: la ruta o la llamada a la API que se ve (`/onboarding`, `POST /api/agent`).
- **Behind the screen**: dos o tres tarjetas, cada una con una etiqueta monoespaciada (el componente, modelo o regla) y una o dos líneas. El término clave en negrita y cifras reales sacadas del código, de los tests o de una medición. Anota en un comentario de dónde sale cada número (`<!-- src/lib/agent.ts:42 -->`).
- **Nota de honestidad**: cuando algo de la pantalla está escenificado ("Microphone input simulated for this recording", "Mock mode: answers are recorded fixtures").
- **Voz**: el texto exacto, en frases cortas y declarativas. Primero qué hace el usuario, luego cómo funciona, con las mismas cifras que las tarjetas. Nombra en la voz el tema de cada tarjeta, porque las tarjetas aparecen en esas palabras. Una persona de los datos de demo lleva la historia. Nada de palabras de hype ni preguntas al público. Abre y cierra con el tagline.
- **Grabación**:
  - el dispositivo (`phone` o `browser`) y la ruta;
  - la etiqueta visible o el test id de cada elemento que se pulsa, en orden;
  - el estado que necesita el capítulo (reset, datos sembrados, modo demo);
  - si necesita a una persona: un login personal, 2FA, un dispositivo real o una ventana fuera del navegador.

## Al final del guion

- **Tabla de capítulos** con su duración estimada y el total frente al límite.
- **Descripción**: un párrafo de pitch y la lista de capítulos con marcas de tiempo, para YouTube.
- **Checklist de grabación**: cuentas de prueba listas, datos sembrados, nada de secretos ni datos personales reales en pantalla.
- **Cifras pendientes**: las que aún no has podido comprobar, para que el usuario las confirme o se quiten.

## Al enseñárselo al usuario

Resume en el chat la duración estimada, los capítulos y las decisiones abiertas: qué momento de la demo se queda fuera si no cabe, si va con música y con qué pista, y las cifras sin comprobar. El guion completo está en el fichero. No sigas hasta que lo apruebe.
