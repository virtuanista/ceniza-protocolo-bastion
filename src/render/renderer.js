// Renderizador: escena del mundo + escena de arma en primera persona (capa superpuesta).
import * as THREE from 'three';
import { setMaxAnisotropy } from './textures.js';
import { setWeaponEnv } from './weaponModels.js';

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: settings.quality !== 'low', powerPreference: 'high-performance', stencil: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.6;
    this.gl.autoClear = false;
    this.gl.info.autoReset = false;
    setMaxAnisotropy(Math.min(8, this.gl.capabilities.getMaxAnisotropy()));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov || 80, 1, 0.05, 260);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(58, 1, 0.01, 20);
    this.vmScene.add(this.vmCamera);
    const vmAmb = new THREE.HemisphereLight(0xd8dde8, 0x403428, 2.6);
    this.vmScene.add(vmAmb);
    this.vmKey = new THREE.DirectionalLight(0xfff0dd, 3.2);
    this.vmKey.position.set(1, 2, 1.5);
    this.vmScene.add(this.vmKey);
    this.vmFill = new THREE.PointLight(0xff9050, 0, 4); // destello de boca de cañón en el arma
    this.vmFill.position.set(0.1, 0.0, -0.8);
    this.vmScene.add(this.vmFill);
    this.vmAmb = vmAmb;
    this._buildWeaponEnv();

    this.applySettings(settings);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // Entorno de reflejos para el metal de las armas: sala oscura con luz cálida cenital y un panel frío lateral
  _buildWeaponEnv() {
    const pm = new THREE.PMREMGenerator(this.gl);
    const sc = new THREE.Scene();
    const basic = (c, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.BackSide });
    sc.add(new THREE.Mesh(new THREE.BoxGeometry(12, 8, 12), basic(0x26282c)));
    const panel = (w, h, c, k, x, y, z, rx, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); sc.add(m); };
    panel(6, 3, 0xffd2a0, 4, 0, 3.9, 0, Math.PI / 2, 0); // luz cenital cálida
    panel(2, 5, 0x9ab8e0, 2.2, -5.9, 0.5, 0, 0, Math.PI / 2); // panel frío a la izquierda
    panel(3, 1, 0xffffff, 3, 5.9, 1.5, -2, 0, -Math.PI / 2); // reflejo duro a la derecha
    panel(12, 12, 0x3a2e24, 1, 0, -3.9, 0, -Math.PI / 2, 0); // suelo terroso
    const rt = pm.fromScene(sc, 0.03);
    setWeaponEnv(rt.texture);
    pm.dispose();
  }

  applySettings(s) {
    this.settings = s;
    const pr = s.quality === 'low' ? 0.75 : s.quality === 'medium' ? 1 : Math.min(window.devicePixelRatio, 1.5);
    this.gl.setPixelRatio(pr * (s.renderScale || 1));
    this.gl.shadowMap.enabled = s.quality === 'high';
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera.fov = s.fov || 80;
    this.camera.updateProjectionMatrix();
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h;
    this.vmCamera.updateProjectionMatrix();
  }

  render(showViewmodel = true) {
    this.gl.info.reset();
    this.gl.clear();
    this.gl.render(this.scene, this.camera);
    if (showViewmodel) {
      this.gl.clearDepth();
      this.gl.render(this.vmScene, this.vmCamera);
    }
  }

  stats() { return this.gl.info.render; }
}
