class GameEngine {
  constructor() {
    this._state = null;
    this._listeners = {};
  }

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
    return () => this.off(event, cb);
  }

  off(event, cb) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(fn => fn !== cb);
  }

  emit(event, data) {
    (this._listeners[event] || []).forEach(cb => cb(data));
  }

  getState() {
    return this._state;
  }

  startGame(config) {
    this._config = config;
    this._state = createInitialState(config);
    this.emit('stateChanged', { prev: null, next: this._state, action: null });
    this.emit('turnStart', { playerId: this._state.currentPlayer });
  }

  playCard(playerId, cardId, targetPlayerId = null, targetHamsterId = null) {
    if (!this._state) return { ok: false, reason: '게임이 시작되지 않았습니다.' };
    if (this._state.phase !== 'playing') return { ok: false, reason: '게임이 진행 중이 아닙니다.' };

    const action = { type: 'PLAY_CARD', playerId, cardId, targetPlayerId, targetHamsterId };
    const check = validatePlay(this._state, action);
    if (!check.valid) {
      this.emit('invalidAction', { reason: check.reason });
      return { ok: false, reason: check.reason };
    }

    const prev = this._state;
    this._state = applyAction(this._state, action);

    const winner = checkWin(this._state);
    if (winner) {
      this._state = { ...this._state, phase: 'ended', winner };
      this.emit('stateChanged', { prev, next: this._state, action });
      this.emit('gameOver', { winner });
      return { ok: true };
    }

    const isRealtime = this._state.mode?.includes('realtime');
    if (this._state.luckyBirdActive) {
      // 행운의 새 모드: 손패가 비었으면 종료, 아니면 계속 플레이
      if (this._state.players[playerId].hand.length === 0) {
        this._endLuckyBirdPhase(playerId, prev, action);
      } else {
        this.emit('stateChanged', { prev, next: this._state, action });
        this.emit('cardPlayed', { playerId, cardId, targetPlayerId, targetHamsterId });
      }
    } else if (isRealtime) {
      // 실시간 모드: 턴 전환 없이 즉시 카드 보충
      const needed = this._state.players[playerId].maxHandSize - this._state.players[playerId].hand.length;
      if (needed > 0) this._state = drawCardsForPlayer(this._state, playerId, needed);
      this.emit('stateChanged', { prev, next: this._state, action });
      this.emit('cardPlayed', { playerId, cardId, targetPlayerId, targetHamsterId });
    } else {
      // 일반 플레이: 1장 사용 → 1장 보충 → 턴 종료 (자동)
      this._state = applyAction(this._state, { type: 'END_TURN', playerId });
      this.emit('stateChanged', { prev, next: this._state, action });
      this.emit('cardPlayed', { playerId, cardId, targetPlayerId, targetHamsterId });
      this.emit('turnStart', { playerId: this._state.currentPlayer });
    }

    return { ok: true };
  }

  discardCard(playerId, cardId) {
    if (!this._state) return { ok: false, reason: '게임이 시작되지 않았습니다.' };
    if (this._state.phase !== 'playing') return { ok: false, reason: '게임이 진행 중이 아닙니다.' };

    const isMyTurn = this._state.currentPlayer === playerId;
    const isLuckyBirdTurn = this._state.luckyBirdActive && this._state.luckyBirdPlayer === playerId;
    const isRealtime = this._state.mode?.includes('realtime');
    if (!isMyTurn && !isLuckyBirdTurn && !isRealtime) {
      return { ok: false, reason: '지금 당신의 턴이 아닙니다.' };
    }

    const player = this._state.players[playerId];
    if (!player?.hand.includes(cardId)) {
      return { ok: false, reason: '해당 카드가 손패에 없습니다.' };
    }

    const action = { type: 'DISCARD_CARD', playerId, cardId };
    const prev = this._state;
    this._state = applyAction(this._state, action);

    if (isLuckyBirdTurn) {
      if (this._state.players[playerId].hand.length === 0) {
        this._endLuckyBirdPhase(playerId, prev, action);
      } else {
        this.emit('stateChanged', { prev, next: this._state, action });
      }
    } else if (isRealtime) {
      const needed = this._state.players[playerId].maxHandSize - this._state.players[playerId].hand.length;
      if (needed > 0) this._state = drawCardsForPlayer(this._state, playerId, needed);
      this.emit('stateChanged', { prev, next: this._state, action });
    } else {
      // 일반 버리기: 1장 버리기 → 1장 보충 → 턴 종료 (자동)
      this._state = applyAction(this._state, { type: 'END_TURN', playerId });
      this.emit('stateChanged', { prev, next: this._state, action });
      this.emit('turnStart', { playerId: this._state.currentPlayer });
    }

    return { ok: true };
  }

  discardAllAndDraw(playerId) {
    if (!this._state) return { ok: false, reason: '게임이 시작되지 않았습니다.' };
    if (this._state.phase !== 'playing') return { ok: false, reason: '게임이 진행 중이 아닙니다.' };
    const isRealtimeDiscard = this._state.mode?.includes('realtime');
    if (!isRealtimeDiscard && this._state.currentPlayer !== playerId) {
      return { ok: false, reason: '지금 당신의 턴이 아닙니다.' };
    }
    if (!canDiscardAllDraw(this._state, playerId)) {
      this.emit('invalidAction', { reason: '사용 가능한 카드가 있을 때는 전부 버리기를 할 수 없습니다.' });
      return { ok: false, reason: '사용 가능한 카드가 있습니다.' };
    }

    const action = { type: 'DISCARD_ALL_DRAW', playerId };
    const prev = this._state;

    if (isRealtimeDiscard) {
      const player = this._state.players[playerId];
      let s = {
        ...this._state,
        discardPile: [...this._state.discardPile, ...player.hand],
        players: { ...this._state.players, [playerId]: { ...player, hand: [] } }
      };
      s = drawCardsForPlayer(s, playerId, DEFAULT_HAND_SIZE);
      this._state = s;
      this.emit('stateChanged', { prev, next: this._state, action });
    } else {
      this._state = applyAction(this._state, action);
      this.emit('stateChanged', { prev, next: this._state, action });
      this.emit('turnStart', { playerId: this._state.currentPlayer });
    }
    return { ok: true };
  }

  _endLuckyBirdPhase(playerId, prev, triggerAction) {
    this._state = applyAction(this._state, { type: 'LUCKY_BIRD_END', playerId });
    this.emit('stateChanged', { prev, next: this._state, action: triggerAction });
    this.emit('turnStart', { playerId: this._state.currentPlayer });
  }

  surrender(playerId) {
    if (!this._state || this._state.phase !== 'playing') return { ok: false };
    const opponentId = Object.keys(this._state.players).find(id => id !== playerId);
    if (!opponentId) return { ok: false };
    const prev = this._state;
    this._state = { ...this._state, phase: 'ended', winner: opponentId };
    this.emit('stateChanged', { prev, next: this._state, action: { type: 'SURRENDER', playerId } });
    this.emit('gameOver', { winner: opponentId });
    return { ok: true };
  }

  // 원격 액션 적용 (Firebase 동기화용)
  applyRemoteAction(action) {
    if (!this._state) return;
    const prev = this._state;
    if (action.type === 'PLAY_CARD') {
      const check = validatePlay(this._state, action);
      if (!check.valid) return;
      this._state = applyAction(this._state, action);
      const winner = checkWin(this._state);
      if (winner) {
        this._state = { ...this._state, phase: 'ended', winner };
        this.emit('gameOver', { winner });
      }
    } else {
      this._state = applyAction(this._state, action);
    }
    this.emit('stateChanged', { prev, next: this._state, action });
  }
}
