// 策略名称：赤焰燃魂
// 选择理由：blitz 生命仅 6 点，把牌换算成生命伤害就是最短胜利路径。红系提供全卡池最高效的打脸直伤
//   （火球术 3 费打 2、焚尽 5 费打 3—4）与敏捷/预制前压单位；黑系提供献祭复用（灰烬小僧终曲打 1、
//   燃魂 2 费打 2、自杀式袭击 1 换 1 附带终曲）与续航（灵质榨取）。灵体「余烬执火者」每回合送
//   +1000 攻 / +1 冲击，等于每回合多 1 点打脸伤害。目标 6—7 回合烧穿生命卡组。
// 主责模式：blitz

export const meta = {
  id: 'mimov26pro',
  model: 'MIMO-v2.6-pro',
  modelId: 'mimo-v2.6-pro',
  name: '赤焰燃魂',
  desc: '红黑直伤速攻：低费敏捷/预制单位抢血，火球术与献祭直伤打脸，余烬执火者每回合加冲击，6—7 回合定胜负。',
  primaryMode: 'blitz',
  modes: ['standard', 'blitz', 'grand', 'duo'],
};

export const deck = {
  火焰鸟: 4,
  灰烬小僧: 4,
  地狱犬: 4,
  烈焰斗士: 3,
  熔岩投手: 2,
  爆燃: 2,
  烈焰之力: 2,
  血怒: 2,
  火种祭坛: 2,
  火球术: 4,
  焚尽: 2,
  自杀式袭击: 2,
  黑暗聚合体: 2,
  灵质榨取: 3,
  蹒跚的僵尸: 2,
  灵魂交易: 1,
  燃魂: 3,
  混沌打击: 2,
  混沌冲击: 2,
  临阵磨枪: 2,
};

export const spirit = '余烬执火者';
export const color = '红';

// ────────────────────────────────────────────────────────────
// 纯函数工具（无副作用、无模块级可变状态）
// ────────────────────────────────────────────────────────────

const LETHAL = 100000;
const rem = (c) => Math.max(0, (c && c.hp || 0) - (c && c.damage || 0));
const kwOf = (c) => (c && c.keywords) || [];
const costOf = (c) => (c && c.cost && c.cost.total) || 0;
const findIn = (arr, uid) => {
  const list = arr || [];
  for (const c of list) if (c && c.uid === uid) return c;
  return null;
};

function canBlockWith(attacker, b) {
  if (!attacker || !b) return false;
  if (b.type !== '灵像' && !b.token) return false;
  const kwA = kwOf(attacker), kwB = kwOf(b);
  if (b.tapped && !kwB.includes('守护')) return false;
  if (kwA.includes('敏捷') && !kwB.includes('敏捷') && !(b.tapped && kwB.includes('守护'))) return false;
  return true;
}

function unitValue(c) {
  if (!c) return 0;
  return (c.atk || 0) * 8 + rem(c) * 3 + (c.imp || 0) * 40 + costOf(c) * 10;
}

function faceReach(units) {
  let n = 0;
  for (const c of units || []) if (c && !c.tapped && (c.type === '灵像' || c.token)) n += (c.imp || 0);
  return n;
}

const BURN = { 火球术: 2, 焚尽: 3, 燃魂: 2, 混沌冲击: 1 };
function burnOf(name, myField) {
  let n = BURN[name] || 0;
  if (name === '焚尽' && !(myField || []).length) n = 4;
  if (name === '燃魂') {
    for (const c of myField || []) if (c && c.name === '灰烬小僧') { n = 3; break; }
  }
  return n;
}

// ────────────────────────────────────────────────────────────
// 打分
// ────────────────────────────────────────────────────────────

function scoreMove(view, move, allMoves) {
  const me = view.me, opp = view.opp;
  const myField = me.field || [], oppField = opp.field || [];
  const myHand = me.hand || [];
  const oppLife = opp.life || 0, myLife = me.life || 0;
  const cb = view.combat;
  const myTurn = view.active === me.idx;

  switch (move.type) {
    case 'pass':
      return 0;

    case 'inspectTake':
      return 1200;

    case 'inspectReveal': {
      const ins = view.inspect;
      const card = ins && ins.card;
      const isCT = !!(card && String(card.trigger || '').includes('CT'));
      return isCT ? 1230 : 500;
    }

    case 'tapEssence':
      return -5;

    case 'supportSpirit': {
      const att = findIn(myField, cb && cb.attackerUid);
      if (!att) return -1;
      const newImp = (att.imp || 0) + 1;
      if (cb.target === 'spirit') {
        if (newImp >= oppLife && (att.imp || 0) < oppLife) return LETHAL;
        return 2200 + newImp * 100;
      }
      const t = findIn(oppField, cb.target);
      if (t && (att.atk || 0) < rem(t) && (att.atk || 0) + 1000 >= rem(t)) return 4200;
      return 1100 + (att.imp || 0) * 40;
    }

    case 'attack': {
      const att = findIn(myField, move.uid);
      if (!att) return -1;
      const kwA = kwOf(att);
      const critUp = me.spirit && me.spirit.crit > 0 ? 1 : 0;
      if (move.target === 'spirit') {
        const imp = att.imp || 0;
        let s = 300 + imp * 130;
        if (imp >= oppLife || imp + critUp >= oppLife) s += LETHAL;
        if (kwA.includes('敏捷')) s += 80;
        if (kwA.includes('超冲击')) s += 60;
        let blockers = 0;
        for (const b of oppField) if (canBlockWith(att, b)) blockers++;
        if (blockers === 0) s += 260;
        else {
          s -= 30 * blockers;
          for (const b of oppField) {
            if (!canBlockWith(att, b)) continue;
            if ((b.atk || 0) >= rem(att) && (att.atk || 0) < rem(b) && !kwA.includes('先攻')) { s -= 120; break; }
          }
        }
        return s;
      }
      const t = findIn(oppField, move.target);
      if (!t) return -1;
      const aAtk = att.atk || 0, tAtk = t.atk || 0;
      const aRem = rem(att), tRem = rem(t);
      const first = kwA.includes('先攻') && !kwOf(t).includes('先攻');
      const kills = aAtk >= tRem;
      const dies = tAtk >= aRem;
      let s = 20;
      if (kills && (first || !dies)) s = 260 + unitValue(t) * 0.6;
      else if (kills && dies) s = unitValue(t) * 0.5 - unitValue(att) * 0.55;
      else s = 15 + (aAtk >= tRem - 1000 ? 40 : 0);
      return s;
    }

    case 'block': {
      if (cb && cb.blockers && cb.blockers.indexOf(move.uid) >= 0) return -3000;
      const attacker = findIn(oppField, cb && cb.attackerUid);
      const b = findIn(myField, move.uid);
      if (!attacker || !b) return -1;
      const aAtk = attacker.atk || 0, aRem = rem(attacker);
      const bAtk = b.atk || 0, bRem = rem(b);
      const bFirst = kwOf(b).includes('先攻') && !kwOf(attacker).includes('先攻');
      const kills = bAtk >= aRem;
      const survives = bRem > aAtk || (bFirst && kills);
      const facesLethal = cb.target === 'spirit' && (attacker.imp || 0) >= myLife;
      if (facesLethal) {
        if (kills && survives) return LETHAL + 2000;
        if (kills) return LETHAL + 1000;
        return LETHAL - costOf(b) * 20;
      }
      let combAtk = bAtk;
      for (const uid of cb.blockers || []) {
        const x = findIn(myField, uid);
        if (x) combAtk += x.atk || 0;
      }
      if (cb.target && cb.target !== 'spirit') {
        const t = findIn(myField, cb.target);
        if (t) {
          const tKills = (t.atk || 0) >= aRem;
          const tFirst = kwOf(t).includes('先攻') && !kwOf(attacker).includes('先攻');
          const tSurv = rem(t) > aAtk || (tFirst && tKills);
          if (tKills && tSurv) return -300;
          if (!tSurv && unitValue(t) > unitValue(b) + 150) return 350 + (unitValue(t) - unitValue(b)) * 0.3;
        }
      }
      if (kills && survives) return 750 + aAtk * 0.5;
      if (kills && !survives) return unitValue(attacker) * 0.55 - unitValue(b) * 0.6 + 80;
      if (!kills && combAtk >= aRem && aAtk >= 3000) return 420;
      return -150 - costOf(b) * 15;
    }

    case 'orderBlockers': {
      const order = move.order || [];
      let s = 0;
      for (let i = 0; i < order.length; i++) {
        const c = findIn(myField, order[i]);
        s += i * unitValue(c);
      }
      return s;
    }

    case 'setEssence': {
      const c = findIn(myHand, move.uid);
      if (!c) return -1;
      let s = 2000 + costOf(c) * 6;
      if (c.color === '红') s += 30;
      else if (c.color === '黑') {
        let blackEss = 0;
        for (const e of me.essence || []) if (e && e.color === '黑') blackEss++;
        s += 20 + (blackEss < 2 ? 60 : 0);
      } else s -= 25;
      const burn = burnOf(c.name, myField);
      if (burn > 0 && oppLife <= burn + faceReach(myField)) s -= 2500;
      if (c.name === '焚尽' && oppLife <= 5) s -= 1500;
      let playable = false;
      for (const m of allMoves) if (m.type === 'play' && m.uid === move.uid) { playable = true; break; }
      if (playable && myHand.length <= 1) s -= 3000;
      return s;
    }

    case 'spiritDraw': {
      let s = 200;
      if (myHand.length <= 2) s += 350;
      let hasAttacker = false;
      for (const c of myField) if (c && !c.tapped && (c.type === '灵像' || c.token)) { hasAttacker = true; break; }
      if (!hasAttacker) s += 200;
      return s;
    }

    case 'spiritSpecial': {
      const t = findIn(myField, move.targets && move.targets[0]);
      if (!t) return -1;
      if (!myTurn) return 120;
      const canHit = !t.tapped;
      const newImp = (t.imp || 0) + 1;
      if (canHit && (newImp >= oppLife || (newImp + 1 >= oppLife && me.spirit && me.spirit.crit > 0)) && (t.imp || 0) < oppLife) return 90000;
      let s = 600 + (t.imp || 0) * 40;
      if (!canHit) s = 150;
      return s;
    }

    case 'ability': {
      const name = move.name;
      const targets = move.targets || [];
      if (name === '火种祭坛') {
        const sac = findIn(myField, targets[0]);
        if (!sac) return -1;
        const dmg = 1 + (sac.name === '灰烬小僧' ? 1 : 0);
        if (dmg >= oppLife) return LETHAL;
        let s = 160 + (sac.name === '灰烬小僧' ? 130 : 0) + (sac.name === '黑暗聚合体' ? 50 : 0);
        s -= costOf(sac) * 25;
        if (sac.tapped) s += 35;
        if (!sac.tapped && (sac.imp || 0) >= 2) s -= 90;
        return s;
      }
      if (name === '熔岩投手') {
        const t = findIn(myField.concat(oppField), targets[0]);
        if (!t) return -1;
        const mine = findIn(myField, targets[0]);
        if (mine) {
          if (mine.name === '灰烬小僧' && rem(mine) <= 1000) return 170;
          return -250;
        }
        if (rem(t) <= 1000) {
          let s = 320 + unitValue(t) * 0.5;
          const self = findIn(myField, move.uid);
          if (self && !self.tapped && myTurn) s -= 110;
          return s;
        }
        return 25;
      }
      if (name === '黑暗聚合体') {
        const t = findIn(myField, targets[0]);
        if (!t) return -1;
        return 120 + unitValue(t) * 0.15;
      }
      return 60;
    }

    case 'play': {
      const c = findIn(myHand, move.uid);
      if (!c) return -1;
      const name = c.name;
      const targets = move.targets || [];
      const t0 = targets.length ? findIn(myField.concat(oppField), targets[0]) : null;
      const tMine = targets.length ? !!findIn(myField, targets[0]) : false;

      if (name === '火球术') return oppLife <= 2 ? LETHAL : 540;
      if (name === '混沌冲击') return oppLife <= 1 ? LETHAL : 340;
      if (name === '焚尽') {
        const dmg = myField.length === 0 ? 4 : 3;
        return oppLife <= dmg ? LETHAL : 440;
      }
      if (name === '燃魂') {
        const sac = findIn(myField, targets[0]);
        if (!sac) return -1;
        const dmg = 2 + (sac.name === '灰烬小僧' ? 1 : 0);
        if (dmg >= oppLife) return LETHAL;
        let s = 380 + (sac.name === '灰烬小僧' ? 150 : 0) + (sac.name === '黑暗聚合体' ? 60 : 0);
        s -= costOf(sac) * 22;
        if (sac.tapped) s += 35;
        if (!sac.tapped && (sac.imp || 0) >= 2) s -= 100;
        return s;
      }
      if (name === '自杀式袭击') {
        const sac = findIn(myField, targets[0]);
        const victim = targets.length > 1 ? findIn(oppField, targets[1]) : null;
        if (!sac || !victim) return -1;
        let s = 240 + unitValue(victim) * 0.45 + (sac.name === '灰烬小僧' ? 140 : 0);
        s -= costOf(sac) * 22;
        if (sac.tapped) s += 30;
        return s;
      }
      if (name === '爆燃') {
        const t = t0;
        if (!t) return -1;
        if (tMine) {
          if (t.name === '灰烬小僧' && rem(t) <= 3000 && (t.damage || 0) > 0) return 140;
          return -400;
        }
        const dmg = (t.damage || 0) > 0 ? 3000 : 1000;
        if (rem(t) <= dmg) return 300 + unitValue(t) * 0.6;
        return 30 + (rem(t) <= dmg + 1000 ? 25 : 0);
      }
      if (name === '混沌打击') {
        const t = t0;
        if (!t) return -1;
        if (tMine) {
          if (t.name === '灰烬小僧' && rem(t) <= 2000) return 130;
          return -350;
        }
        if (rem(t) <= 2000) return 280 + unitValue(t) * 0.55;
        return 35;
      }
      if (name === '烈焰之力') {
        const t = t0;
        if (!t) return -1;
        if (!tMine) return -2000;
        const canHit = !t.tapped;
        const newImp = (t.imp || 0) + 1;
        if (canHit && newImp >= oppLife && (t.imp || 0) < oppLife) return 92000;
        let s = 420 + (t.imp || 0) * 55;
        if (!canHit) s -= 300;
        return s;
      }
      if (name === '血怒') {
        const t = t0;
        if (!t || !tMine) return -1;
        const canHit = !t.tapped;
        const newImp = (t.imp || 0) + 1;
        if (canHit && newImp >= oppLife && (t.imp || 0) < oppLife) return 91000;
        let s = 400 + (t.imp || 0) * 50 + ((t.damage || 0) > 0 ? 60 : 0);
        if (!canHit) s -= 280;
        return s;
      }
      if (name === '临阵磨枪') {
        const t = t0;
        if (!t || !tMine) return -1;
        let s = 260;
        if (!t.tapped) s += 80;
        return s;
      }
      if (name === '灵质榨取') {
        if (move.mode === 'bury') return myHand.length >= 4 ? 320 : 130;
        return myHand.length <= 2 ? 300 : 240;
      }
      if (name === '灵魂交易') {
        const g = targets.length ? findIn(me.grave, targets[0]) : null;
        return 210 + (g ? unitValue(g) * 0.45 + 60 : -120);
      }
      if (name === '火种祭坛') return 190;
      if (name === '蹒跚的僵尸') return 330;
      if (name === '黑暗聚合体') return myField.length < 2 ? 240 : 150;
      if (name === '灰烬小僧') return myField.length < 2 ? 320 : 260;
      if (name === '熔岩投手') return 330;
      if (c.type === '灵像' || c.token) {
        let s = 280 + (c.atk || 0) * 2 + (c.imp || 0) * 35 - costOf(c) * 12;
        if (kwOf(c).includes('敏捷')) s += 55;
        if (kwOf(c).includes('预制')) s += 45;
        if (kwOf(c).includes('自愈')) s += 25;
        if (myField.length < 2) s += 90;
        if (myField.length >= 5) s -= 90;
        return s;
      }
      return 80;
    }

    default:
      return 0;
  }
}

// ────────────────────────────────────────────────────────────
// 入口：必须原样返回 moves 中的一个元素，任何异常都退回让过
// ────────────────────────────────────────────────────────────

export function choose(view, moves) {
  try {
    if (!moves || !moves.length) return { type: 'pass' };
    let best = null;
    let bestScore = -Infinity;
    for (const m of moves) {
      const s = scoreMove(view, m, moves);
      if (s > bestScore) { bestScore = s; best = m; }
    }
    if (best) return best;
    return moves.find((m) => m.type === 'pass') || moves[moves.length - 1];
  } catch (e) {
    return (moves && moves.find((m) => m.type === 'pass')) || (moves && moves[moves.length - 1]) || { type: 'pass' };
  }
}
