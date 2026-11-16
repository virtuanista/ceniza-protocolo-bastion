# CENIZA: Protocolo Bastión

Shooter de supervivencia por oleadas en primera persona para navegador, con universo, criaturas, armas, mapas, arte, sonido y música **originales y generados proceduralmente** (no hay ningún recurso externo con licencia de terceros salvo las fuentes de Google Fonts y las librerías listadas abajo).

Año 2061: el Consorcio Aurel liberó la *Semilla Ceniza*. Eres un Limpiador de la Brigada Bastión: aguanta oleadas de engendros, suelda puertas, compra equipo a la cápsula **LONJA** entre asaltos y derrota al **Primogénito**.

## Cómo jugar

```bash
npm install
npm run dev        # cliente en http://localhost:5173
npm run server     # servidor cooperativo en ws://localhost:8787 (solo para jugar en línea)
npm start          # compila y sirve el juego + cooperativo en http://localhost:8787
```

**Controles** (reasignables en Opciones): WASD mover · Ratón apuntar/disparar · Clic der. mira · R recargar · Shift esprintar · Espacio saltar · C/Ctrl agacharse · E interactuar (puertas, comerciante, objetivos, reanimar, reabastecer) · Q curación rápida · G granada · V golpe rápido · T soldador · 1-4 / rueda / X armas · F linterna · L listo · Tab marcador · Z soltar créditos (coop) · Enter chat (coop) · Esc pausa.

## Contenido

- **Modos**: partidas corta (4+jefe), media (7+jefe), larga (10+jefe) e interminable (jefe cada 5 oleadas). Dificultades Normal, Difícil, Suicida e Infierno.
- **Mapas**: *Estación Ceniza* (patio, almacén, laboratorio, garaje, muelle; 9 accesos de horda, 11 puertas soldables) *Hospital Santa Ermita* (pabellones, quirófanos, atrio; 8 accesos, 11 puertas) y *Metro Línea Cero* (andenes elevados con escaleras como cuellos de botella, vías con vagones, túneles en ambos extremos, vestíbulo; 9 accesos, 5 puertas).
- **7 clases** con pasivas por nivel (1–25) y 5 niveles de talentos a elegir: Asalto, Francotirador, Demolición, Apoyo, Médico, Incinerador y Electricista.
- **32 armas** (pistolas, subfusiles, fusiles, escopetas, francotiradores, ametralladora, lanzagranadas, cohetes, cargas adhesivas, lanzallamas, plasma, arcos eléctricos, haz continuo, riel, armas médicas, machete, jeringa, soldador) con cadencia, dispersión, retroceso, cargador, tipo de recarga, modelo, animación y sonido propios; 3 niveles de mejora; sistema de peso.
- **7 tipos de granada** según clase (fragmentación, racimo, clavos, adhesiva, incendiaria, EMP, médica).
- **Bestiario**: Pútrido, Pútrido Alfa (casco, arenga), Rastrero (manadas, saltos), Acechador (camuflaje, flanqueo), Vesícula (vómito ácido, explota salvo decapitación), Escupidor (ataque a distancia, mantiene distancia), Aullador (grito que rompe soldaduras y anula proyectiles), Desgarrador (sierras, furia), Coloso (furia por daño acumulado, carga) y élites.
- **Jefe El Primogénito**: 3 fases, espinas, golpe sísmico (hay que saltar), embestida contra paredes, orbes ácidos teledirigidos, invocaciones, fase de ocultación y regeneración, y ventanas de vulnerabilidad con el corazón expuesto.
- **Objetivos opcionales**: defender zona, reparar dispositivo, transportar objeto y resistir en el punto.
- **Tiempo Muerto** (tiempo bala) con talentos que interactúan con él.
- **Progresión persistente**: XP por clase, niveles, talentos, estadísticas, récords, 14 desafíos y cosméticos desbloqueables (uniformes y acabados de armas).
- **Cooperativo en línea hasta 6 jugadores**: lobby con código de sala, chat, escalado de vida/cantidad por jugadores, reanimación, curación a distancia, reabastecimiento de munición (Apoyo), créditos compartibles y derrota solo si caen todos.

## Arquitectura

| Módulo | Ruta | Responsabilidad |
|---|---|---|
| Núcleo | `src/core/` | entrada con bloqueo de puntero, bus de eventos, utilidades |
| Render | `src/render/` | renderizador (mundo + capa de arma), texturas procedurales, partículas GPU con pools, calcomanías, restos físicos, modelos de criaturas/armas/jugadores |
| Mundo / física | `src/world/` | datos de mapas, construcción con geometría fusionada por material, colisiones cilindro-AABB con rejilla espacial, raycasts, puertas, rejilla de navegación con alturas y campos de flujo (Dijkstra) |
| Armas | `src/weapons/` | definiciones, inventario/disparo/recarga/animación, proyectiles y áreas |
| IA | `src/ai/` | bestiario, gestor de enemigos (persecución, flanqueo, rodeo, especiales, estados, gore), jefe |
| Juego | `src/game/` | sesión, combate, jugador, oleadas y objetivos, economía, clases |
| Audio | `src/audio/` | síntesis offline de efectos y voces, motor 3D con reverberación, música dinámica por capas |
| Interfaz | `src/ui/` | HUD y menús |
| Guardado | `src/save/` | progreso, desafíos, cosméticos y ajustes en localStorage |
| Red | `src/net/`, `server/` | cliente WebSocket (anfitrión autoritativo) y servidor de salas |

**Rendimiento**: geometría del mapa fusionada (≈1 draw call por material), pool fijo de luces asignadas por cercanía, pools de partículas/calcomanías/restos/modelos, campos de flujo repartidos en el tiempo (un cálculo por tick), actualización de animación reducida a distancia, precompilación de shaders al cargar y pregeneración de audio en segundo plano. Con 34 engendros activos: ~1 ms de CPU de mediana por fotograma y peor fotograma <8 ms en la prueba de estrés.

## Pruebas automáticas

Con `npm run dev` (y `npm run server` para la de cooperativo) en marcha:

```bash
node tools/smoke.mjs      # partida completa: comerciante, oleadas, jefe, victoria
node tools/controls.mjs   # controles por teclado, armas, granada, curación, puertas y soldadura
node tools/ai.mjs         # navegación y ataques de la IA (MAP=hospital para el segundo mapa)
node tools/systems.mjs    # objetivos, Tiempo Muerto, interminable, guardado y menús
node tools/coop.mjs       # dos clientes reales: lobby, oleada, réplica, daño y curación
node tools/perf.mjs       # estrés de rendimiento
node tools/prof.mjs       # perfil por sistema
node tools/gallery.mjs    # capturas de armas y criaturas (CLOSE=1 NOHUD=1 AIM=1 ONLY=ar7,p9)
node tools/viewmodel.mjs  # vistas fijas del arma y las manos (ONLY=ar7 FOCUS=L,R)
```

Requieren Google Chrome instalado (usan `puppeteer-core`).

Librerías: [three.js](https://threejs.org) (MIT), [ws](https://github.com/websockets/ws) (MIT), [Vite](https://vitejs.dev) (MIT), puppeteer-core (Apache-2.0, solo pruebas). Fuentes Rajdhani y Oswald (SIL Open Font License).
