class Renderer {
  constructor(engine) {
    this._engine = engine;
    this._animator = new CardAnimator();
    this._selectedCard = null;
    this._myPlayerId = null;
    this._lastActions = {};
    this._suppressNextGameOver = false;

    this._root        = document.getElementById('game-board');
    this._handEl      = document.getElementById('my-hand');
    this._turnEl      = document.getElementById('turn-indicator');
    this._deckCountEl = document.getElementById('deck-count');
    this._msgEl       = document.getElementById('game-message');
    this._cardDescEl  = document.getElementById('card-desc');

    engine.on('stateChanged', ({ prev, next, action }) => this._onStateChanged(prev, next, action));
    engine.on('gameOver',     ({ winner })               => this._onGameOver(winner));
    engine.on('invalidAction',({ reason })               => this._showMessage(reason, 'error'));
  }

  setMyPlayer(playerId) {
    this._myPlayerId = playerId;
  }

  suppressGameOver() {
    this._suppressNextGameOver = true;
  }

  _onStateChanged(prev, next, action) {
    if (!prev) {
      this._initialRender(next);
      return;
    }

    // 마지막 행동 배지 업데이트
    if (action && action.playerId &&
        (action.type === 'PLAY_CARD' || action.type === 'DISCARD_CARD' || action.type === 'DISCARD_ALL_DRAW')) {
      this._lastActions[action.playerId] = action;
      this._updateActionBadge(action.playerId, action);
    }

    // 햄스터 업데이트
    for (const [pid, player] of Object.entries(next.players)) {
      for (const hamster of player.hamsters) {
        const el = document.querySelector(`[data-hamster-id="${hamster.id}"]`);
        if (!el) continue;
        const oldH = prev.players[pid]?.hamsters.find(h => h.id === hamster.id);
        if (oldH && JSON.stringify(oldH) !== JSON.stringify(hamster)) {
          const ribbonChanged = hamster.attachments.ribbon !== oldH.attachments.ribbon;
          if (ribbonChanged) {
            el.animate(
              [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
              { duration: 220, easing: 'ease-in' }
            ).onfinish = () => {
              updateHamsterElement(el, oldH, hamster);
              el.animate(
                [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
                { duration: 220, easing: 'ease-out' }
              );
              el.classList.add('hamster--just-changed');
              setTimeout(() => el.classList.remove('hamster--just-changed'), 1600);
            };
          } else {
            updateHamsterElement(el, oldH, hamster);
            if (!hamster.sleeping && oldH.sleeping) this._animator.wakeHamster(el);
            else if (hamster.sleeping && !oldH.sleeping) this._animator.sleepHamster(el);
            else this._animator.attachItem(el);
            el.classList.add('hamster--just-changed');
            setTimeout(() => el.classList.remove('hamster--just-changed'), 1600);
          }
        }
      }
    }

    const myId = this._myPlayerId;
    const myHandChanged = JSON.stringify(prev.players[myId]?.hand) !== JSON.stringify(next.players[myId]?.hand);
    const isOpponentAction = action?.playerId != null && action.playerId !== myId;
    const turnCameToMe = prev.currentPlayer !== myId && next.currentPlayer === myId;

    if (isOpponentAction && !myHandChanged && !turnCameToMe) {
      this._refreshHandPlayability(next);
    } else {
      this._renderHand(next);
      this._clearSelection(next);
      if (this._cardDescEl) this._cardDescEl.textContent = '';
    }

    this._updateTurnIndicator(next);
    this._updateDeckCount(next);
  }

  _initialRender(state) {
    this._root.innerHTML = '';
    const myZoneEl = document.getElementById('my-zone');
    if (myZoneEl) myZoneEl.innerHTML = '';

    const boardEl = document.createElement('div');
    boardEl.className = 'board';

    for (const [pid, player] of Object.entries(state.players)) {
      const isOwn = pid === this._myPlayerId;
      const zone = document.createElement('div');
      zone.className = `player-zone ${isOwn ? 'player-zone--own' : 'player-zone--opponent'}`;
      zone.dataset.playerId = pid;

      const nameEl = document.createElement('div');
      nameEl.className = 'player-name';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = player.name;
      nameEl.appendChild(nameSpan);
      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'player-action-badge';
      nameEl.appendChild(badgeSpan);
      zone.appendChild(nameEl);

      const hamsterRow = document.createElement('div');
      hamsterRow.className = 'hamster-row';
      for (const hamster of player.hamsters) {
        const el = createHamsterElement(hamster, pid, isOwn);
        el.addEventListener('click', () => this._onHamsterClick(pid, hamster.id));
        hamsterRow.appendChild(el);
      }
      zone.appendChild(hamsterRow);

      if (isOwn && myZoneEl) {
        myZoneEl.appendChild(zone);
      } else {
        boardEl.appendChild(zone);
      }
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

    const isRealtime = state.mode?.includes('realtime');
    const isMyTurn = state.currentPlayer === this._myPlayerId;
    const isLuckyBirdPhase = state.luckyBirdActive && state.luckyBirdPlayer === this._myPlayerId;
    const canAct = isRealtime || isMyTurn || isLuckyBirdPhase;

    this._handEl.innerHTML = '';

    // 행운의 새 진행 중 안내 메시지
    if (isLuckyBirdPhase) {
      this._showMessage('🐦 행운의 새! 남은 카드를 모두 사용하세요', 'info');
    }

    for (const cardId of player.hand) {
      const card = CARDS[cardId];
      if (!card) continue;
      const el = document.createElement('div');
      el.className = 'card';
      el.dataset.cardId = cardId;

      if (canAct && this._isCardPlayable(state, this._myPlayerId, cardId)) {
        el.classList.add('card--playable');
      }

      el.innerHTML = `
        <div class="card__icon">${card.emoji}</div>
        <div class="card__name">${card.nameKo}</div>
      `;
      el.addEventListener('click', () => this._onCardClick(cardId, el));

      // 버리기 버튼 (내 턴일 때만 표시, 실수 방지를 위해 한 번 더 눌러야 확정)
      if (canAct) {
        const discardBtn = document.createElement('button');
        discardBtn.className = 'card__discard-btn';
        discardBtn.textContent = '✕';
        discardBtn.title = '이 카드 버리기';
        discardBtn.addEventListener('click', e => {
          e.stopPropagation();
          if (discardBtn.classList.contains('card__discard-btn--confirm')) {
            clearTimeout(discardBtn._confirmTimer);
            this._engine.discardCard(this._myPlayerId, cardId);
            return;
          }
          discardBtn.classList.add('card__discard-btn--confirm');
          discardBtn.textContent = '확인';
          discardBtn.title = '다시 눌러 버리기 확정';
          discardBtn._confirmTimer = setTimeout(() => {
            discardBtn.classList.remove('card__discard-btn--confirm');
            discardBtn.textContent = '✕';
            discardBtn.title = '이 카드 버리기';
          }, 2500);
        });
        el.appendChild(discardBtn);
      }

      this._handEl.appendChild(el);
    }

    // 전부 버리기 버튼 (사용 가능한 카드가 없고 행운의 새 모드가 아닐 때, 한 번 더 눌러야 확정)
    if (isMyTurn && !isLuckyBirdPhase && canDiscardAllDraw(state, this._myPlayerId)) {
      const discardAllBtn = document.createElement('button');
      discardAllBtn.className = 'btn btn--discard-all';
      discardAllBtn.textContent = '전부 버리기';
      discardAllBtn.title = '3장 모두 버리고 새로 뽑기 (턴 종료)';
      discardAllBtn.addEventListener('click', () => {
        if (discardAllBtn.classList.contains('btn--discard-all-confirm')) {
          clearTimeout(discardAllBtn._confirmTimer);
          this._engine.discardAllAndDraw(this._myPlayerId);
          return;
        }
        discardAllBtn.classList.add('btn--discard-all-confirm');
        discardAllBtn.textContent = '정말 버릴까요?';
        discardAllBtn._confirmTimer = setTimeout(() => {
          discardAllBtn.classList.remove('btn--discard-all-confirm');
          discardAllBtn.textContent = '전부 버리기';
        }, 2500);
      });
      this._handEl.appendChild(discardAllBtn);
    }
  }

  _isCardPlayable(state, playerId, cardId) {
    const card = CARDS[cardId];
    if (!card) return false;
    if (card.targetType === 'none') return true;
    if (card.targetType === 'all') return countAffected(state, card, playerId) > 0;
    return getValidTargets(state, playerId, cardId).length > 0;
  }

  _refreshHandPlayability(state) {
    if (!this._handEl || !this._myPlayerId) return;
    const isRealtime = state.mode?.includes('realtime');
    const isMyTurn = state.currentPlayer === this._myPlayerId;
    const isLuckyBirdPhase = state.luckyBirdActive && state.luckyBirdPlayer === this._myPlayerId;
    const canAct = isRealtime || isMyTurn || isLuckyBirdPhase;
    this._handEl.querySelectorAll('.card[data-card-id]').forEach(el => {
      el.classList.toggle('card--playable',
        canAct && this._isCardPlayable(state, this._myPlayerId, el.dataset.cardId));
    });
  }

  _onCardClick(cardId, el) {
    const state = this._engine.getState();
    if (!state || state.phase !== 'playing') return;

    const isRealtime = state.mode?.includes('realtime');
    const isMyTurn = state.currentPlayer === this._myPlayerId;
    const isLuckyBirdPhase = state.luckyBirdActive && state.luckyBirdPlayer === this._myPlayerId;
    if (!isRealtime && !isMyTurn && !isLuckyBirdPhase) return;

    const card = CARDS[cardId];
    if (!card) return;

    if (this._selectedCard === cardId) {
      this._clearSelection(state);
      if (this._cardDescEl) this._cardDescEl.textContent = '';
      return;
    }

    this._selectedCard = cardId;

    document.querySelectorAll('.card').forEach(c => c.classList.remove('card--selected'));
    el.classList.add('card--selected');

    if (this._cardDescEl) {
      this._cardDescEl.textContent = card.descKo || '';
    }

    if (card.targetType === 'none') {
      const result = this._engine.playCard(this._myPlayerId, cardId);
      if (result.ok) this._animator.playCard(el, null, null);
      this._selectedCard = null;
      return;
    }

    if (card.targetType === 'all') {
      const result = this._engine.playCard(this._myPlayerId, cardId);
      if (result.ok) this._animator.playCard(el, null, null);
      this._selectedCard = null;
      return;
    }

    // 햄스터 타겟 선택
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
      this._selectedCard = null;
      document.querySelectorAll('.card').forEach(c => c.classList.remove('card--selected'));
      document.querySelectorAll('.hamster').forEach(h => {
        h.classList.remove('hamster--targetable', 'hamster--untargetable');
      });
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

  _updateActionBadge(playerId, action) {
    const zone = document.querySelector(`[data-player-id="${playerId}"]`);
    if (!zone) return;
    const badge = zone.querySelector('.player-action-badge');
    if (!badge) return;
    let text = '';
    if (action.type === 'PLAY_CARD') {
      const card = CARDS[action.cardId];
      if (card) text = `${card.emoji} ${card.nameKo}`;
    } else if (action.type === 'DISCARD_CARD') {
      const card = CARDS[action.cardId];
      text = card ? `✕ ${card.emoji}` : '✕';
    } else if (action.type === 'DISCARD_ALL_DRAW') {
      text = '♻️ 전부 버리기';
    }
    badge.textContent = text;
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
    if (state.mode?.includes('realtime')) {
      this._turnEl.textContent = '⚡ 실시간';
      this._turnEl.className = 'turn-indicator turn-indicator--mine';
      return;
    }
    const current = state.players[state.currentPlayer];
    const isMyTurn = state.currentPlayer === this._myPlayerId;
    let text = isMyTurn ? '내 턴' : `${current?.name ?? ''}의 턴`;
    if (state.luckyBirdActive) text += ' 🐦';
    this._turnEl.textContent = text;
    this._turnEl.className = `turn-indicator ${isMyTurn ? 'turn-indicator--mine' : ''}`;
  }

  _updateDeckCount(state) {
    if (this._deckCountEl) {
      this._deckCountEl.textContent = `덱: ${state.deck.length}장`;
    }
  }

  _showMessage(text, type = 'info', duration = 2500) {
    if (!this._msgEl) return;
    this._msgEl.textContent = text;
    this._msgEl.className = `game-message game-message--${type}`;
    this._msgEl.style.display = 'block';
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => {
      if (this._msgEl) this._msgEl.style.display = 'none';
    }, duration);
  }

  _onGameOver(winner) {
    if (this._suppressNextGameOver) {
      this._suppressNextGameOver = false;
      return;
    }
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
