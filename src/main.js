// Punto de entrada: aplicación, bucle principal, fondo animado del menú y ciclo de partidas.
import * as THREE from 'three';
import { Renderer } from './render/renderer.js';
import { Input } from './core/input.js';
import { HUD } from './ui/hud.js';
import { UI } from './ui/ui.js';
import { Game } from './game/game.js';
import { World } from './world/world.js';
import { NetClient } from './net/net.js';
import { audio } from './audio/audio.js';
import { saveSys } from './save/save.js';

class App {
  constructor() {
    const canvas = document.getElementById('view');
    this.settings = saveSys.data.settings;
    this.renderer = new Renderer(canvas, this.settings);
    this.input = new Input(canvas);
    this.hud = new HUD(document.getElementById('hud'));
    this.ui = new UI(this, document.getElementById('ui'));
    this.net = new NetClient(this);
    this.game = null;
    this.menuWorld = null;
    this.last = performance.now();
    this.applySettings();
    this.input.onUnlock = () => this._onUnlock();
    // el audio necesita un gesto del usuario
    const unlockAudio = () => { audio.init(); audio.applyVolumes(this.settings); if (!this.game) audio.music?.start('menu', 0); };
    window.addEventListener('pointerdown', unlockAudio, { once: false });
    window.addEventListener('keydown', unlockAudio, { once: true });
    window.addEventListener('keydown', (e) => {
      if (!this.game) return;
      if (e.code === 'Escape' && this.ui.screen === 'trader') { this.ui.closeOverlay(this.game); }
    });
    document.getElementById('view').addEventListener('click', () => { if (this.game && !this.ui.blocking && !this.input.locked) this.input.lock(); });
    this._buildMenuBackground();
    this.ui.showMain();
    window.__app = this; // depuración en consola
    requestAnimationFrame((t) => this.loop(t));
  }

  applySettings() {
    const s = saveSys.data.settings;
    this.input.binds = { ...s.binds };
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    this.renderer.camera.fov = s.fov;
    this.renderer.camera.updateProjectionMatrix();
    audio.applyVolumes({ master: s.master, sfx: s.sfx, music: s.music });
  }

  _onUnlock() {
    if (!this.game || this.game.over) return;
    if (this.ui.screen === 'trader') return;
    if (!this.ui.blocking) this.ui.showPause(this.game);
  }

  _buildMenuBackground() {
    if (this.menuWorld) return;
    this.renderer.scene.clear();
    this.renderer.scene.add(this.renderer.camera);
    this.menuWorld = new World(this.renderer.scene, 'estacion', { ...this.settings, quality: this.settings.quality === 'high' ? 'medium' : this.settings.quality });
    this.menuT = 0;
    this.renderer.vmScene.visible = false;
  }
  _disposeMenuBackground() { if (this.menuWorld) { this.menuWorld.dispose(); this.menuWorld = null; } }

  startGame(cfg) {
    audio.init();
    this.ui.showLoading('Desplegando en ' + ({ hospital: 'Hospital Santa Ermita', metro: 'Metro Línea Cero' }[cfg.map] || 'Estación Ceniza') + '...');
    setTimeout(() => {
      try {
        this._disposeMenuBackground();
        if (this.game) { this.game.dispose(); this.game = null; }
        audio.music?.stop();
        this.game = new Game(this, cfg);
        this.renderer.applySettings(saveSys.data.settings);
        this.ui.clear();
        this.input.lock();
        audio.music?.start(this.game.world.def.music, 0);
      } catch (e) {
        console.error(e);
        this._buildMenuBackground();
        this.ui.showMain('No se pudo iniciar la partida: ' + e.message);
      }
    }, 60);
  }

  endGame(silent = false, fromNet = false) {
    if (this.game) {
      if (this.game.net && !fromNet) { this.game.net.endMatch(); }
      this.game.dispose();
      this.game = null;
    }
    this.hud.detach();
    document.getElementById('view').classList.remove('zed');
    this.input.unlock();
    if (!silent) {
      this._buildMenuBackground();
      if (this.net.lobby && this.net.connected) this.ui.showLobby(); else this.ui.showMain();
      audio.music?.stop(); setTimeout(() => audio.music?.start('menu', 0), 500);
    }
  }

  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (dt > 0.1) dt = 0.1; // evitar saltos tras pestañas inactivas
    if (this.game) {
      this.game.update(dt);
      this.renderer.render(true);
    } else if (this.menuWorld) {
      this.menuT += dt;
      const cam = this.renderer.camera;
      const a = this.menuT * 0.05;
      cam.position.set(Math.sin(a) * 22, 9 + Math.sin(this.menuT * 0.2) * 1.5, Math.cos(a) * 22);
      cam.lookAt(0, 2, 0);
      this.menuWorld.update(dt, cam.position);
      this.renderer.render(false);
      this.input.endFrame();
    }
  }
}

window.addEventListener('DOMContentLoaded', () => { new App(); });
export { THREE };
