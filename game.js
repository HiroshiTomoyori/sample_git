/* =========================================================
   デュエマ風トランプゲーム 完全版 game.js
   - ブロッカー（2,3,4,8,J,K）
   - 攻撃不可ブロッカー：2,3,8
   - レスト状態（攻撃済は横向き）
   - ターン開始でアンタップ
   - 防御側はブロッカー選択可能
   - CPUも複数ブロッカーからAIで選択
   - 召喚酔いあり
   - 毎ターンエネルギー全回復
   - 直接攻撃で勝敗
========================================================= */

/* ---------------------------------------------------------
   定義
--------------------------------------------------------- */
const suits = ["s", "h", "d", "k"];
const values = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

const blockerValues = ["2","3","4","8","J","K"];      // ブロッカー
const blockerNoAttackValues = ["2","3","8"];          // 攻撃できないブロッカー

// デッキ
let deck = [];
let cpuDeck = [];

// プレイヤーゾーン
let hand = [];
let battle = [];
let shield = [];
let mana = [];

// CPUゾーン
let cpuHand = [];
let cpuBattle = [];
let cpuShield = [];
let cpuMana = [];

// 墓地
let grave = [];
let cpuGrave = [];

// 状態管理
let turn = 1;
let isPlayerTurn = true;
let gameOver = false;

let selectedHandIndex = null;
let selectedBattleIndex = null;

let playerUsedEnergy = 0;
let cpuUsedEnergy = 0;

let manaCharged = false;
let cpuManaCharged = false;

let currentCpuAttacker = null;

const cpuLog = document.getElementById("cpu-log");

/* ---------------------------------------------------------
   カード関連
--------------------------------------------------------- */
function getCost(v) {
  if (v === "A") return 1;
  if (v === "J") return 11;
  if (v === "Q") return 12;
  if (v === "K") return 13;
  return parseInt(v);
}

function getPower(card) {
  return card.cost; // コスト＝パワー
}

/* デッキ生成 */
function createDeck() {
  deck = [];
  cpuDeck = [];

  suits.forEach(s => {
    values.forEach(v => {
      const card = {
        suit: s,
        value: v,
        cost: getCost(v),
        blocker: blockerValues.includes(v),
        cantAttack: blockerNoAttackValues.includes(v)
      };
      deck.push({ ...card });
      cpuDeck.push({ ...card });
    });
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
  mana = [];
  grave = [];

  cpuBattle = [];
  cpuMana = [];
  cpuGrave = [];

  turn = 1;
  isPlayerTurn = true;
  gameOver = false;

  selectedHandIndex = null;
  selectedBattleIndex = null;

  playerUsedEnergy = 0;
  cpuUsedEnergy = 0;

  manaCharged = false;
  cpuManaCharged = false;

  cpuLog.innerHTML = "";

  startTurn();
}

/* ---------------------------------------------------------
   ターン開始
--------------------------------------------------------- */
function startTurn() {
  manaCharged = false;
  cpuManaCharged = false;

  document.getElementById("turn-number").textContent = `ターン: ${turn}`;

  if (isPlayerTurn) {
    playerUsedEnergy = 0;
    document.getElementById("player-turn-panel").classList.remove("hidden");
  } else {
    cpuUsedEnergy = 0;
    document.getElementById("cpu-turn-panel").classList.remove("hidden");
  }

  // ドロー（2ターン目以降）
  if (turn > 1) {
    if (isPlayerTurn && deck.length > 0) hand.push(deck.shift());
    if (!isPlayerTurn && cpuDeck.length > 0) cpuHand.push(cpuDeck.shift());
  }

  // アンタップ
  battle.forEach(c => {
    c.rest = false;
    c.hasAttacked = false;
    if (c.summoningSick) c.summoningSick = false;
  });
  cpuBattle.forEach(c => {
    c.rest = false;
    c.hasAttacked = false;
    if (c.summoningSick) c.summoningSick = false;
  });

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
document.getElementById("btn-player-start").onclick = () =>
  document.getElementById("player-turn-panel").classList.add("hidden");

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

  // 召喚（高コスト優先）
  while (true) {
    const usable = cpuMana.length - cpuUsedEnergy;
    const candidates = cpuHand.filter(c => c.cost <= usable);
    if (candidates.length === 0) break;

    candidates.sort((a, b) => b.cost - a.cost);
    const chosen = candidates[0];

    cpuUsedEnergy += chosen.cost;
    cpuBattle.push({
      ...chosen,
      summoningSick: true,
      hasAttacked: false,
      rest: false
    });
    cpuHand.splice(cpuHand.indexOf(chosen), 1);

    logCPU(`CPUが ${cardName(chosen)} を召喚（${chosen.cost}）`);
  }

  render();

  // 攻撃候補
  const attacker = cpuBattle.find(
    c => !c.summoningSick && !c.hasAttacked && !c.cantAttack
  );

  if (!attacker) {
    logCPU("CPUは攻撃しなかった");
    logCPU("=== CPUターン終了 ===");
    endTurn();
    return;
  }

  currentCpuAttacker = attacker;
  cpuAttack();
}

/* ---------------------------------------------------------
   CPU攻撃処理
--------------------------------------------------------- */
function cpuAttack() {
  const attacker = currentCpuAttacker;
  if (!attacker || gameOver) return;

  if (attacker.cantAttack) {
    logCPU(`${cardName(attacker)} はブロッカー専用のため攻撃不可`);
    attacker.hasAttacked = true;
    attacker.rest = true;
    finishCpuAttack();
    return;
  }

  const playerBlockers = battle.filter(c => c.blocker);

  // プレイヤーに選ばせる
  if (playerBlockers.length > 0) {
    openPlayerBlockPanel(attacker, playerBlockers);
    return;
  }

  // シールド攻撃
  if (shield.length > 0) {
    const broken = shield.shift();
    grave.push(broken);
    logCPU(`CPUの ${cardName(attacker)} の攻撃！ シールドブレイク`);
    attacker.hasAttacked = true;
    attacker.rest = true;
    render();
    finishCpuAttack();
    return;
  }

  // 本体攻撃
  logCPU(`CPUの ${cardName(attacker)} の攻撃！ 直接攻撃！`);
  alert("CPUの直接攻撃！あなたの敗北…");
  attacker.hasAttacked = true;
  attacker.rest = true;
  gameOver = true;
  render();
}

/* CPU攻撃終了処理 */
function finishCpuAttack() {
  currentCpuAttacker = null;
  if (!gameOver) {
    logCPU("=== CPUターン終了 ===");
    endTurn();
  }
}

/* ---------------------------------------------------------
   CPUが防御側のとき、どのブロッカーを出すかAI判断
--------------------------------------------------------- */
function chooseCpuBlocker(attacker, blockers) {
  const ap = getPower(attacker);

  // 勝てる or 相打ち可能ブロッカーを探す（パワー低い順）
  const good = blockers.filter(b => getPower(b) >= ap);
  if (good.length > 0) {
    good.sort((a, b) => getPower(a) - getPower(b));
    return good[0];
  }

  // 全員負ける場合 → 最も弱いブロッカーを切る
  const sorted = [...blockers].sort((a, b) => getPower(a) - getPower(b));
  return sorted[0];
}

/* ---------------------------------------------------------
   プレイヤーが CPU の攻撃に対して
   「どのブロッカーでブロックするか」を選ぶ UI
   （block-select-panel / block-select-list / block-select-cancel 必須）
--------------------------------------------------------- */
function openPlayerBlockPanel(attacker, blockers) {
  const panel     = document.getElementById("block-select-panel");
  const list      = document.getElementById("block-select-list");
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
      battleCards(attacker, blocker, idx, false); // false = 防御側はプレイヤー
      attacker.hasAttacked = true;
      attacker.rest = true;
      panel.classList.add("hidden");
      finishCpuAttack();
    };

    list.appendChild(cardDiv);
  });

  // ブロックしない
  cancelBtn.onclick = () => {
    panel.classList.add("hidden");

    // シールドへ通す
    if (shield.length > 0) {
      const broken = shield.shift();
      grave.push(broken);
      logCPU(`CPUの ${cardName(attacker)} の攻撃！ シールドブレイク`);
      attacker.hasAttacked = true;
      attacker.rest = true;
      render();
      finishCpuAttack();
      return;
    }

    // 本体へ
    logCPU(`CPUの ${cardName(attacker)} の攻撃！ 直接攻撃`);
    alert("CPUの直接攻撃！あなたの敗北…");
    attacker.hasAttacked = true;
    attacker.rest = true;
    gameOver = true;
    render();
  };
}

/* ---------------------------------------------------------
   ブロック時の戦闘処理
--------------------------------------------------------- */
function battleCards(attacker, defender, defenderIndex, isCPUDefender) {
  const ap = getPower(attacker);
  const dp = getPower(defender);

  if (ap > dp) {
    // 防御側が死亡
    if (isCPUDefender) {
      cpuGrave.push(defender);
      cpuBattle.splice(defenderIndex, 1);
    } else {
      grave.push(defender);
      battle.splice(defenderIndex, 1);
    }
    alert(`${cardName(attacker)} が ${cardName(defender)} を倒した！`);
  } else if (ap < dp) {
    // 攻撃側が死亡
    if (isCPUDefender) {
      grave.push(attacker);
      battle.splice(battle.indexOf(attacker), 1);
    } else {
      cpuGrave.push(attacker);
      cpuBattle.splice(cpuBattle.indexOf(attacker), 1);
    }
    alert(`${cardName(attacker)} はブロックされて倒された…`);
  } else {
    // 相打ち
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
    alert("相打ち！");
  }

  render();
}

/* ---------------------------------------------------------
   カード画像
--------------------------------------------------------- */
function getCardImagePath(card) {
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
   描画メイン
--------------------------------------------------------- */
function render() {
  renderZone("hand-zone",       hand,      "player-hand");
  renderZone("battle-zone",     battle,    "player-battle");
  renderZone("shield-zone",     shield,    "player-shield");

  renderZone("cpu-hand-zone",   cpuHand,   "cpu-hand");
  renderZone("cpu-battle-zone", cpuBattle, "cpu-battle");
  renderZone("cpu-shield-zone", cpuShield, "cpu-shield");

  renderDeckAndGrave();

  document.getElementById("player-energy").innerHTML =
    `エネルギー<br>${mana.length - playerUsedEnergy} / ${mana.length}`;

  document.getElementById("cpu-energy").innerHTML =
    `エネルギー<br>${cpuMana.length - cpuUsedEnergy} / ${cpuMana.length}`;
}

/* ---------------------------------------------------------
   ゾーン描画
--------------------------------------------------------- */
function renderZone(id, cards, zoneType) {
  const zone = document.getElementById(id);
  zone.innerHTML = "";

  cards.forEach((c, index) => {
    const div = document.createElement("div");
    div.className = "card";

    // レスト状態ならクラス付与（CSS側で横向きに）
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

    // ブロッカーバッジ
    if (c.blocker) {
      const bd = document.createElement("div");
      bd.className = "blocker-badge";
      bd.textContent = "B";
      div.appendChild(bd);
    }

    // プレイヤー手札 → 行動パネル
    if (zoneType === "player-hand" && isPlayerTurn && !gameOver) {
      div.onclick = () => {
        if (gameOver) return;

        document
          .querySelectorAll("#hand-zone .card")
          .forEach(x => x.classList.remove("selected"));

        div.classList.add("selected");
        selectedHandIndex = index;
        document.getElementById("action-panel").classList.remove("hidden");
      };
    }

    // プレイヤーバトルゾーン → 攻撃パネル
    if (zoneType === "player-battle" && isPlayerTurn && !gameOver) {
      div.onclick = () => {
        if (gameOver) return;

        const ref = battle[index];

        if (ref.summoningSick) {
          alert("召喚酔い中のため攻撃できません");
          return;
        }
        if (ref.hasAttacked) {
          alert("すでに攻撃済みです");
          return;
        }

        selectedBattleIndex = index;
        document.getElementById("attack-panel").classList.remove("hidden");
      };
    }

    zone.appendChild(div);
  });

  // 手札は扇状に並べる
  if (id === "hand-zone" || id === "cpu-hand-zone") {
    arrangeHandFan(id);
  }
}

/* ---------------------------------------------------------
   扇状手札配置
--------------------------------------------------------- */
function arrangeHandFan(id) {
  const cards = document.querySelectorAll(`#${id} .card`);
  const total = cards.length;
  if (total === 0) return;

  const spread = 50;          // 角度の広がり
  const start  = -spread / 2;

  cards.forEach((el, i) => {
    const angle = start + (spread / (total - 1 || 1)) * i;
    el.style.transform = `rotate(${angle}deg)`;
  });
}

/* ---------------------------------------------------------
   山札 / 捨て札描画
--------------------------------------------------------- */
function renderDeckAndGrave() {
  // プレイヤー山札
  document.getElementById("player-deck-zone").innerHTML = `
    <img src="imgs/back.png" class="card-img">
    <div class="deck-count">${deck.length}</div>
  `;

  // プレイヤー捨て札
  const pg = document.getElementById("player-grave-zone");
  if (grave.length > 0) {
    const top = grave[grave.length - 1];
    pg.innerHTML = `
      <img src="${getCardImagePath(top)}" class="card-img">
      <div class="deck-count">${grave.length}</div>
    `;
  } else {
    pg.innerHTML = "";
  }

  // CPU山札
  document.getElementById("cpu-deck-zone").innerHTML = `
    <img src="imgs/back.png" class="card-img">
    <div class="deck-count">${cpuDeck.length}</div>
  `;

  // CPU捨て札
  const cg = document.getElementById("cpu-grave-zone");
  if (cpuGrave.length > 0) {
    const top = cpuGrave[cpuGrave.length - 1];
    cg.innerHTML = `
      <img src="${getCardImagePath(top)}" class="card-img">
      <div class="deck-count">${cpuGrave.length}</div>
    `;
  } else {
    cg.innerHTML = "";
  }
}

/* ---------------------------------------------------------
   行動パネル（手札）
--------------------------------------------------------- */
document.getElementById("btn-mana").onclick = () => {
  if (gameOver) return;

  if (manaCharged) {
    alert("このターンはもうエネルギーをチャージしています");
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
    alert(`エネルギー不足！ 必要${c.cost} / 現在${usable}`);
    return;
  }

  playerUsedEnergy += c.cost;

  battle.push({
    ...c,
    summoningSick: true,
    hasAttacked: false,
    rest: false
  });

  hand.splice(selectedHandIndex, 1);

  closePanels();
  render();
};

document.getElementById("btn-cancel").onclick = closePanels;

function closePanels() {
  document.getElementById("action-panel").classList.add("hidden");
  document.getElementById("attack-panel").classList.add("hidden");
  const selPanel = document.getElementById("block-select-panel");
  if (selPanel) selPanel.classList.add("hidden");

  selectedHandIndex = null;
  selectedBattleIndex = null;
}

/* ---------------------------------------------------------
   攻撃（プレイヤー側）
   - 2,3,8 は攻撃不可（ブロッカー専用）
   - CPU側にブロッカーがいれば chooseCpuBlocker() で自動選択
--------------------------------------------------------- */
document.getElementById("btn-attack").onclick = () => {
  if (gameOver) return;

  const attacker = battle[selectedBattleIndex];
  if (!attacker) {
    closePanels();
    return;
  }

  if (attacker.summoningSick) {
    alert("召喚酔い中のため攻撃できません");
    return;
  }

  if (attacker.hasAttacked) {
    alert("すでに攻撃済みです");
    return;
  }

  if (attacker.cantAttack) {
    alert("このクリーチャーは攻撃できません（ブロッカー専用）");
    closePanels();
    return;
  }

  // CPU側ブロッカー
  const cpuBlockers = cpuBattle.filter(c => c.blocker);

  if (cpuBlockers.length > 0) {
    const blocker = chooseCpuBlocker(attacker, cpuBlockers);
    const idx = cpuBattle.indexOf(blocker);

    battleCards(attacker, blocker, idx, true); // true = 防御側CPU
    attacker.hasAttacked = true;
    attacker.rest = true;
    closePanels();
    return;
  }

  // ブロッカーがいない → シールド or 本体へ
  if (cpuShield.length > 0) {
    const broken = cpuShield.shift();
    cpuGrave.push(broken);
    alert("シールドブレイク！");
  } else {
    alert("直接攻撃！あなたの勝利！！");
    attacker.hasAttacked = true;
    attacker.rest = true;
    gameOver = true;
    closePanels();
    render();
    return;
  }

  attacker.hasAttacked = true;
  attacker.rest = true;
  closePanels();
  render();
};

document.getElementById("btn-attack-cancel").onclick = closePanels;

/* ---------------------------------------------------------
   ヘルパー
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
   ゲームスタート
--------------------------------------------------------- */
startGame();
