// Definición de mapas como datos: geometría (cajas), puertas, accesos de horda,
// puntos del comerciante, objetivos opcionales, luces y atrezo.

import { B, wall, stairs, container, crateStack, sandbags } from './mapKit.js';
import { buildMetro } from './mapMetro.js';

// ===================================================================
// MAPA 1: ESTACIÓN CENIZA — puesto avanzado industrial tomado por el Brote.
// ===================================================================
function buildEstacionCeniza() {
  const boxes = [];
  const H = 6;

  // Perímetro exterior
  wall(boxes, 'x', -38, -48, 46, 8, 'concrete', [[0, 5], [30, 5], [-40, 5]], { t: 1 });
  wall(boxes, 'x', 38, -48, 46, 8, 'concrete', [[-12, 5], [-44, 4], [40, 4]], { t: 1 });
  wall(boxes, 'z', -48, -38, 38, 8, 'concrete', [], { t: 1 });
  wall(boxes, 'z', 46, -38, 38, 8, 'concrete', [], { t: 1 });
  // Nichos de acceso de horda (callejones cerrados tras los huecos del perímetro)
  const niche = (x, z, w, dz) => { // dz: dirección hacia fuera
    const zEnd = z + dz * 5;
    B(boxes, x - w / 2 - 1, 0, Math.min(z, zEnd), x - w / 2, 8, Math.max(z, zEnd), 'concrete');
    B(boxes, x + w / 2, 0, Math.min(z, zEnd), x + w / 2 + 1, 8, Math.max(z, zEnd), 'concrete');
    B(boxes, x - w / 2 - 1, 0, zEnd - (dz > 0 ? 0 : 1), x + w / 2 + 1, 8, zEnd + (dz > 0 ? 1 : 0), 'concrete');
  };
  niche(0, -38, 5, -1); niche(30, -38, 5, -1); niche(-40, -38, 5, -1);
  niche(-12, 38, 5, 1); niche(-44, 38, 4, 1); niche(40, 38, 4, 1);

  // --- ALMACÉN (norte) x -32..8, z 14..34
  wall(boxes, 'x', 14, -32, 8, H, 'brick', [[-20, 3, 3.2], [0, 3, 3.2]]);
  wall(boxes, 'x', 34, -32, 8, H, 'brick', [[-12, 5, 4.2]]);
  wall(boxes, 'z', -32, 14, 34, H, 'brick', [[24, 3, 3.2]]);
  wall(boxes, 'z', 8, 14, 34, H, 'brick', [[28, 3, 3.2]]);
  B(boxes, -32.3, H, 13.7, 8.3, H + 0.4, 34.3, 'metal', { roof: true });
  // estanterías
  for (const [x0, x1, z] of [[-29, -16, 18.5], [-12, 4, 18.5], [-29, -20, 24], [-6, 5, 24], [-29, -16, 29.5], [-10, 4, 29.5]]) {
    B(boxes, x0, 0, z - 0.6, x1, 3.4, z + 0.6, 'shelf');
  }
  crateStack(boxes, -15, 24, 2); crateStack(boxes, -13.6, 24.2, 1); crateStack(boxes, 6, 16, 2); crateStack(boxes, -30, 32, 2);
  crateStack(boxes, -30, 16, 1); crateStack(boxes, 2, 32.5, 2);

  // --- LABORATORIO (este) x 18..44, z -20..20
  wall(boxes, 'z', 18, -20, 20, 5, 'panel', [[-8, 3, 3.1], [8, 3, 3.1]]);
  wall(boxes, 'x', 20, 18, 46, 5, 'panel', [[30, 3, 3.1]]);
  wall(boxes, 'x', -20, 18, 46, 5, 'panel', [[36, 3, 3.1]]);
  wall(boxes, 'z', 28, -20, 20, 5, 'panel', [[-14, 2.8, 3.1], [0, 2.8, 3.1], [14, 2.8, 3.1]]);
  wall(boxes, 'x', 0, 28, 46, 5, 'panel', [[38, 2.8, 3.1]]);
  B(boxes, 17.7, 5, -20.3, 46, 5.4, 20.3, 'panel', { roof: true });
  // tanques de incubación (sala NE)
  for (const [x, z] of [[33, 6], [33, 12], [39, 6], [39, 12]]) B(boxes, x - 1, 0, z - 1, x + 1, 3.2, z + 1, 'vat');
  // racks de servidores (sala SE)
  for (const z of [-5, -10, -15]) B(boxes, 31, 0, z - 0.5, 36, 2.4, z + 0.5, 'server');
  B(boxes, 39, 0, -12, 41, 1, -6, 'metal');
  // mostrador vestíbulo
  B(boxes, 21, 0, 2.5, 25, 1.1, 3.5, 'metal');
  B(boxes, 21, 0, -14, 23, 1.1, -10, 'metal');

  // --- GARAJE (oeste) x -46..-20, z -26..8
  wall(boxes, 'z', -20, -26, 8, H, 'concrete', [[-6, 5, 4.2], [4, 3, 3.2]]);
  wall(boxes, 'x', 8, -48, -20, H, 'concrete', [[-38, 3, 3.2]]);
  wall(boxes, 'x', -26, -48, -20, H, 'concrete', [[-30, 3, 3.2]]);
  B(boxes, -48, H, -26.3, -19.7, H + 0.4, 8.3, 'metal', { roof: true });
  // pilares y vehículos
  for (const [x, z] of [[-33, -16], [-33, -4], [-27, -10], [-39, -10]]) B(boxes, x - 0.4, 0, z - 0.4, x + 0.4, H, z + 0.4, 'concrete');
  B(boxes, -44, 0, -4, -40.5, 1.6, 2, 'vehicle', { tint: 0x5a6b4a }); B(boxes, -43.5, 1.6, -2.5, -41, 2.3, 1, 'vehicle', { tint: 0x5a6b4a });
  B(boxes, -30, 0, -24.5, -24, 1.7, -21.5, 'vehicle', { tint: 0x7a2a22 });
  crateStack(boxes, -44, -24, 2); crateStack(boxes, -22.5, 6, 1); crateStack(boxes, -45, 6, 2);

  // --- PASAJE NOROESTE x -48..-32, z 8..38: pequeñas coberturas
  crateStack(boxes, -40, 18, 2); crateStack(boxes, -36, 28, 1); B(boxes, -46, 0, 12, -42, 1.2, 13, 'sandbag');

  // --- PATIO CENTRAL: torre de vigilancia y coberturas
  B(boxes, -8, 0, -8, -3, 2.4, -3, 'concrete'); // plataforma
  stairs(boxes, 0.6, -5.5, -1, 0, 2, 6, 0.4, 0.6, 'metal'); // escalera al este que sube hacia la plataforma
  B(boxes, -8.2, 2.4, -8.2, -7.8, 3.4, -2.8, 'metal'); B(boxes, -8.2, 2.4, -8.2, -2.8, 3.4, -7.8, 'metal'); // barandillas
  sandbags(boxes, 4, -4, 8, -3); sandbags(boxes, 8, -4, 9, 0); sandbags(boxes, -12, 6, -8, 7);
  crateStack(boxes, 10, 8, 2); crateStack(boxes, 11.2, 8, 1); crateStack(boxes, -14, -2, 1); crateStack(boxes, 2, 10, 1);
  // camión calcinado
  B(boxes, 3, 0, 1, 11, 1.4, 4, 'vehicle', { tint: 0x2c2c2a }); B(boxes, 9, 1.4, 1.2, 11, 3, 3.8, 'vehicle', { tint: 0x2c2c2a });
  B(boxes, 3, 1.4, 1.1, 8.8, 3.1, 3.9, 'container', { tint: 0x3a4a5a });

  // --- MUELLE SUR: contenedores apilados formando carriles
  container(boxes, -32, -33, true, 0x8a3a20, 0x2a5a7a);
  container(boxes, -12, -18, true, 0x2a5a7a);
  container(boxes, 4, -17, true, 0x3a6a3a, true);
  container(boxes, 22, -26, false, 0x8a6a20);
  container(boxes, -2, -30, true, 0x6a2a5a, 0x8a3a20);
  container(boxes, -24, -31, false, 0x3a6a3a);
  container(boxes, 12, -32, true, 0x2a5a7a);
  container(boxes, -40, -30, true, 0x8a6a20, true);
  sandbags(boxes, 30, -30, 34, -29); sandbags(boxes, -8, -24, -4, -23);
  crateStack(boxes, 36, -26, 2); crateStack(boxes, -16, -26, 1); crateStack(boxes, 14, -22, 1);

  // --- PATIO NORESTE x 8..46, z 20..38
  container(boxes, 18, 30, true, 0x8a3a20); container(boxes, 34, 27, false, 0x2a5a7a, true);
  crateStack(boxes, 12, 24, 2); crateStack(boxes, 26, 35, 1); sandbags(boxes, 40, 24, 44, 25);

  // Puertas soldables (centro, eje del hueco, ancho, alto)
  const doors = [
    { id: 'alm_s1', x: -20, z: 14, axis: 'x', w: 3, h: 3.2, name: 'Almacén oeste' },
    { id: 'alm_s2', x: 0, z: 14, axis: 'x', w: 3, h: 3.2, name: 'Almacén este' },
    { id: 'alm_w', x: -32, z: 24, axis: 'z', w: 3, h: 3.2, name: 'Almacén lateral' },
    { id: 'alm_e', x: 8, z: 28, axis: 'z', w: 3, h: 3.2, name: 'Almacén noreste' },
    { id: 'lab_w1', x: 18, z: -8, axis: 'z', w: 3, h: 3.1, name: 'Laboratorio sur' },
    { id: 'lab_w2', x: 18, z: 8, axis: 'z', w: 3, h: 3.1, name: 'Laboratorio norte' },
    { id: 'lab_n', x: 30, z: 20, axis: 'x', w: 3, h: 3.1, name: 'Laboratorio patio' },
    { id: 'lab_s', x: 36, z: -20, axis: 'x', w: 3, h: 3.1, name: 'Laboratorio muelle' },
    { id: 'gar_e', x: -20, z: 4, axis: 'z', w: 3, h: 3.2, name: 'Garaje lateral' },
    { id: 'gar_n', x: -38, z: 8, axis: 'x', w: 3, h: 3.2, name: 'Garaje norte' },
    { id: 'gar_s', x: -30, z: -26, axis: 'x', w: 3, h: 3.2, name: 'Garaje sur' },
  ];

  // Accesos de horda: posición de aparición, y punto de salida
  const spawns = [
    { id: 'muelle_c', name: 'Portón sur', pos: [0, -41], exit: [0, -35] },
    { id: 'muelle_e', name: 'Portón sureste', pos: [30, -41], exit: [30, -35] },
    { id: 'muelle_o', name: 'Portón suroeste', pos: [-40, -41], exit: [-40, -35] },
    { id: 'carga', name: 'Muelle de carga', pos: [-12, 41], exit: [-12, 31] },
    { id: 'brecha_no', name: 'Brecha noroeste', pos: [-44, 41], exit: [-44, 35] },
    { id: 'brecha_ne', name: 'Brecha noreste', pos: [40, 41], exit: [40, 35] },
    { id: 'conducto_1', name: 'Conducto de incubación', pos: [42.5, 17], exit: [41, 15], vent: true },
    { id: 'conducto_2', name: 'Conducto de servidores', pos: [42.5, -17], exit: [41, -16], vent: true },
    { id: 'alcantarilla', name: 'Alcantarilla', pos: [-42, -20], exit: [-41, -19], vent: true },
  ];

  const traders = [
    { pos: [14, 11], yaw: Math.PI * 1.25, name: 'Patio' },
    { pos: [-22, 31.8], yaw: 0, name: 'Almacén' },
    { pos: [21, -17.5], yaw: Math.PI * 0.25, name: 'Vestíbulo del laboratorio' },
    { pos: [-44, -13], yaw: Math.PI * 0.5, name: 'Garaje' },
  ];

  const objectives = {
    zones: [ // defender / resistir
      { pos: [-5.5, -5.5], r: 4, name: 'Torre de vigilancia' },
      { pos: [-10, 21.3], r: 4.5, name: 'Pasillo del almacén' },
      { pos: [23, 8], r: 4, name: 'Vestíbulo' },
      { pos: [-32, -10], r: 5, name: 'Taller' },
      { pos: [8, -24], r: 5, name: 'Muelle' },
    ],
    devices: [ // reparar
      { pos: [36, 2.2], name: 'Transmisor del laboratorio' },
      { pos: [-46.8, -10], name: 'Generador del garaje' },
      { pos: [7, 33], name: 'Grúa del almacén' },
      { pos: [44.6, 30], name: 'Baliza noreste' },
    ],
    carry: [ // transportar: [origen, destino]
      { from: [38, -14], to: [-5.5, -5.5], name: 'Núcleo de energía' },
      { from: [-28, 32], to: [22, -17], name: 'Muestra de Semilla' },
      { from: [-44, 30], to: [14, 9], name: 'Caja de munición' },
      { from: [-20, -30], to: [-22, 30], name: 'Batería de grúa' },
    ],
  };

  const lights = [
    { pos: [-6, 7.5, 0], color: 0xffa060, intensity: 30, dist: 26, flicker: 0.15 },
    { pos: [12, 6, -10], color: 0xff8040, intensity: 22, dist: 20, flicker: 0.05 },
    { pos: [-14, 5, 22], color: 0xd0d8ff, intensity: 22, dist: 22, flicker: 0.5 },
    { pos: [0, 5, 28], color: 0xd0d8ff, intensity: 16, dist: 18 },
    { pos: [23, 4.4, 0], color: 0x80ffe0, intensity: 16, dist: 18 },
    { pos: [36, 4.4, 9], color: 0x60ff80, intensity: 20, dist: 16, flicker: 0.2 },
    { pos: [36, 4.4, -10], color: 0x4080ff, intensity: 14, dist: 14 },
    { pos: [-33, 5.2, -10], color: 0xffc080, intensity: 20, dist: 22, flicker: 0.35 },
    { pos: [0, 6, -28], color: 0xff6030, intensity: 26, dist: 28, flicker: 0.1 },
    { pos: [28, 6, 30], color: 0xff9050, intensity: 18, dist: 22 },
    { pos: [-40, 6, 24], color: 0xff9050, intensity: 16, dist: 20, flicker: 0.3 },
  ];

  const props = [
    { type: 'barrel', pos: [-13, -8] }, { type: 'barrel', pos: [-12.2, -8.6] }, { type: 'barrel', pos: [15, -6] },
    { type: 'barrel', pos: [-23, 10] }, { type: 'barrel', pos: [26, -30] }, { type: 'barrel', pos: [-44, 22] },
    { type: 'barrel', pos: [42, -4] }, { type: 'barrel', pos: [-26, 20.5] }, { type: 'barrel', pos: [16, 34] },
    { type: 'fire', pos: [-1, 6] }, { type: 'fire', pos: [-35, -33] }, { type: 'fire', pos: [24, 30] },
    { type: 'lamp', pos: [-6, 0] }, { type: 'lamp', pos: [12, -10] }, { type: 'lamp', pos: [0, -28] }, { type: 'lamp', pos: [28, 30] }, { type: 'lamp', pos: [-40, 24] },
    { type: 'corpse', pos: [6, -8] }, { type: 'corpse', pos: [-20, 26] }, { type: 'corpse', pos: [24, -6] }, { type: 'corpse', pos: [-30, -20] },
  ];

  return {
    id: 'estacion',
    name: 'Estación Ceniza',
    desc: 'Puesto avanzado industrial: patio central, almacén, laboratorio, garaje y muelle de contenedores. Nueve accesos de horda.',
    bounds: [-48, -38, 46, 38],
    boxes, doors, spawns, traders, objectives, lights, props,
    playerStarts: [[-2, 4], [0, 4], [2, 4], [-2, 6], [0, 6], [2, 6]],
    fog: { color: 0x221b17, density: 0.021 },
    ambient: { sky: 0x8a90b0, ground: 0x6a5040, intensity: 0.5 },
    moon: { color: 0x9aa8c8, intensity: 0.6, dir: [-0.4, -1, -0.3] },
    floor: 'asphalt',
    floorAreas: [ // tipo de suelo por zona (visual)
      { rect: [-32, 14, 8, 34], mat: 'concrete' },
      { rect: [18, -20, 46, 20], mat: 'tiles' },
      { rect: [-48, -26, -20, 8], mat: 'concrete' },
      { rect: [-48, 8, -32, 38], mat: 'dirt' },
      { rect: [8, 20, 46, 38], mat: 'dirt' },
    ],
    indoor: [[-32, 14, 8, 34], [18, -20, 46, 20], [-48, -26, -20, 8]],
    music: 'industrial',
  };
}

// ===================================================================
// MAPA 2: HOSPITAL SANTA ERMITA — pasillos estrechos, quirófanos y un atrio.
// ===================================================================
function buildHospital() {
  const boxes = [];
  const H = 4.5;
  // Perímetro
  wall(boxes, 'x', -32, -40, 40, H + 1, 'concrete', [[0, 4]], { t: 1 });
  wall(boxes, 'x', 32, -40, 40, H + 1, 'concrete', [[-24, 4], [24, 4]], { t: 1 });
  wall(boxes, 'z', -40, -32, 32, H + 1, 'concrete', [[0, 4]], { t: 1 });
  wall(boxes, 'z', 40, -32, 32, H + 1, 'concrete', [[-10, 4], [18, 4]], { t: 1 });
  // techo con hueco sobre el atrio
  B(boxes, -40.5, H, -32.5, 40.5, H + 0.4, -10, 'panel', { roof: true });
  B(boxes, -40.5, H, 10, 40.5, H + 0.4, 32.5, 'panel', { roof: true });
  B(boxes, -40.5, H, -10, -12, H + 0.4, 10, 'panel', { roof: true });
  B(boxes, 12, H, -10, 40.5, H + 0.4, 10, 'panel', { roof: true });
  const nicheX = (x, z, w, dz) => { const zEnd = z + dz * 5;
    B(boxes, x - w / 2 - 1, 0, Math.min(z, zEnd), x - w / 2, H + 1, Math.max(z, zEnd), 'concrete');
    B(boxes, x + w / 2, 0, Math.min(z, zEnd), x + w / 2 + 1, H + 1, Math.max(z, zEnd), 'concrete');
    B(boxes, x - w / 2 - 1, 0, zEnd - (dz > 0 ? 0 : 1), x + w / 2 + 1, H + 1, zEnd + (dz > 0 ? 1 : 0), 'concrete'); };
  const nicheZ = (x, z, w, dx) => { const xEnd = x + dx * 5;
    B(boxes, Math.min(x, xEnd), 0, z - w / 2 - 1, Math.max(x, xEnd), H + 1, z - w / 2, 'concrete');
    B(boxes, Math.min(x, xEnd), 0, z + w / 2, Math.max(x, xEnd), H + 1, z + w / 2 + 1, 'concrete');
    B(boxes, xEnd - (dx > 0 ? 0 : 1), 0, z - w / 2 - 1, xEnd + (dx > 0 ? 1 : 0), H + 1, z + w / 2 + 1, 'concrete'); };
  nicheX(0, -32, 4, -1); nicheX(-24, 32, 4, 1); nicheX(24, 32, 4, 1);
  nicheZ(-40, 0, 4, -1); nicheZ(40, -10, 4, 1); nicheZ(40, 18, 4, 1);

  // Atrio central x -12..12 z -10..10 (sin techo), rodeado de paredes con 4 accesos
  wall(boxes, 'x', -10, -12, 12, H, 'tiles', [[-6, 3, 3], [6, 3, 3]]);
  wall(boxes, 'x', 10, -12, 12, H, 'tiles', [[0, 3, 3]]);
  wall(boxes, 'z', -12, -10, 10, H, 'tiles', [[0, 3, 3]]);
  wall(boxes, 'z', 12, -10, 10, H, 'tiles', [[-4, 3, 3], [5, 3, 3]]);
  // fuente central y bancos
  B(boxes, -2, 0, -2, 2, 0.9, 2, 'concrete'); B(boxes, -0.4, 0.9, -0.4, 0.4, 2.2, 0.4, 'concrete');
  B(boxes, -9, 0, 5, -6, 0.6, 6, 'crate'); B(boxes, 6, 0, -7, 9, 0.6, -6, 'crate');
  // Ala oeste: pabellón x -40..-12, habitaciones en peine
  wall(boxes, 'z', -24, -32, 32, H, 'panel', [[-24, 2.6, 3], [-10, 2.6, 3], [6, 2.6, 3], [22, 2.6, 3]]);
  for (const z of [-20, -6, 10, 24]) wall(boxes, 'x', z, -40, -24, H, 'panel', [[-32, 2.4, 3]]);
  for (const z of [-28, -14, 2, 18]) { B(boxes, -38, 0, z, -35, 0.8, z + 2, 'bed'); B(boxes, -30, 0, z + 1, -27, 0.8, z + 3, 'bed'); }
  // Ala este: quirófanos
  wall(boxes, 'z', 22, -32, 32, H, 'panel', [[-20, 2.6, 3], [-2, 2.6, 3], [16, 2.6, 3]]);
  wall(boxes, 'x', -10, 22, 40, H, 'panel', [[31, 2.6, 3]]);
  wall(boxes, 'x', 8, 22, 40, H, 'panel', [[28, 2.6, 3]]);
  for (const [x, z] of [[31, -22], [31, 0], [31, 22]]) { B(boxes, x - 1.5, 0, z - 0.6, x + 1.5, 1, z + 0.6, 'metal'); }
  for (const [x, z] of [[36, -26], [26, -14], [37, 4], [26, 16], [36, 28]]) B(boxes, x - 0.6, 0, z - 0.6, x + 0.6, 1.8, z + 0.6, 'server');
  // Norte: recepción x -12..22, z 10..32
  wall(boxes, 'x', 20, -24, 22, H, 'panel', [[-16, 3, 3], [2, 3, 3], [16, 3, 3]]);
  B(boxes, -6, 0, 14, 6, 1.1, 15, 'metal'); B(boxes, -6, 0, 15, -5, 1.1, 18, 'metal');
  for (const x of [-10, 10]) for (const z of [24, 28]) B(boxes, x - 2, 0, z - 0.4, x + 2, 0.5, z + 0.4, 'crate');
  // Sur: urgencias x -24..22 z -32..-10 con ambulancias
  wall(boxes, 'x', -18, -24, -12, H, 'panel', []);
  B(boxes, -6, 0, -26, -1, 2.2, -23.5, 'vehicle', { tint: 0xd8d8d0 }); B(boxes, 5, 0, -22, 7.5, 2.2, -16, 'vehicle', { tint: 0xd8d8d0 });
  crateStack(boxes, 14, -28, 2); crateStack(boxes, -16, -14, 1); crateStack(boxes, 18, -12, 1); crateStack(boxes, -20, -28, 2);

  const doors = [
    { id: 'atr_s1', x: -6, z: -10, axis: 'x', w: 3, h: 3, name: 'Atrio suroeste' },
    { id: 'atr_s2', x: 6, z: -10, axis: 'x', w: 3, h: 3, name: 'Atrio sureste' },
    { id: 'atr_n', x: 0, z: 10, axis: 'x', w: 3, h: 3, name: 'Atrio norte' },
    { id: 'atr_w', x: -12, z: 0, axis: 'z', w: 3, h: 3, name: 'Atrio oeste' },
    { id: 'atr_e1', x: 12, z: -4, axis: 'z', w: 3, h: 3, name: 'Atrio este' },
    { id: 'pab_1', x: -24, z: -24, axis: 'z', w: 3, h: 2.6, name: 'Pabellón A' },
    { id: 'pab_3', x: -24, z: 6, axis: 'z', w: 3, h: 2.6, name: 'Pabellón C' },
    { id: 'qui_1', x: 22, z: -20, axis: 'z', w: 3, h: 2.6, name: 'Quirófano 1' },
    { id: 'qui_3', x: 22, z: 16, axis: 'z', w: 3, h: 2.6, name: 'Quirófano 3' },
    { id: 'rec_1', x: -16, z: 20, axis: 'x', w: 3, h: 3, name: 'Recepción oeste' },
    { id: 'rec_3', x: 16, z: 20, axis: 'x', w: 3, h: 3, name: 'Recepción este' },
  ];
  const spawns = [
    { id: 'h_s', name: 'Entrada de urgencias', pos: [0, -35], exit: [0, -29] },
    { id: 'h_n1', name: 'Morgue', pos: [-24, 35], exit: [-24, 29] },
    { id: 'h_n2', name: 'Capilla', pos: [24, 35], exit: [24, 29] },
    { id: 'h_w', name: 'Lavandería', pos: [-43, 0], exit: [-37, 0] },
    { id: 'h_e1', name: 'Calderas', pos: [43, -10], exit: [37, -10] },
    { id: 'h_e2', name: 'Farmacia', pos: [43, 18], exit: [37, 18] },
    { id: 'h_v1', name: 'Conducto del pabellón', pos: [-38, -30], exit: [-36, -29], vent: true },
    { id: 'h_v2', name: 'Conducto de quirófanos', pos: [38, 30], exit: [36, 29], vent: true },
  ];
  const traders = [
    { pos: [-10, 8], yaw: Math.PI * 1.75, name: 'Atrio' },
    { pos: [-4, 30], yaw: Math.PI, name: 'Recepción' },
    { pos: [26, -30], yaw: Math.PI * 0.25, name: 'Quirófanos' },
    { pos: [-38, -16], yaw: Math.PI * 0.5, name: 'Pabellón' },
  ];
  const objectives = {
    zones: [
      { pos: [0, -5], r: 4.5, name: 'Fuente del atrio' },
      { pos: [0, 26], r: 4.5, name: 'Recepción' },
      { pos: [31, 11], r: 4, name: 'Quirófano 2' },
      { pos: [-32, -13], r: 4, name: 'Pabellón B' },
    ],
    devices: [
      { pos: [-0.5, 31], name: 'Centralita de emergencia' },
      { pos: [39, 0], name: 'Generador de quirófanos' },
      { pos: [-39, 25], name: 'Respirador central' },
    ],
    carry: [
      { from: [-36, 29], to: [0, -5], name: 'Bolsa de plasma' },
      { from: [36, -28], to: [-4, 26], name: 'Antídoto experimental' },
      { from: [18, 28], to: [-32, -13], name: 'Botiquín reforzado' },
    ],
  };
  const lights = [
    { pos: [0, 6, 0], color: 0xa0c0ff, intensity: 26, dist: 22 },
    { pos: [-32, 4, -13], color: 0xd0ffe8, intensity: 16, dist: 16, flicker: 0.4 },
    { pos: [-32, 4, 17], color: 0xd0ffe8, intensity: 14, dist: 16, flicker: 0.2 },
    { pos: [31, 4, -22], color: 0xffffff, intensity: 18, dist: 14 },
    { pos: [31, 4, 11], color: 0xff6060, intensity: 16, dist: 16, flicker: 0.5 },
    { pos: [0, 4, 26], color: 0xffe0b0, intensity: 18, dist: 18 },
    { pos: [0, 4, -24], color: 0xff4040, intensity: 20, dist: 20, flicker: 0.3 },
    { pos: [-18, 4, -26], color: 0xffd0a0, intensity: 12, dist: 14 },
  ];
  const props = [
    { type: 'barrel', pos: [-14, -30] }, { type: 'barrel', pos: [20, 30] }, { type: 'barrel', pos: [-38, 8] },
    { type: 'corpse', pos: [4, 4] }, { type: 'corpse', pos: [-30, 0] }, { type: 'corpse', pos: [28, -6] },
    { type: 'fire', pos: [10, -28] },
  ];
  return {
    id: 'hospital', name: 'Hospital Santa Ermita',
    desc: 'Pabellones estrechos, quirófanos y un atrio abierto. Pasillos que se convierten en cuellos de botella mortales.',
    bounds: [-40, -32, 40, 32], boxes, doors, spawns, traders, objectives, lights, props,
    playerStarts: [[-3, -6], [0, -6], [3, -6], [-3, -4], [3, -4], [0, -3]],
    fog: { color: 0x141a1d, density: 0.027 },
    ambient: { sky: 0x8aa0b4, ground: 0x505050, intensity: 0.55 },
    moon: { color: 0x8090b0, intensity: 0.5, dir: [0.3, -1, 0.2] },
    floor: 'tiles',
    floorAreas: [{ rect: [-24, -32, 22, -18], mat: 'asphalt' }, { rect: [-12, -10, 12, 10], mat: 'concrete' }],
    indoor: [[-40, -32, -12, 32], [12, -32, 40, 32], [-12, 10, 12, 32], [-12, -32, 12, -10]],
    music: 'clinical',
  };
}

export const MAPS = {
  estacion: buildEstacionCeniza,
  hospital: buildHospital,
  metro: buildMetro,
};
export const MAP_LIST = [
  { id: 'estacion', name: 'Estación Ceniza', desc: 'Puesto industrial con patio abierto, almacén, laboratorio y muelle de contenedores.' },
  { id: 'hospital', name: 'Hospital Santa Ermita', desc: 'Pasillos estrechos y quirófanos alrededor de un atrio abierto.' },
  { id: 'metro', name: 'Metro Línea Cero', desc: 'Estación subterránea con andenes elevados, vías, túneles y vestíbulo.' },
];
