/* =========================================================
   デュエマ風トランプゲーム 完全版 game.js
   （ST＋JOKER＋J特例バトル対応）

   ▼カード能力まとめ
   - 5：召喚時 山札の上から1枚マナへ
   - 6：召喚時 1ドロー
   - 7：スピードアタッカー
   - 10：召喚時 相手手札ランダム1枚墓地へ（ハンデス）
   - A：呪文(4) 相手バトル1体破壊
   - 9：呪文(9) 相手バトル全てレスト
   - Q(12), K(13)：Wブレイカー
   - J：特例バトル
       Q, K には勝利
       7, 8, 10 には敗北
   - JOKER(JK1,JK2)：コスト13 / ブロッカー / スピードアタッカー / ST
       召喚時：全バトルゾーンのカードを墓地へ（自分のジョーカーだけ残る）
       バトル特例：3,4,J に必ず負ける
   - ブロック：1体につき1ターン1回
   - アンタップ：自分ターン開始時のみ
   - ST：A,2,8,9,Q,JK1,JK2
       プレイヤー → confirm で発動するか選択（発動しないなら手札へ）
       CPU → Zロジックで自動判断
========================================================= */

const suits  = ["s","h","d","k"];
const values = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

const blockerValues         = ["2","3","4","8","J","K"];
const blockerNoAttackValues = ["2","3","8"];
const speedAttackerValues   = ["7","K","JK1","JK2"]; // Joker も召喚酔いしない
const wBreakValues          = ["Q","K"];
const shieldTriggerValues   = ["A","2","8","9","Q","JK1","JK2"]; // ST 対象
const jokerValues           = ["JK1","JK2"];

// ゾーン
let deck = [];
let cpuDeck = [];

let hand   = [];
let battle = [];
let shield = [];
let mana   = [];

let cpuHand   = [];
let cpuBattle = [];
let cpuShield = [];
let cpuMana   = [];

let grave    = [];
let cpuGrave = [];

// 状態
let turn           = 1;
let isPlayerTurn   = true;
let gameOver       = false;
let selectedHandIndex   = null;
let selectedBattleIndex = null;

let playerUsedEnergy = 0;
let cpuUsedEnergy    = 0;

let manaCharged    = false;
let cpuManaCharged = false;

let currentCpuAttacker = null;
let cpuAttackQueue     = [];

const cpuLog = document.getElementById("cpu-log");

/* ---------------------------------------------------------
   コスト / パワー
--------------------------------------------------------- */
function getCost(v) {
  if (v === "A") return 4;   // 呪文A
  if (v === "9") return 9;   // 呪文9
  if (v === "JK1" || v === "JK2") return 13; // Joker
  if (v === "J") return 11;
  if (v === "Q") return 12;
  if (v === "K") return 13;
  return parseInt(v);
}

function getPower(card) {
  return card.cost;
}

/* ---------------------------------------------------------
   デッキ生成
--------------------------------------------------------- */
function createDeck() {
  deck = [];
  cpuDeck = [];

  // 通常カード
  suits.forEach(s => {
    values.forEach(v => {
      const c = {
        suit:   s,
        value:  v,
        cost:   getCost(v),
        blocker:    blockerValues.includes(v),
        cantAttack: blockerNoAttackValues.includes(v)
      };
      deck.push({ ...c });
      cpuDeck.push({ ...c });
    });
  });

  // Joker 2枚（JK1, JK2）
  const jokers = [
    { suit: "j", value: "JK1", img: "j01.png" },
    { suit: "j", value: "JK2", img: "j02.png" }
  ];

  jokers.forEach(jk => {
    const base = {
      suit: jk.suit,
      value: jk.value,
      cost: 13,
      blocker: true,
      cantAttack: false
    };
    deck.push({ ...base });
    cpuDeck.push({ ...base });
  });

  shuffle(deck);
  shuffle(cpuDeck);
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [a[i], a[r]] = [a[r], a[i]];
  }
}

/* ---------------------------------------------------------
   ゲーム開始
--------------------------------------------------------- */
function startGame() {
  createDeck();

  shield = deck.splice(0,5);
  hand   = deck.splice(0,5);

  cpuShield = cpuDeck.splice(0,5);
  cpuHand   = cpuDeck.splice(0,5);

  battle = [];
  mana   = [];
  grave  = [];

  cpuBattle = [];
  cpuMana   = [];
  cpuGrave  = [];

  turn = 1;
  isPlayerTurn = true;
  gameOver = false;

  selectedHandIndex   = null;
  selectedBattleIndex = null;

  playerUsedEnergy = 0;
  cpuUsedEnergy    = 0;

  manaCharged    = false;
  cpuManaCharged = false;

  currentCpuAttacker = null;
  cpuAttackQueue     = [];

  cpuLog.innerHTML = "";

  startTurn();
}

/* ---------------------------------------------------------
   ターン開始（自分側だけアンタップ）
--------------------------------------------------------- */
function startTurn() {
  document.getElementById("turn-number").textContent = `ターン: ${turn}`;

  if (isPlayerTurn) {
    playerUsedEnergy = 0;
    document.getElementById("player-turn-panel").classList.remove("hidden");

    battle.forEach(c => {
      c.rest = false;
      c.hasAttacked = false;
      c.hasBlocked  = false;
      if (c.summoningSick) c.summoningSick = false;
    });

  } else {
    cpuUsedEnergy = 0;
    document.getElementById("cpu-turn-panel").classList.remove("hidden");

    cpuBattle.forEach(c => {
      c.rest = false;
      c.hasAttacked = false;
      c.hasBlocked  = false;
      if (c.summoningSick) c.summoningSick = false;
    });
  }

  if (turn > 1) {
    if (isPlayerTurn && deck.length > 0) hand.push(deck.shift());
    if (!isPlayerTurn && cpuDeck.length > 0) cpuHand.push(cpuDeck.shift());
  }

  manaCharged    = false;
  cpuManaCharged = false;

  render();
}

/* ---------------------------------------------------------
   ターン終了
--------------------------------------------------------- */
function endTurn() {
  if (gameOver) return;

  isPlayerTurn = !isPlayerTurn;
  if (isPlayerTurn) turn++;

  startTurn();
}

document.getElementById("end-turn-btn").onclick = () => {
  if (isPlayerTurn && !gameOver) endTurn();
};

/* ---------------------------------------------------------
   ターン開始パネル
--------------------------------------------------------- */
document.getElementById("btn-player-start").onclick = () => {
  document.getElementById("player-turn-panel").classList.add("hidden");
};
document.getElementById("btn-cpu-start").onclick = () => {
  document.getElementById("cpu-turn-panel").classList.add("hidden");
  cpuAction();
};

/* ---------------------------------------------------------
   CPU 行動
--------------------------------------------------------- */
function cpuAction() {
  if (gameOver) return;

  logCPU(`=== CPUターン開始（${turn}） ===`);

  // マナチャージ
  if (!cpuManaCharged && cpuHand.length > 0) {
    cpuHand.sort((a, b) => a.cost - b.cost);
    const c = cpuHand.shift();
    cpuMana.push({ ...c });
    cpuManaCharged = true;
    logCPU(`CPUが ${cardName(c)} をマナに置いた`);
  }

  // 呪文使用 or 召喚（高コスト優先）
  while (true) {
    const usable = cpuMana.length - cpuUsedEnergy;
    const candidates = cpuHand.filter(c => c.cost <= usable);
    if (candidates.length === 0) break;

    candidates.sort((a, b) => b.cost - a.cost);
    const chosen = candidates[0];

    // 呪文 A / 9
    if (chosen.value === "A" || chosen.value === "9") {
      cpuUsedEnergy += chosen.cost;
      playSpell(chosen, true);
      cpuHand.splice(cpuHand.indexOf(chosen), 1);
      continue;
    }

    // クリーチャー召喚（Joker含む）
    cpuUsedEnergy += chosen.cost;
    const summoned = {
      ...chosen,
      summoningSick: !speedAttackerValues.includes(chosen.value),
      hasAttacked: false,
      hasBlocked:  false,
      rest: false
    };
    cpuBattle.push(summoned);
    cpuHand.splice(cpuHand.indexOf(chosen), 1);

    logCPU(`CPUが ${cardName(chosen)} を召喚（コスト ${chosen.cost}）`);

    triggerOnSummon(summoned, true);
  }

  render();

  // 攻撃準備
  cpuAttackQueue = cpuBattle.filter(
    c => !c.summoningSick && !c.hasAttacked && !c.cantAttack
  );

  if (cpuAttackQueue.length === 0) {
    logCPU("CPUは攻撃しなかった");
    logCPU("=== CPUターン終了 ===");
    endTurn();
    return;
  }

  logCPU(`CPUは ${cpuAttackQueue.length} 体で攻撃準備`);
  startNextCpuAttack();
}

/* ---------------------------------------------------------
   CPU攻撃キュー処理
--------------------------------------------------------- */
function startNextCpuAttack() {
  if (gameOver) return;

  while (cpuAttackQueue.length > 0) {
    const attacker = cpuAttackQueue.shift();

    if (!cpuBattle.includes(attacker)) continue;
    if (attacker.hasAttacked || attacker.cantAttack || attacker.summoningSick) continue;

    currentCpuAttacker = attacker;
    cpuAttack();
    return;
  }

  logCPU("⚔ CPUの攻撃終了");
  logCPU("=== CPUターン終了 ===");
  endTurn();
}

/* ---------------------------------------------------------
   CPU攻撃処理（1体分）
--------------------------------------------------------- */
function cpuAttack() {
  const attacker = currentCpuAttacker;
  if (!attacker || gameOver) return;

  const idx = cpuBattle.indexOf(attacker);
  const attackerEl = document.querySelectorAll("#cpu-battle-zone .card")[idx];
  if (attackerEl) {
    attackerEl.classList.add("attack-flash");
    setTimeout(() => attackerEl.classList.remove("attack-flash"), 400);
  }

  logCPU(`⚔ CPUの ${cardName(attacker)} の攻撃！`);

  if (attacker.cantAttack) {
    attacker.hasAttacked = true;
    attacker.rest        = true;
    finishCpuAttack();
    return;
  }

  // プレイヤーブロッカー
// ★ タップしているカードはブロック不可
const playerBlockers = battle.filter(
  c => c.blocker && !c.hasBlocked && !c.rest
);
  if (playerBlockers.length > 0) {
    openPlayerBlockPanel(attacker, playerBlockers);
    return;
  }

  // Wブレイカー効果
  let breakCount = wBreakValues.includes(attacker.value) ? 2 : 1;
  breakCount = breakPlayerShields(attacker, breakCount);

  if (shield.length === 0 && breakCount > 0) {
    alert("CPUの直接攻撃！あなたの敗北…");
    attacker.hasAttacked = true;
    attacker.rest        = true;
    gameOver = true;
    render();
    return;
  }

  attacker.hasAttacked = true;
  attacker.rest        = true;
  render();
  finishCpuAttack();
}

function finishCpuAttack() {
  currentCpuAttacker = null;
  if (!gameOver) startNextCpuAttack();
}

/* ---------------------------------------------------------
   CPU 防御側ブロッカー選択（賢く選ぶ）
--------------------------------------------------------- */
function chooseCpuBlocker(attacker, blockers) {
  const ap = getPower(attacker);
  const strong = blockers.filter(b => getPower(b) >= ap);

  if (strong.length > 0) {
    strong.sort((a, b) => getPower(a) - getPower(b));
    return strong[0];
  }

  blockers.sort((a, b) => getPower(a) - getPower(b));
  return blockers[0];
}

/* ---------------------------------------------------------
   プレイヤーのブロック選択 UI
--------------------------------------------------------- */
function openPlayerBlockPanel(attacker, blockers) {
  const panel = document.getElementById("block-select-panel");
  const list  = document.getElementById("block-select-list");
  const cancelBtn = document.getElementById("block-select-cancel");

  panel.classList.remove("hidden");
  list.innerHTML = "";

  blockers.forEach(blocker => {
    const cardDiv = document.createElement("div");
    cardDiv.className = "card";

    const img = document.createElement("img");
    img.className = "card-img";
    img.src = getCardImagePath(blocker);
    cardDiv.appendChild(img);

    if (blocker.blocker) {
      const bd = document.createElement("div");
      bd.className = "blocker-badge";
      bd.textContent = "B";
      cardDiv.appendChild(bd);
    }

    cardDiv.onclick = () => {
      const idx = battle.indexOf(blocker);
      logCPU(`🛡 プレイヤーの ${cardName(blocker)} がブロック！`);

      blocker.hasBlocked = true;
      blocker.rest       = true;

      battleCards(attacker, blocker, idx, false);

      attacker.hasAttacked = true;
      attacker.rest        = true;

      panel.classList.add("hidden");
      finishCpuAttack();
    };

    list.appendChild(cardDiv);
  });

  cancelBtn.onclick = () => {
    panel.classList.add("hidden");

    let breakCount = wBreakValues.includes(attacker.value) ? 2 : 1;
    breakCount = breakPlayerShields(attacker, breakCount);

    if (shield.length === 0 && breakCount > 0) {
      alert("CPUの直接攻撃！あなたの敗北…");
      attacker.hasAttacked = true;
      attacker.rest        = true;
      gameOver = true;
      render();
      return;
    }

    attacker.hasAttacked = true;
    attacker.rest        = true;

    render();
    finishCpuAttack();
  };
}

/* ---------------------------------------------------------
   バトル処理（ブロック時バトル）★J特例・JOKER特例あり
--------------------------------------------------------- */
function battleCards(attacker, defender, defenderIndex, isCPUDefender) {
  const ap = getPower(attacker);
  const dp = getPower(defender);

  /* -----------------------------------------
     ▼ Joker 特例：3,4,J に必ず負ける
  ----------------------------------------- */
  if (jokerValues.includes(attacker.value) &&
      ["3","4","J"].includes(defender.value)) {

    logCPU(`☠ ジョーカー(${cardName(attacker)})は ${cardName(defender)} に敗北！`);

    if (isCPUDefender) {
      grave.push(attacker);
      battle.splice(battle.indexOf(attacker), 1);
    } else {
      cpuGrave.push(attacker);
      cpuBattle.splice(cpuBattle.indexOf(attacker), 1);
    }
    render();
    return;
  }

  if (jokerValues.includes(defender.value) &&
      ["3","4","J"].includes(attacker.value)) {

    logCPU(`☠ ジョーカー(${cardName(defender)})は ${cardName(attacker)} に敗北！`);

    if (isCPUDefender) {
      cpuGrave.push(defender);
      cpuBattle.splice(defenderIndex, 1);
    } else {
      grave.push(defender);
      battle.splice(defenderIndex, 1);
    }
    render();
    return;
  }

  /* -----------------------------------------
     ▼ J（ジャック）の特例ルール
       - J は Q/K に勝つ
       - J は 7/8/10 に負ける
  ----------------------------------------- */

  // 攻撃側 J
  if (attacker.value === "J") {
    // J が Q, K に勝つ
    if (["Q","K"].includes(defender.value)) {
      logCPU(`⚡ 特例：${cardName(attacker)} は ${cardName(defender)} に勝利！`);

      if (isCPUDefender) {
        cpuGrave.push(defender);
        cpuBattle.splice(defenderIndex, 1);
      } else {
        grave.push(defender);
        battle.splice(defenderIndex, 1);
      }
      render();
      return;
    }

    // J が 7,8,10 に負ける
    if (["7","8","10"].includes(defender.value)) {
      logCPU(`☠ 特例：${cardName(attacker)} は ${cardName(defender)} に敗北！`);

      if (isCPUDefender) {
        grave.push(attacker);
        battle.splice(battle.indexOf(attacker), 1);
      } else {
        cpuGrave.push(attacker);
        cpuBattle.splice(cpuBattle.indexOf(attacker), 1);
      }
      render();
      return;
    }
  }

  // 防御側 J
  if (defender.value === "J") {
    // J が Q, K に勝つ（防御側 J）
    if (["Q","K"].includes(attacker.value)) {
      logCPU(`⚡ 特例：${cardName(defender)} は ${cardName(attacker)} に勝利！`);

      if (isCPUDefender) {
        grave.push(attacker);
        battle.splice(battle.indexOf(attacker), 1);
      } else {
        cpuGrave.push(attacker);
        cpuBattle.splice(cpuBattle.indexOf(attacker), 1);
      }
      render();
      return;
    }

    // J が 7,8,10 に負ける
    if (["7","8","10"].includes(attacker.value)) {
      logCPU(`☠ 特例：${cardName(defender)} は ${cardName(attacker)} に敗北！`);

      if (isCPUDefender) {
        cpuGrave.push(defender);
        cpuBattle.splice(defenderIndex, 1);
      } else {
        grave.push(defender);
        battle.splice(defenderIndex, 1);
      }
      render();
      return;
    }
  }

  /* -----------------------------------------
     ▼ 通常バトル（パワー勝負）
  ----------------------------------------- */

  logCPU(`🛡 ${cardName(defender)} が ${cardName(attacker)} をブロック！`);

  if (ap > dp) {
    if (isCPUDefender) {
      cpuGrave.push(defender);
      cpuBattle.splice(defenderIndex, 1);
    } else {
      grave.push(defender);
      battle.splice(defenderIndex, 1);
    }

    logCPU(`💥 ${cardName(attacker)} が ${cardName(defender)} を倒した！`);
    alert(`${cardName(attacker)} が ${cardName(defender)} を倒した！`);

  } else if (ap < dp) {
    if (isCPUDefender) {
      grave.push(attacker);
      battle.splice(battle.indexOf(attacker), 1);
    } else {
      cpuGrave.push(attacker);
      cpuBattle.splice(cpuBattle.indexOf(attacker), 1);
    }

    logCPU(`☠ ${cardName(attacker)} はブロックされて倒された…`);
    alert(`${cardName(attacker)} はブロックされて倒された…`);

  } else {
    if (isCPUDefender) {
      cpuGrave.push(defender);
      cpuBattle.splice(defenderIndex, 1);
      grave.push(attacker);
      battle.splice(battle.indexOf(attacker), 1);
    } else {
      grave.push(defender);
      battle.splice(defenderIndex, 1);
      cpuGrave.push(attacker);
      cpuBattle.splice(cpuBattle.indexOf(attacker), 1);
    }

    logCPU("⚡ 相打ち！");
    alert("相打ち！");
  }

  render();
}

/* ---------------------------------------------------------
   カード画像
--------------------------------------------------------- */
function getCardImagePath(card) {
  if (card.value === "JK1") return "imgs/j01.png";
  if (card.value === "JK2") return "imgs/j02.png";
  return `imgs/${card.suit}${valueToNumber(card.value)}.png`;
}

function valueToNumber(v) {
  if (v === "A") return "01";
  if (v === "J") return "11";
  if (v === "Q") return "12";
  if (v === "K") return "13";
  if (v.length === 1) return "0" + v;
  return v;
}

/* ---------------------------------------------------------
   描画（ゾーン共通）
--------------------------------------------------------- */
function render() {
  renderZone("hand-zone", hand, "player-hand");
  renderZone("battle-zone", battle, "player-battle");
  renderZone("shield-zone", shield, "player-shield");

  renderZone("cpu-hand-zone", cpuHand, "cpu-hand");
  renderZone("cpu-battle-zone", cpuBattle, "cpu-battle");
  renderZone("cpu-shield-zone", cpuShield, "cpu-shield");

  renderDeckAndGrave();

  document.getElementById("player-energy").innerHTML =
    `エネルギー<br>${mana.length - playerUsedEnergy} / ${mana.length}`;
  document.getElementById("cpu-energy").innerHTML =
    `エネルギー<br>${cpuMana.length - cpuUsedEnergy} / ${cpuMana.length}`;
}

function renderZone(id, cards, zoneType) {
  const zone = document.getElementById(id);
  zone.innerHTML = "";

  cards.forEach((c, index) => {
    const div = document.createElement("div");
    div.className = "card";
    if (c.rest) div.classList.add("rest");

    const img = document.createElement("img");
    img.className = "card-img";

    if (zoneType === "cpu-hand" ||
        zoneType === "player-shield" ||
        zoneType === "cpu-shield") {
      img.src = "imgs/back.png";
    } else {
      img.src = getCardImagePath(c);
    }
    div.appendChild(img);

    if (c.blocker) {
      const bd = document.createElement("div");
      bd.className = "blocker-badge";
      bd.textContent = "B";
      div.appendChild(bd);
    }

    // ========= 手札クリック → アクションパネル =========
    if (zoneType === "player-hand" && isPlayerTurn && !gameOver) {
      div.onclick = () => {
        if (gameOver) return;

        document.querySelectorAll("#hand-zone .card")
          .forEach(x => x.classList.remove("selected"));
        div.classList.add("selected");

        selectedHandIndex = index;
        document.getElementById("action-panel").classList.remove("hidden");
      };
    }

    // ========= バトルカードクリック → 攻撃パネル =========
    if (zoneType === "player-battle" && isPlayerTurn && !gameOver) {
      div.onclick = () => {
        if (gameOver) return;

        const ref = battle[index];

        if (ref.summoningSick) {
          alert("召喚酔い中です");
          return;
        }
        if (ref.hasAttacked) {
          alert("このターンはすでに攻撃済みです");
          return;
        }
        if (ref.cantAttack) {
          alert("このカードは攻撃できません");
          return;
        }

        document.querySelectorAll("#battle-zone .card")
          .forEach(x => x.classList.remove("selected"));
        div.classList.add("selected");

        selectedBattleIndex = index;
        document.getElementById("attack-panel").classList.remove("hidden");
      };
    }

    zone.appendChild(div);
  });

  if (id === "hand-zone" || id === "cpu-hand-zone") {
    arrangeHandFan(id);
  }
}

/* ---------------------------------------------------------
   扇形配置
--------------------------------------------------------- */
function arrangeHandFan(id) {
  const cards = document.querySelectorAll(`#${id} .card`);
  const total = cards.length;
  if (total === 0) return;

  const spread = 50;
  const start  = -spread / 2;

  cards.forEach((el, i) => {
    const angle = start + (spread / (total - 1 || 1)) * i;
    el.style.transform = `rotate(${angle}deg)`;
  });
}

/* ---------------------------------------------------------
   山札・墓地表示
--------------------------------------------------------- */
function renderDeckAndGrave() {
  document.getElementById("player-deck-zone").innerHTML = `
    <img src="imgs/back.png" class="card-img">
    <div class="deck-count">${deck.length}</div>
  `;

  const pg = document.getElementById("player-grave-zone");
  if (grave.length > 0) {
    const top = grave[grave.length - 1];
    pg.innerHTML = `
      <img src="${getCardImagePath(top)}" class="card-img">
      <div class="deck-count">${grave.length}</div>
    `;
  } else pg.innerHTML = "";

  document.getElementById("cpu-deck-zone").innerHTML = `
    <img src="imgs/back.png" class="card-img">
    <div class="deck-count">${cpuDeck.length}</div>
  `;

  const cg = document.getElementById("cpu-grave-zone");
  if (cpuGrave.length > 0) {
    const top = cpuGrave[cpuGrave.length - 1];
    cg.innerHTML = `
      <img src="${getCardImagePath(top)}" class="card-img">
      <div class="deck-count">${cpuGrave.length}</div>
    `;
  } else cg.innerHTML = "";
}

/* ---------------------------------------------------------
   手札アクション（マナ / 召喚）
--------------------------------------------------------- */
document.getElementById("btn-mana").onclick = () => {
  if (gameOver) return;

  if (manaCharged) {
    alert("このターンはすでにエネルギーをチャージしています");
    return;
  }

  const c = hand[selectedHandIndex];
  mana.push({ ...c });
  hand.splice(selectedHandIndex, 1);

  manaCharged = true;
  closePanels();
  render();
};

document.getElementById("btn-summon").onclick = () => {
  if (gameOver) return;

  const c = hand[selectedHandIndex];
  const usable = mana.length - playerUsedEnergy;

  if (usable < c.cost) {
    alert(`エネルギー不足（必要${c.cost} / 残り${usable}）`);
    return;
  }

  // 呪文（A / 9）
  if (c.value === "A" || c.value === "9") {
    playerUsedEnergy += c.cost;
    playSpell(c, false);
    hand.splice(selectedHandIndex, 1);
    closePanels();
    render();
    return;
  }

  // 召喚
  playerUsedEnergy += c.cost;
  const summoned = {
    ...c,
    summoningSick: !speedAttackerValues.includes(c.value),
    hasAttacked: false,
    hasBlocked: false,
    rest: false
  };
  battle.push(summoned);
  hand.splice(selectedHandIndex, 1);

  triggerOnSummon(summoned, false);
  closePanels();
  render();
};

document.getElementById("btn-cancel").onclick = closePanels;

function closePanels() {
  document.getElementById("action-panel").classList.add("hidden");
  document.getElementById("attack-panel").classList.add("hidden");
  document.getElementById("block-select-panel").classList.add("hidden");

  selectedHandIndex   = null;
  selectedBattleIndex = null;

  document
    .querySelectorAll("#hand-zone .card, #battle-zone .card")
    .forEach(x => x.classList.remove("selected"));
}

/* ---------------------------------------------------------
   プレイヤー攻撃
--------------------------------------------------------- */
document.getElementById("btn-attack").onclick = () => {
  if (gameOver) return;

  const attacker = battle[selectedBattleIndex];
  if (!attacker) {
    closePanels();
    return;
  }

  if (attacker.summoningSick) {
    alert("召喚酔い中です");
    return;
  }
  if (attacker.hasAttacked) {
    alert("このターンはすでに攻撃済みです");
    return;
  }
  if (attacker.cantAttack) {
    alert("このカードは攻撃できません");
    closePanels();
    return;
  }

  const attackerEl = document.querySelectorAll("#battle-zone .card")[selectedBattleIndex];
  if (attackerEl) {
    attackerEl.classList.add("attack-flash");
    setTimeout(() => attackerEl.classList.remove("attack-flash"), 400);
  }

// ★ タップしているカードはブロック不可
const cpuBlockers = cpuBattle.filter(
  c => c.blocker && !c.hasBlocked && !c.rest
);

  if (cpuBlockers.length > 0) {
    const blocker = chooseCpuBlocker(attacker, cpuBlockers);
    const idx     = cpuBattle.indexOf(blocker);

    logCPU(`🛡 CPUの ${cardName(blocker)} がブロック！`);

    blocker.hasBlocked = true;
    blocker.rest       = true;

    battleCards(attacker, blocker, idx, true);

    attacker.hasAttacked = true;
    attacker.rest        = true;

    closePanels();
    return;
  }

  let breakCount = wBreakValues.includes(attacker.value) ? 2 : 1;
  breakCount = breakCpuShields(attacker, breakCount);

  if (cpuShield.length === 0 && breakCount > 0) {
    alert("直接攻撃！あなたの勝利！！");
    attacker.hasAttacked = true;
    attacker.rest        = true;
    gameOver = true;
    closePanels();
    render();
    return;
  }

  attacker.hasAttacked = true;
  attacker.rest        = true;

  closePanels();
  render();
};

/* ---------------------------------------------------------
   召喚時効果（5 / 6 / 10 / Joker）
--------------------------------------------------------- */
function triggerOnSummon(card, isCPU) {

  // Joker 召喚時：全バトル破壊（自分のジョーカーだけ残す）
  if (jokerValues.includes(card.value)) {

    const newBattle = [];
    battle.forEach(c => {
      if (!isCPU && c === card) newBattle.push(c);
      else grave.push(c);
    });
    battle = newBattle;

    const newCpuBattle = [];
    cpuBattle.forEach(c => {
      if (isCPU && c === card) newCpuBattle.push(c);
      else cpuGrave.push(c);
    });
    cpuBattle = newCpuBattle;

    logCPU(`✨ ${isCPU ? "CPUの" : "あなたの"}ジョーカー召喚時効果：全バトルゾーン破壊！`);
    render();
  }

  // 5：マナブースト
  if (card.value === "5") {
    if (!isCPU) {
      if (deck.length > 0) {
        mana.push(deck.shift());
        logCPU(`✨ あなたの ${cardName(card)}：マナ+1`);
      }
    } else {
      if (cpuDeck.length > 0) {
        cpuMana.push(cpuDeck.shift());
        logCPU(`✨ CPUの ${cardName(card)}：マナ+1`);
      }
    }
    render();
  }

  // 6：ドロー
  if (card.value === "6") {
    if (!isCPU) {
      if (deck.length > 0) {
        const d = deck.shift();
        hand.push(d);
        logCPU(`✨ あなたの ${cardName(card)}：1ドロー`);
      }
    } else {
      if (cpuDeck.length > 0) {
        const d = cpuDeck.shift();
        cpuHand.push(d);
        logCPU(`✨ CPUの ${cardName(card)}：1ドロー`);
      }
    }
    render();
  }

  // 10：ハンデス
  if (card.value === "10") {
    if (!isCPU) {
      if (cpuHand.length > 0) {
        const idx = Math.floor(Math.random() * cpuHand.length);
        const removed = cpuHand.splice(idx, 1)[0];
        cpuGrave.push(removed);
        logCPU(`✨ あなたの ${cardName(card)}：CPU手札を1枚墓地へ`);
      }
    } else {
      if (hand.length > 0) {
        const idx = Math.floor(Math.random() * hand.length);
        const removed = hand.splice(idx, 1)[0];
        grave.push(removed);
        logCPU(`✨ CPUの ${cardName(card)}：あなたの手札1枚を墓地へ`);
      }
    }
    render();
  }

  // K：召喚時、山札の上から1枚シールドに追加
if (card.value === "K") {
    if (!isCPU) {
        if (deck.length > 0) {
            const top = deck.shift();
            shield.push(top); // シールドに追加（裏向き扱い）
            logCPU(`✨ あなたの ${cardName(card)} の効果！ シールド+1`);
        } else {
            logCPU(`✨ ${cardName(card)} の効果：山札がないため不発`);
        }
    } else {
        if (cpuDeck.length > 0) {
            const top = cpuDeck.shift();
            cpuShield.push(top);
            logCPU(`✨ CPUの ${cardName(card)} の効果！ シールド+1`);
        } else {
            logCPU(`✨ CPUの ${cardName(card)} の効果：山札なし不発`);
        }
    }
    render();
}

}

/* ---------------------------------------------------------
   呪文（A / 9）
--------------------------------------------------------- */
function playSpell(card, isCPU) {

  // A：単体破壊
  if (card.value === "A") {
    if (!isCPU) {
      if (cpuBattle.length === 0) {
        logCPU("A：相手場にカードなし（不発）");
      } else {
        const listText = cpuBattle
          .map((c, i) => `${i+1}: ${cardName(c)}（コスト${c.cost}）`)
          .join("\n");
        const sel = prompt("破壊する相手クリーチャー番号:\n" + listText);
        const n = parseInt(sel, 10);
        if (!isNaN(n) && n >= 1 && n <= cpuBattle.length) {
          const target = cpuBattle.splice(n-1, 1)[0];
          cpuGrave.push(target);
          logCPU(`A：CPUの ${cardName(target)} を破壊！`);
        }
      }

    } else {
      if (battle.length === 0) {
        logCPU("CPUのA：あなたの場が空（不発）");
      } else {
        const sorted = [...battle].sort((a, b) => getPower(b) - getPower(a));
        const target = sorted[0];
        grave.push(target);
        battle.splice(battle.indexOf(target), 1);
        logCPU(`CPUのA：あなたの ${cardName(target)} を破壊！`);
      }
    }
  }

  // 9：全レスト
  if (card.value === "9") {
    if (!isCPU) {
      cpuBattle.forEach(c => c.rest = true);
      logCPU("9：CPUのバトルゾーンをすべてレスト！");
    } else {
      battle.forEach(c => c.rest = true);
      logCPU("CPUの9：あなたのバトルゾーンをレスト！");
    }
  }

  // 呪文は墓地へ
  if (!isCPU) grave.push(card);
  else cpuGrave.push(card);

  render();
}

/* ---------------------------------------------------------
   ST（プレイヤー）
--------------------------------------------------------- */
function handlePlayerShieldTrigger(card) {
  const use = confirm(`シールドトリガー発動: ${cardName(card)} を使いますか？`);
  if (use) {
    logCPU(`✨ ST発動！ ${cardName(card)}`);

    if (card.value === "A" || card.value === "9") {
      playSpell(card, false);
    } else if (jokerValues.includes(card.value)) {
      const summoned = {
        ...card,
        summoningSick: false,
        hasAttacked: false,
        hasBlocked: false,
        rest: false
      };
      battle.push(summoned);
      triggerOnSummon(summoned, false);
      render();
    } else {
      battle.push({
        ...card,
        summoningSick: false,
        hasAttacked: false,
        hasBlocked: false,
        rest: false
      });
      render();
    }

  } else {
    hand.push(card);
    logCPU(`ST を温存：${cardName(card)} を手札へ`);
  }
}

/* ---------------------------------------------------------
   ST（CPU）
--------------------------------------------------------- */
function shouldCpuUseShieldTrigger(card) {
  const cpuField    = cpuBattle.length;
  const playerField = battle.length;

  if (cpuField <= 1 && playerField >= 3) return true;
  if (cpuField >= 3 && playerField <= 1) return false;
  return Math.random() < 0.5;
}

function handleCpuShieldTrigger(card) {
  const use = shouldCpuUseShieldTrigger(card);

  if (use) {
    logCPU(`✨ CPUのST発動！ ${cardName(card)}`);

    if (card.value === "A" || card.value === "9") {
      playSpell(card, true);
    } else if (jokerValues.includes(card.value)) {
      const summoned = {
        ...card,
        summoningSick: false,
        hasAttacked: false,
        hasBlocked: false,
        rest: false
      };
      cpuBattle.push(summoned);
      triggerOnSummon(summoned, true);
      render();
    } else {
      cpuBattle.push({
        ...card,
        summoningSick: false,
        hasAttacked: false,
        hasBlocked: false,
        rest: false
      });
      render();
    }

  } else {
    cpuHand.push(card);
    logCPU(`CPUはSTを温存：${cardName(card)} を手札へ`);
  }
}

/* ---------------------------------------------------------
   シールドブレイク（プレイヤー→CPU）
--------------------------------------------------------- */
function breakCpuShields(attacker, breakCount) {
  while (breakCount > 0 && cpuShield.length > 0) {
    const broken = cpuShield.shift();

    if (shieldTriggerValues.includes(broken.value)) {
      handleCpuShieldTrigger(broken);
    } else {
      cpuGrave.push(broken);
    }

    const cpuShieldZone = document.getElementById("cpu-shield-zone");
    if (cpuShieldZone) {
      cpuShieldZone.classList.add("break");
      setTimeout(() => cpuShieldZone.classList.remove("break"), 500);
    }

    logCPU(`💥 あなたの ${cardName(attacker)} が CPU シールドをブレイク！`);
    breakCount--;
  }
  return breakCount;
}

/* ---------------------------------------------------------
   シールドブレイク（CPU→プレイヤー）
--------------------------------------------------------- */
function breakPlayerShields(attacker, breakCount) {
  while (breakCount > 0 && shield.length > 0) {
    const broken = shield.shift();

    if (shieldTriggerValues.includes(broken.value)) {
      handlePlayerShieldTrigger(broken);
    } else {
      grave.push(broken);
    }

    const shieldZone = document.getElementById("shield-zone");
    if (shieldZone) {
      shieldZone.classList.add("break");
      setTimeout(() => shieldZone.classList.remove("break"), 500);
    }

    logCPU(`💥 CPUの ${cardName(attacker)} がシールドをブレイク！`);
    breakCount--;
  }
  return breakCount;
}

/* ---------------------------------------------------------
   ログヘルパー
--------------------------------------------------------- */
function logCPU(msg) {
  const div = document.createElement("div");
  div.textContent = msg;
  cpuLog.appendChild(div);
  cpuLog.scrollTop = cpuLog.scrollHeight;
}

function cardName(c) {
  return `${c.suit}${c.value}`;
}

/* ---------------------------------------------------------
   ゲーム開始
--------------------------------------------------------- */
startGame();
