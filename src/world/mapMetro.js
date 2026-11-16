// MAPA 3: METRO LÍNEA CERO — andenes elevados, vías con vagones, túneles por ambos extremos y
// un vestíbulo con tornos. Añade verticalidad: los andenes dominan las vías pero solo tienen
// accesos por escaleras, que se convierten en cuellos de botella.
import { B, wall, stairs, crateStack, sandbags } from './mapKit.js';

export function buildMetro() {
  const boxes = [];
  const H = 7;
  const nicheZ = (x, z, w, dx) => {
    const xEnd = x + dx * 6;
    B(boxes, Math.min(x, xEnd), 0, z - w / 2 - 1, Math.max(x, xEnd), H, z - w / 2, 'concrete');
    B(boxes, Math.min(x, xEnd), 0, z + w / 2, Math.max(x, xEnd), H, z + w / 2 + 1, 'concrete');
    B(boxes, xEnd - (dx > 0 ? 0 : 1), 0, z - w / 2 - 1, xEnd + (dx > 0 ? 1 : 0), H, z + w / 2 + 1, 'concrete');
  };
  const nicheX = (x, z, w, dz) => {
    const zEnd = z + dz * 5;
    B(boxes, x - w / 2 - 1, 0, Math.min(z, zEnd), x - w / 2, H, Math.max(z, zEnd), 'tiles');
    B(boxes, x + w / 2, 0, Math.min(z, zEnd), x + w / 2 + 1, H, Math.max(z, zEnd), 'tiles');
    B(boxes, x - w / 2 - 1, 0, zEnd - (dz > 0 ? 0 : 1), x + w / 2 + 1, H, zEnd + (dz > 0 ? 1 : 0), 'tiles');
  };
  // Perímetro: túneles en los extremos de las vías y salidas de escaleras mecánicas al norte
  wall(boxes, 'z', -42, -32, 32, H, 'concrete', [[-7, 4.5], [-17, 4.5]], { t: 1 });
  wall(boxes, 'z', 42, -32, 32, H, 'concrete', [[-7, 4.5], [-17, 4.5]], { t: 1 });
  wall(boxes, 'x', -32, -42, 42, H, 'tiles', [], { t: 1 });
  wall(boxes, 'x', 32, -42, 42, H, 'tiles', [[-20, 4], [20, 4]], { t: 1 });
  nicheZ(-42, -7, 4.5, -1); nicheZ(-42, -17, 4.5, -1); nicheZ(42, -7, 4.5, 1); nicheZ(42, -17, 4.5, 1);
  nicheX(-20, 32, 4, 1); nicheX(20, 32, 4, 1);
  B(boxes, -42.5, H, -32.5, 42.5, H + 0.4, 32.5, 'concrete', { roof: true });

  // Andén norte (elevado 1 m) z -2..8.5, escaleras en extremos y en el centro hacia las vías
  B(boxes, -36, 0, -2, 36, 1, 8.5, 'tiles');
  stairs(boxes, 39, 3.25, -1, 0, 10.5, 3, 0.34, 1, 'metal');
  stairs(boxes, -39, 3.25, 1, 0, 10.5, 3, 0.34, 1, 'metal');
  stairs(boxes, 0, -5, 0, 1, 4, 3, 0.34, 1, 'metal');
  for (let x = -32; x <= 32; x += 8) if (x !== 0) B(boxes, x - 0.4, 1, 2.6, x + 0.4, H, 3.4, 'concrete');
  for (const x of [-26, -10, 10, 26]) B(boxes, x - 1.5, 1, 5.5, x + 1.5, 1.5, 6.2, 'crate'); // bancos
  // Muro entre el andén y el vestíbulo con tres puertas altas
  wall(boxes, 'x', 8.25, -42, 42, H, 'tiles', [[-24, 3, 5], [0, 3, 5], [24, 3, 5]]);
  for (const x of [-24, 0, 24]) stairs(boxes, x, 11.5, 0, -1, 3, 3, 0.34, 1, 'metal');

  // Andén sur (elevado) z -31.5..-22
  B(boxes, -36, 0, -31.5, 36, 1, -22, 'tiles');
  stairs(boxes, 39, -26.75, -1, 0, 9.5, 3, 0.34, 1, 'metal');
  stairs(boxes, -39, -26.75, 1, 0, 9.5, 3, 0.34, 1, 'metal');
  stairs(boxes, 0, -19, 0, -1, 4, 3, 0.34, 1, 'metal');
  for (let x = -32; x <= 32; x += 8) if (x !== 0) B(boxes, x - 0.4, 1, -27.4, x + 0.4, H, -26.6, 'concrete');
  B(boxes, -20.55, 1, -29.55, -19.45, 2.1, -28.45, 'crate');
  B(boxes, 13.45, 1, -24.55, 14.55, 2.1, -23.45, 'crate'); B(boxes, 13.5, 2.1, -24.5, 14.5, 3.1, -23.5, 'crate');

  // Vías: raíles bajos (pisables), pilares centrales y vagones abandonados
  for (const z of [-8, -6, -18, -16]) B(boxes, -41, 0, z - 0.06, 41, 0.14, z + 0.06, 'metal');
  for (let x = -30; x <= 30; x += 10) B(boxes, x - 0.5, 0, -12.5, x + 0.5, H, -11.5, 'concrete');
  B(boxes, -22, 0, -9.2, -2, 3.2, -4.8, 'vehicle', { tint: 0x3a5a6a });
  B(boxes, 10, 0, -19.2, 26, 3.2, -14.8, 'vehicle', { tint: 0x6a4a2a });
  crateStack(boxes, 32, -9, 1); crateStack(boxes, -32, -15, 2); sandbags(boxes, -6, -14, -2, -13);

  // Vestíbulo z 8.5..32: tornos, columnas, taquilla y salas laterales
  for (let x = -36; x <= 36; x += 4) if (Math.abs(x) > 3 && Math.abs(Math.abs(x) - 20) > 3) B(boxes, x - 1.2, 0, 17.6, x + 1.2, 1.1, 18.4, 'metal');
  for (const [x, z] of [[-12, 24], [12, 24], [-12, 13.5], [12, 13.5]]) B(boxes, x - 0.5, 0, z - 0.5, x + 0.5, H, z + 0.5, 'concrete');
  B(boxes, -4, 0, 26, 4, 1.2, 28, 'metal'); // taquilla
  crateStack(boxes, -20, 27, 2); crateStack(boxes, 20, 12.5, 1); sandbags(boxes, 5, 21, 9, 22);
  wall(boxes, 'z', -28, 20, 32, H, 'tiles', [[24, 3, 3.2]]);
  wall(boxes, 'x', 20, -42, -28, H, 'tiles', []);
  wall(boxes, 'z', 28, 20, 32, H, 'tiles', [[24, 3, 3.2]]);
  wall(boxes, 'x', 20, 28, 42, H, 'tiles', []);
  B(boxes, -40, 0, 28.5, -37, 2, 31.4, 'server'); B(boxes, 37, 0, 28.5, 40, 2, 31.4, 'server');

  const doors = [
    { id: 'm_and_w', x: -24, z: 8.25, axis: 'x', w: 3, h: 5, name: 'Acceso andén oeste' },
    { id: 'm_and_c', x: 0, z: 8.25, axis: 'x', w: 3, h: 5, name: 'Acceso andén central' },
    { id: 'm_and_e', x: 24, z: 8.25, axis: 'x', w: 3, h: 5, name: 'Acceso andén este' },
    { id: 'm_sala_w', x: -28, z: 24, axis: 'z', w: 3, h: 3.2, name: 'Sala de control' },
    { id: 'm_sala_e', x: 28, z: 24, axis: 'z', w: 3, h: 3.2, name: 'Sala eléctrica' },
  ];
  const spawns = [
    { id: 'tw1', name: 'Túnel oeste (vía 1)', pos: [-46, -7], exit: [-38, -7] },
    { id: 'tw2', name: 'Túnel oeste (vía 2)', pos: [-46, -17], exit: [-38, -17] },
    { id: 'te1', name: 'Túnel este (vía 1)', pos: [46, -7], exit: [38, -7] },
    { id: 'te2', name: 'Túnel este (vía 2)', pos: [46, -17], exit: [38, -17] },
    { id: 'esc_w', name: 'Escaleras mecánicas oeste', pos: [-20, 35], exit: [-20, 29] },
    { id: 'esc_e', name: 'Escaleras mecánicas este', pos: [20, 35], exit: [20, 29] },
    { id: 'v_ctrl', name: 'Conducto de la sala de control', pos: [-38, 22], exit: [-36, 23], vent: true },
    { id: 'v_elec', name: 'Conducto de la sala eléctrica', pos: [38, 22], exit: [36, 23], vent: true },
    { id: 'v_vias', name: 'Alcantarilla de las vías', pos: [-36, -20], exit: [-35, -19], vent: true },
  ];
  const traders = [
    { pos: [0, 22], yaw: Math.PI, name: 'Vestíbulo' },
    { pos: [-35.5, -12], yaw: Math.PI * 0.5, name: 'Vías oeste' },
    { pos: [-35, 25], yaw: Math.PI * 0.5, name: 'Sala de control' },
    { pos: [35, 25], yaw: -Math.PI * 0.5, name: 'Sala eléctrica' },
  ];
  const objectives = {
    zones: [
      { pos: [0, 3], r: 4.5, name: 'Andén norte' },
      { pos: [-25, -12], r: 4, name: 'Cruce de vías' },
      { pos: [0, -27], r: 4.5, name: 'Andén sur' },
      { pos: [0, 15], r: 4, name: 'Tornos' },
    ],
    devices: [
      { pos: [-41, 14], name: 'Cuadro eléctrico del vestíbulo' },
      { pos: [40.5, -27], name: 'Señal de vía' },
      { pos: [-33, 30.8], name: 'Consola de control' },
    ],
    carry: [
      { from: [-38, -28], to: [0, 24.5], name: 'Fusible industrial' },
      { from: [33, 30], to: [0, 3], name: 'Batería de emergencia' },
      { from: [5, -12], to: [-34, 26], name: 'Caja negra del convoy' },
    ],
  };
  const lights = [];
  for (let x = -30; x <= 30; x += 15) {
    lights.push({ pos: [x, 6.4, 3], color: 0xd8f0ff, intensity: 18, dist: 16, flicker: x === 15 ? 0.5 : 0 });
    lights.push({ pos: [x, 6.4, -27], color: 0xd8f0ff, intensity: 16, dist: 16, flicker: x === -15 ? 0.6 : 0 });
  }
  lights.push({ pos: [-36, 5, -12], color: 0xff3020, intensity: 22, dist: 18, flicker: 0.2 }, { pos: [36, 5, -12], color: 0xff3020, intensity: 22, dist: 18, flicker: 0.2 });
  lights.push({ pos: [0, 6.4, 20], color: 0xffe8c0, intensity: 24, dist: 22 }, { pos: [-24, 6.4, 14], color: 0xffe8c0, intensity: 14, dist: 16, flicker: 0.4 }, { pos: [24, 6.4, 14], color: 0xffe8c0, intensity: 14, dist: 16 });
  lights.push({ pos: [-35, 5, 26], color: 0x60ff90, intensity: 12, dist: 12 }, { pos: [35, 5, 26], color: 0x6090ff, intensity: 12, dist: 12 }, { pos: [0, 6, -12], color: 0xffa040, intensity: 14, dist: 18, flicker: 0.3 });
  const props = [
    { type: 'barrel', pos: [-14, -14] }, { type: 'barrel', pos: [30, -21] }, { type: 'barrel', pos: [-30, 11.5] }, { type: 'barrel', pos: [16, 30] },
    { type: 'fire', pos: [6, -13] }, { type: 'fire', pos: [-25, 30] },
    { type: 'corpse', pos: [2, 16] }, { type: 'corpse', pos: [-12, -10] }, { type: 'corpse', pos: [24, -10] },
  ];
  return {
    id: 'metro', name: 'Metro Línea Cero',
    desc: 'Estación subterránea: andenes elevados, vías con vagones abandonados, túneles por ambos extremos y un vestíbulo con tornos.',
    bounds: [-42, -32, 42, 32], boxes, doors, spawns, traders, objectives, lights, props,
    playerStarts: [[-3, 21.5], [3, 21.5], [-3, 20], [3, 20], [-6, 20.5], [6, 20.5]],
    fog: { color: 0x101418, density: 0.024 },
    ambient: { sky: 0x7a8494, ground: 0x4a4440, intensity: 0.5 },
    moon: { color: 0x8890a0, intensity: 0.25, dir: [0.2, -1, 0.1] },
    floor: 'concrete',
    floorAreas: [{ rect: [-42, -21.8, 42, -2.2], mat: 'dirt' }, { rect: [-42, 8.5, 42, 32], mat: 'tiles' }],
    indoor: [[-42, -32, 42, 32]],
    music: 'industrial',
  };
}
