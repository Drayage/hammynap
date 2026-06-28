class Renderer {
  constructor(engine) {
    this._engine = engine;
    this._animator = new CardAnimator();
    this._selectedCard = null;
    this._myPlayerId = null;

    this._root        = document.getElementById('game-board');
    this._handEl      = document.getElementById('my-hand');
    this._turnEl      = document.getElementById('turn-indicator');
    this._deckCountEl = document.getElementById('deck-count');
    this._msgEl       = document.getElementById('game-message');

    engine.on('stateChanged', ({ prev, next, action }) => this._onStateChanged(prev, next, action));
    engine.on('gameOver',     ({ winner })               => this._onGameOver(winner));
    engine.on('invalidAction',({ reason })               => this._showMessage(reason, 'error'));
  }

  setMyPlayer(playerId) {
    this._myPlayerId = playerId;
  }

  _onStateChanged(prev, next, action) {
    if (!prev) {
      this._initialRender(next);
      return;
    }

    // 햄스터 업데이트
    for (const [pid, player] of Object.entries(next.players)) {
      for (const hamster of player.hamsters) {
        const el = document.querySelector(`[data-hamster-id="${hamster.id}"]`);
        if (!el) continue;
        const oldH = prev.players[pid]?.hamsters.find(h => h.id === hamster.id);
        if (oldH && JSON.stringify(oldH) !== JSON.stringify(hamster)) {
          updateHamsterElement(el, oldH, hamster);
          if (!hamster.sleeping && oldH.sleeping) this._animator.wakeHamster(el);
          else if (hamster.sleeping && !oldH.sleeping) this._animator.sleepHamster(el);
          else this._animator.attachItem(el);
        }
      }
    }

    // 손패 업데이트
    this._renderHand(next);

    // 턴 표시기
    this._updateTurnIndicator(next);
    this._updateDeckCount(next);

    // 선택 초기화
    this._clearSelection(next);
  }

  _initialRender(state) {
    this._root.innerHTML = '';
    const boardEl = document.createElement('div');
    boardEl.className = 'board';

    for (const [pid, player] of Object.entries(state.players)) {
      const isOwn = pid === this._myPlayerId;
      const zone = document.createElement('div');
      zone.className = `player-zone ${isOwn ? 'player-zone--own' : 'player-zone--opponent'}`;
      zone.dataset.playerId = pid;

      const nameEl = document.createElement('div');
      nameEl.className = 'player-name';
      nameEl.textContent = player.name;
      zone.appendChild(nameEl);

      const hamsterRow = document.createElement('div');
      hamsterRow.className = 'hamster-row';
      for (const hamster of player.hamsters) {
        const el = createHamsterElement(hamster, pid, isOwn);
        el.addEventListener('click', () => this._onHamsterClick(pid, hamster.id));
        hamsterRow.appendChild(el);
      }
      zone.appendChild(hamsterRow);
      boardEl.appendChild(zone);
    }

    this._root.appendChild(boardEl);
    this._renderHand(state);
    this._updateTurnIndicator(state);
    this._updateDeckCount(state);
  }

  _renderHand(state) {
    if (!this._handEl || !this._myPlayerId) return;
    const player = state.players[this._myPlayerId];
    if (!player) return;

    this._handEl.innerHTML = '';
    for (const cardId of player.hand) {
      const card = CARDS[cardId];
      if (!card) continue;
      const el = document.createElement('div');
      el.className = 'card';
      el.dataset.cardId = cardId;
      el.innerHTML = `
        <div class="card__icon">${card.emoji}</div>
        <div class="card__name">${card.nameKo}</div>
      `;
      el.addEventListener('click', () => this._onCardClick(cardId, el));
      this._handEl.appendChild(el);
    }

    // 턴 종료 버튼
    const endBtn = document.createElement('button');
    endBtn.className = 'btn btn--end-turn';
    endBtn.textContent = '턴 종료';
    endBtn.addEventListener('click', () => {
      this._engine.endTurn(this._myPlayerId);
    });
    this._handEl.appendChild(endBtn);
  }

  _onCardClick(cardId, el) {
    const state = this._engine.getState();
    if (!state || state.phase !== 'playing') return;
    if (state.currentPlayer !== this._myPlayerId && !state.extraTurnActive) return;

    const card = CARDS[cardId];
    if (!card) return;

    if (this._selectedCard === cardId) {
      this._clearSelection(state);
      return;
    }

    this._selectedCard = cardId;

    document.querySelectorAll('.card').forEach(c => c.classList.remove('card--selected'));
    el.classList.add('card--selected');

    if (card.targetType === 'none') {
      this._engine.playCard(this._myPlayerId, cardId);
      this._animator.playCard(el, null, null);
      this._selectedCard = null;
      return;
    }

    if (card.targetType === 'all') {
      this._engine.playCard(this._myPlayerId, cardId);
      this._animator.playCard(el, null, null);
      this._selectedCard = null;
      return;
    }

    // hamster 타겟이 필요한 카드: 유효 타겟 하이라이트
    const validTargets = getValidTargets(state, this._myPlayerId, cardId);
    document.querySelectorAll('.hamster').forEach(h => {
      const pid = h.dataset.playerId;
      const hid = h.dataset.hamsterId;
      const isTarget = validTargets.some(t => t.playerId === pid && t.hamsterId === hid);
      h.classList.toggle('hamster--targetable', isTarget);
      h.classList.toggle('hamster--untargetable', !isTarget);
    });

    if (validTargets.length === 0) {
      this._showMessage('사용할 수 있는 대상이 없습니다.', 'warn');
      this._clearSelection(state);
    }
  }

  _onHamsterClick(targetPlayerId, targetHamsterId) {
    if (!this._selectedCard) return;
    const state = this._engine.getState();
    if (!state) return;

    const cardEl = document.querySelector(`.card[data-card-id="${this._selectedCard}"]`);
    const hamsterEl = document.querySelector(`[data-hamster-id="${targetHamsterId}"]`);

    if (!hamsterEl?.classList.contains('hamster--targetable')) return;

    this._animator.playCard(cardEl, hamsterEl, null);
    this._engine.playCard(this._myPlayerId, this._selectedCard, targetPlayerId, targetHamsterId);
    this._selectedCard = null;
  }

  _clearSelection(state) {
    this._selectedCard = null;
    document.querySelectorAll('.card').forEach(c => c.classList.remove('card--selected'));
    document.querySelectorAll('.hamster').forEach(h => {
      h.classList.remove('hamster--targetable', 'hamster--untargetable');
    });
  }

  _updateTurnIndicator(state) {
    if (!this._turnEl) return;
    const current = state.players[state.currentPlayer];
    const isMyTurn = state.currentPlayer === this._myPlayerId;
    this._turnEl.textContent = isMyTurn ? '내 턴' : `${current?.name ?? ''}의 턴`;
    this._turnEl.className = `turn-indicator ${isMyTurn ? 'turn-indicator--mine' : ''}`;
  }

  _updateDeckCount(state) {
    if (this._deckCountEl) {
      this._deckCountEl.textContent = `덱: ${state.deck.length}장`;
    }
  }

  _showMessage(text, type = 'info') {
    if (!this._msgEl) return;
    this._msgEl.textContent = text;
    this._msgEl.className = `game-message game-message--${type}`;
    this._msgEl.style.display = 'block';
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => {
      if (this._msgEl) this._msgEl.style.display = 'none';
    }, 2500);
  }

  _onGameOver(winner) {
    const state = this._engine.getState();
    const winnerName = state?.players[winner]?.name ?? winner;
    const overlay = document.getElementById('game-over-overlay');
    if (overlay) {
      const msg = overlay.querySelector('.game-over__message');
      if (msg) msg.textContent = `🎉 ${winnerName} 승리!`;
      overlay.style.display = 'flex';
    }
  }
}
