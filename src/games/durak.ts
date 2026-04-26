// @ts-nocheck
export function mountDurak(container) {
  if (!container) throw new Error("mountDurak: container is required");

  const suits = ["♥", "♦", "♣", "♠"];
  const suitNames = { "♥": "черви", "♦": "бубны", "♣": "крести", "♠": "пики" };
  const ranks = ["6", "7", "8", "9", "10", "В", "Д", "К", "Т"];

  function getRankValue(rank) {
    return ranks.indexOf(rank);
  }

  class Card {
    constructor(suit, rank) {
      this.suit = suit;
      this.rank = rank;
    }
    getColor() {
      return this.suit === "♥" || this.suit === "♦" ? "red" : "black";
    }
    getHTML(isFaceUp = true) {
      if (!isFaceUp) return `<div class="card computer-card"></div>`;
      const colorClass = this.getColor() === "red" ? "suit-red" : "suit-black";
      return `<div class="card" data-suit="${this.suit}" data-rank="${this.rank}">
                <div class="card-corner ${colorClass}">${this.rank}</div>
                <div class="card-suit ${colorClass}">${this.suit}</div>
                <div class="card-corner ${colorClass}" style="align-self:flex-end;">${this.rank}</div>
              </div>`;
    }
  }

  function createDeck() {
    const deck = [];
    for (const s of suits) for (const r of ranks) deck.push(new Card(s, r));
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function compareCards(attack, defend, trump) {
    if (defend.suit === attack.suit && getRankValue(defend.rank) > getRankValue(attack.rank)) return true;
    if (defend.suit === trump && attack.suit !== trump) return true;
    return false;
  }

  const gameState = {
    deck: [],
    trumpSuit: null,
    playerHand: [],
    computerHand: [],
    tableCards: [],
    isPlayerTurn: true,
    isAttacking: true,
    winner: null,
  };

  container.classList.add("durak-widget");
  container.innerHTML = `
    <div class="game-container">
      <div class="players-area">
        <div class="player-zone">
          <div class="zone-title">🤖 КОМПЬЮТЕР (карт: <span id="computerCardsCount">0</span>)</div>
          <div class="cards" id="computerCards"></div>
        </div>
        <div class="table-area">
          <div class="table-title">⚔️ СТОЛ (битва) ⚔️</div>
          <div class="battlefield" id="battlefield"></div>
          <div class="info-panel">
            <div>🎴 В колоде: <span id="deckCount">0</span></div>
            <div>🃏 Козырь: <span id="trumpSuit" class="trump-pill"></span></div>
            <button class="btn" id="passTurnBtn">✋ Пас (забрать)</button>
            <button class="btn" id="newGameBtn">🔄 Новая игра</button>
          </div>
        </div>
        <div class="player-zone">
          <div class="zone-title">🧑‍🎓 ВАШИ КАРТЫ</div>
          <div class="cards" id="playerCards"></div>
          <div class="player-actions">
            <button class="btn" id="endAttackBtn">✅ Закончить ход (добить)</button>
          </div>
        </div>
      </div>
    </div>
  `;

  let destroyed = false;

  function drawCardsToHand() {
    while (gameState.playerHand.length < 6 && gameState.deck.length) gameState.playerHand.push(gameState.deck.pop());
    while (gameState.computerHand.length < 6 && gameState.deck.length) gameState.computerHand.push(gameState.deck.pop());
    render();
  }

  function render() {
    if (destroyed) return;
    const playerDiv = container.querySelector("#playerCards");
    const computerDiv = container.querySelector("#computerCards");
    const battlefieldDiv = container.querySelector("#battlefield");
    const deckCountEl = container.querySelector("#deckCount");
    const trumpSuitEl = container.querySelector("#trumpSuit");
    const compCountEl = container.querySelector("#computerCardsCount");
    if (!playerDiv || !computerDiv || !battlefieldDiv || !deckCountEl || !trumpSuitEl || !compCountEl) return;

    playerDiv.innerHTML = "";
    for (const card of gameState.playerHand) playerDiv.innerHTML += card.getHTML(true);
    [...playerDiv.querySelectorAll(".card")].forEach((el, idx) => {
      el.addEventListener("click", () => onPlayerCardClick(idx));
    });

    computerDiv.innerHTML = "";
    for (let i = 0; i < gameState.computerHand.length; i += 1) {
      computerDiv.innerHTML += `<div class="card computer-card"></div>`;
    }
    compCountEl.textContent = String(gameState.computerHand.length);

    battlefieldDiv.innerHTML = "";
    for (const pair of gameState.tableCards) {
      const defendHtml = pair.defendCard
        ? pair.defendCard.getHTML(true)
        : `<div class="card unknown-card">?</div>`;
      const pairDiv = document.createElement("div");
      pairDiv.className = "card-pair";
      pairDiv.innerHTML = `<div class="pair-inner">${pair.attackCard.getHTML(true)} ${defendHtml}</div>`;
      battlefieldDiv.appendChild(pairDiv);
    }

    trumpSuitEl.textContent = `${suitNames[gameState.trumpSuit]} ${gameState.trumpSuit}`;
    deckCountEl.textContent = String(gameState.deck.length);

    if (gameState.winner === "player") setTimeout(() => alert("🎉 ПОБЕДА! Компьютер остался дураком!"), 50);
    else if (gameState.winner === "computer") setTimeout(() => alert("😭 Вы проиграли... Компьютер победил!"), 50);
  }

  function endRound() {
    gameState.tableCards = [];
    drawCardsToHand();
    if (gameState.playerHand.length === 0 && gameState.deck.length === 0) gameState.winner = "player";
    if (gameState.computerHand.length === 0 && gameState.deck.length === 0) gameState.winner = "computer";
    if (gameState.winner) {
      render();
      return;
    }
    gameState.isPlayerTurn = !gameState.isPlayerTurn;
    gameState.isAttacking = true;
    render();
    if (!gameState.isPlayerTurn && !gameState.winner) setTimeout(() => computerAttack(), 150);
  }

  function playerAttack(idx) {
    if (!gameState.isPlayerTurn || !gameState.isAttacking || gameState.winner) {
      alert("Сейчас не ваша очередь атаки");
      return;
    }
    const card = gameState.playerHand[idx];
    if (!card) return;

    if (gameState.tableCards.length === 0) {
      gameState.playerHand.splice(idx, 1);
      gameState.tableCards.push({ attackCard: card, defendCard: null });
      render();
      gameState.isAttacking = false;
      setTimeout(() => computerDefend(), 100);
      return;
    }

    const ranksOnTable = gameState.tableCards.map((p) => p.attackCard.rank);
    if (ranksOnTable.includes(card.rank)) {
      gameState.playerHand.splice(idx, 1);
      gameState.tableCards.push({ attackCard: card, defendCard: null });
      render();
      if (gameState.tableCards.every((p) => p.defendCard !== null)) endRound();
    } else {
      alert("Можно подкидывать только карты тех рангов, что уже на столе");
    }
  }

  function computerDefend() {
    if (gameState.isAttacking || gameState.winner) return;
    let index = -1;
    for (let i = 0; i < gameState.tableCards.length; i += 1) {
      if (!gameState.tableCards[i].defendCard) {
        index = i;
        break;
      }
    }
    if (index === -1) {
      endRound();
      return;
    }
    const attack = gameState.tableCards[index].attackCard;
    let bestIdx = -1;
    for (let i = 0; i < gameState.computerHand.length; i += 1) {
      if (compareCards(attack, gameState.computerHand[i], gameState.trumpSuit)) {
        bestIdx = i;
        break;
      }
    }
    if (bestIdx !== -1) {
      const defendCard = gameState.computerHand.splice(bestIdx, 1)[0];
      gameState.tableCards[index].defendCard = defendCard;
      render();
      const left = gameState.tableCards.some((p) => !p.defendCard);
      if (!left) endRound();
      else setTimeout(() => computerDefend(), 120);
      return;
    }

    alert("Компьютер не смог отбить и забирает карты");
    for (const p of gameState.tableCards) {
      gameState.computerHand.push(p.attackCard);
      if (p.defendCard) gameState.computerHand.push(p.defendCard);
    }
    gameState.tableCards = [];
    drawCardsToHand();
    gameState.isPlayerTurn = true;
    gameState.isAttacking = true;
    render();
    if (gameState.computerHand.length === 0 && gameState.deck.length === 0) gameState.winner = "computer";
    else if (gameState.playerHand.length === 0 && gameState.deck.length === 0) gameState.winner = "player";
  }

  function playerDefendTurn() {
    if (gameState.isPlayerTurn || gameState.isAttacking || gameState.winner) return;
    let index = -1;
    for (let i = 0; i < gameState.tableCards.length; i += 1) {
      if (!gameState.tableCards[i].defendCard) {
        index = i;
        break;
      }
    }
    if (index === -1) {
      endRound();
      return;
    }
    render();
    alert(`Защита! Побейте ${gameState.tableCards[index].attackCard.rank}${gameState.tableCards[index].attackCard.suit} (выберите карту)`);
    const cards = [...container.querySelectorAll("#playerCards .card")];
    const handler = (e) => {
      const selected = cards.findIndex((c) => c === e.currentTarget);
      if (selected === -1 || !gameState.playerHand[selected]) return;
      const defendTry = gameState.playerHand[selected];
      if (compareCards(gameState.tableCards[index].attackCard, defendTry, gameState.trumpSuit)) {
        gameState.playerHand.splice(selected, 1);
        gameState.tableCards[index].defendCard = defendTry;
        render();
        cards.forEach((c) => c.removeEventListener("click", handler));
        const remaining = gameState.tableCards.some((p) => !p.defendCard);
        if (!remaining) endRound();
        else setTimeout(() => playerDefendTurn(), 80);
      } else {
        alert("Эта карта не бьёт! Попробуйте другую.");
      }
    };
    cards.forEach((c) => c.addEventListener("click", handler, { once: true }));
  }

  function computerAttack() {
    if (gameState.isPlayerTurn || !gameState.isAttacking || gameState.winner) return;
    if (gameState.computerHand.length === 0) return;
    if (gameState.tableCards.length === 0) {
      const idx = Math.floor(Math.random() * gameState.computerHand.length);
      const card = gameState.computerHand.splice(idx, 1)[0];
      gameState.tableCards.push({ attackCard: card, defendCard: null });
      render();
      gameState.isAttacking = false;
      setTimeout(() => playerDefendTurn(), 150);
      return;
    }
    const ranksOnTable = gameState.tableCards.map((p) => p.attackCard.rank);
    const possible = gameState.computerHand.findIndex((c) => ranksOnTable.includes(c.rank));
    if (possible !== -1 && !gameState.tableCards.every((p) => p.defendCard)) {
      const add = gameState.computerHand.splice(possible, 1)[0];
      gameState.tableCards.push({ attackCard: add, defendCard: null });
      render();
      if (gameState.tableCards.every((p) => p.defendCard)) endRound();
      return;
    }
    if (gameState.tableCards.length > 0 && gameState.tableCards.every((p) => p.defendCard)) {
      endRound();
      return;
    }
    for (const p of gameState.tableCards) {
      gameState.playerHand.push(p.attackCard);
      if (p.defendCard) gameState.playerHand.push(p.defendCard);
    }
    gameState.tableCards = [];
    drawCardsToHand();
    gameState.isPlayerTurn = true;
    gameState.isAttacking = true;
    render();
  }

  function finishAttack() {
    if (!gameState.isPlayerTurn || !gameState.isAttacking) {
      alert("Не ваш ход атаки");
      return;
    }
    if (gameState.tableCards.length === 0) {
      alert("Сначала атакуйте!");
      return;
    }
    gameState.isAttacking = false;
    render();
    computerDefend();
  }

  function passTake() {
    if (!gameState.isAttacking && gameState.tableCards.length > 0 && gameState.tableCards.some((p) => !p.defendCard)) {
      for (const p of gameState.tableCards) {
        if (gameState.isPlayerTurn) gameState.playerHand.push(p.attackCard);
        else gameState.computerHand.push(p.attackCard);
        if (p.defendCard) {
          if (gameState.isPlayerTurn) gameState.playerHand.push(p.defendCard);
          else gameState.computerHand.push(p.defendCard);
        }
      }
      gameState.tableCards = [];
      drawCardsToHand();
      gameState.isAttacking = true;
      gameState.isPlayerTurn = !gameState.isPlayerTurn;
      render();
      if (!gameState.isPlayerTurn && !gameState.winner) setTimeout(() => computerAttack(), 100);
      return;
    }
    alert("Нельзя забрать карты сейчас");
  }

  function onPlayerCardClick(idx) {
    if (gameState.winner) return;
    if (gameState.isPlayerTurn && gameState.isAttacking) playerAttack(idx);
    else if (!gameState.isPlayerTurn && !gameState.isAttacking) alert("Сейчас вы защищаетесь! Следуйте инструкциям или нажмите 'Пас'");
    else alert("Сейчас не ваш ход");
  }

  function newGame() {
    const deck = createDeck();
    gameState.trumpSuit = deck[deck.length - 1].suit;
    gameState.deck = deck.slice(0, deck.length - 1);
    gameState.playerHand = [];
    gameState.computerHand = [];
    for (let i = 0; i < 6; i += 1) {
      if (gameState.deck.length) gameState.playerHand.push(gameState.deck.pop());
      if (gameState.deck.length) gameState.computerHand.push(gameState.deck.pop());
    }
    gameState.tableCards = [];
    gameState.isPlayerTurn = true;
    gameState.isAttacking = true;
    gameState.winner = null;
    render();
  }

  const newGameBtn = container.querySelector("#newGameBtn");
  const endAttackBtn = container.querySelector("#endAttackBtn");
  const passTurnBtn = container.querySelector("#passTurnBtn");
  newGameBtn?.addEventListener("click", newGame);
  endAttackBtn?.addEventListener("click", finishAttack);
  passTurnBtn?.addEventListener("click", passTake);

  newGame();

  return {
    destroy: () => {
      destroyed = true;
      container.innerHTML = "";
      container.classList.remove("durak-widget");
    },
  };
}
