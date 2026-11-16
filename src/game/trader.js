// Economía del comerciante «LONJA»: comprar, vender, munición, blindaje, granadas y mejoras.
// Todas las operaciones validan créditos, peso y estado de la tienda.
import { WEAPONS, WEAPON_LIST, upgradeCost, MAX_UPGRADE, upgradeWeight } from '../weapons/weaponDefs.js';
import { audio } from '../audio/audio.js';
import { bus } from '../core/events.js';

export const ARMOR_PRICE = 2; // por punto
export const GRENADE_PRICE = 40;
export const SELL_RATIO = 0.75;

export class Trader {
  constructor(game) { this.game = game; }
  get w() { return this.game.weapons; }
  get p() { return this.game.local; }

  canAfford(c) { return this.p.credits >= c; }
  spend(c) { this.p.credits -= c; bus.emit('credits'); }
  fail(msg) { audio.play('deny', { volume: 0.5, bus: 'ui' }); bus.emit('toast', { text: msg, kind: 'bad' }); return false; }
  ok(snd = 'buy') { audio.play(snd, { volume: 0.6, bus: 'ui' }); bus.emit('inventory'); bus.emit('credits'); return true; }

  catalog() {
    return WEAPON_LIST.filter((d) => d.price > 0);
  }

  weightOk(def, extra = 0) { return this.w.totalWeight() + def.weight + extra <= this.w.carryCap(); }

  buy(id) {
    const def = WEAPONS[id];
    if (!def || this.w.has(id)) return this.fail('Ya tienes esa arma');
    if (!this.canAfford(def.price)) return this.fail('Créditos insuficientes');
    if (!this.weightOk(def)) return this.fail(`Sobrepeso: ${this.w.totalWeight() + def.weight}/${this.w.carryCap()}`);
    this.spend(def.price);
    this.w.addWeapon(id, { spent: def.price, equip: true });
    this.p.stats.bought = (this.p.stats.bought || 0) + 1;
    return this.ok();
  }

  sellValue(inst) { return Math.floor(inst.spent * SELL_RATIO / 5) * 5; }

  sell(id) {
    const inst = this.w.get(id);
    if (!inst || inst.def.unsellable) return this.fail('No se puede vender');
    const v = this.sellValue(inst);
    this.p.credits += v;
    this.w.removeWeapon(id);
    return this.ok('sell');
  }

  ammoCost(inst, full = true) {
    const missing = this.w.ammoMissing(inst);
    if (missing <= 0) return { cost: 0, amount: 0 };
    const perRound = (inst.def.ammoPrice || 10) / Math.max(1, inst.def.mag);
    const amount = full ? missing : Math.min(missing, inst.stats.mag);
    return { cost: Math.max(1, Math.ceil(perRound * amount)), amount };
  }

  buyAmmo(id, full = false) {
    const inst = this.w.get(id);
    if (!inst || !inst.def.mag) return false;
    let { cost, amount } = this.ammoCost(inst, full);
    if (amount <= 0) return this.fail('Munición completa');
    if (!this.canAfford(cost)) {
      // compra parcial con lo que haya
      const perRound = (inst.def.ammoPrice || 10) / Math.max(1, inst.def.mag);
      amount = Math.floor(this.p.credits / perRound);
      if (amount <= 0) return this.fail('Créditos insuficientes');
      cost = Math.ceil(amount * perRound);
    }
    this.spend(cost);
    inst.reserve += amount;
    bus.emit('ammo');
    return this.ok('pickup');
  }

  fillAllAmmo() {
    let any = false;
    for (const inst of this.w.inv) {
      if (!inst.def.mag) continue;
      const { amount } = this.ammoCost(inst, true);
      if (amount > 0 && this.p.credits > 0) { this.buyAmmo(inst.def.id, true); any = true; }
    }
    if (!any) this.fail('Nada que reponer');
  }

  armorCost() { return Math.ceil((this.p.maxArmor - this.p.armor) * ARMOR_PRICE); }
  buyArmor() {
    const missing = this.p.maxArmor - this.p.armor;
    if (missing <= 0) return this.fail('Blindaje completo');
    let pts = missing;
    if (!this.canAfford(Math.ceil(pts * ARMOR_PRICE))) pts = Math.floor(this.p.credits / ARMOR_PRICE);
    if (pts <= 0) return this.fail('Créditos insuficientes');
    this.spend(Math.ceil(pts * ARMOR_PRICE));
    this.p.armor += pts;
    return this.ok('pickup');
  }

  buyGrenade() {
    if (this.w.grenades >= this.w.grenadeMax()) return this.fail('Granadas al máximo');
    if (!this.canAfford(GRENADE_PRICE)) return this.fail('Créditos insuficientes');
    this.spend(GRENADE_PRICE);
    this.w.grenades++;
    return this.ok('pickup');
  }

  upgradeInfo(inst) {
    const lvl = inst.upgrade || 0;
    if (lvl >= MAX_UPGRADE) return null;
    return { cost: upgradeCost(inst.def, lvl), weight: upgradeWeight(lvl + 1) - upgradeWeight(lvl), next: lvl + 1 };
  }

  upgrade(id) {
    const inst = this.w.get(id);
    if (!inst || inst.def.unsellable) return this.fail('No se puede mejorar');
    const info = this.upgradeInfo(inst);
    if (!info) return this.fail('Mejora máxima');
    if (!this.canAfford(info.cost)) return this.fail('Créditos insuficientes');
    if (this.w.totalWeight() + info.weight > this.w.carryCap()) return this.fail('Sobrepeso');
    this.spend(info.cost);
    inst.upgrade = info.next;
    inst.spent += info.cost;
    this.w.computeStats(inst);
    return this.ok();
  }

  // Precio total para rellenar todo (para la vista resumen)
  autoFillCost() {
    let c = 0;
    for (const inst of this.w.inv) if (inst.def.mag) c += this.ammoCost(inst, true).cost;
    return c + this.armorCost();
  }
}
