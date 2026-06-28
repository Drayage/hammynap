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

    this.emit('stateChanged', { prev, next: this._state, action });
    this.emit('cardPlayed', { playerId, cardId, targetPlayerId, targetHamsterId });
    return { ok: true };
  }

  endTurn(playerId) {
    if (!this._state) return { ok: false, reason: '게임이 시작되지 않았습니다.' };
    if (this._state.phase !== 'playing') return { ok: false, reason: '게임이 진행 중이 아닙니다.' };
    if (!this._state.extraTurnActive && this._state.currentPlayer !== playerId) {
      return { ok: false, reason: '지금 당신의 턴이 아닙니다.' };
    }

    const prev = this._state;
    this._state = applyAction(this._state, { type: 'END_TURN', playerId });
    this.emit('stateChanged', { prev, next: this._state, action: { type: 'END_TURN', playerId } });
    this.emit('turnStart', { playerId: this._state.currentPlayer });
    return { ok: true };
  }

  discardAllAndDraw(playerId) {
    if (!this._state) return { ok: false, reason: '게임이 시작되지 않았습니다.' };
    if (this._state.phase !== 'playing') return { ok: false, reason: '게임이 진행 중이 아닙니다.' };
    if (this._state.currentPlayer !== playerId) return { ok: false, reason: '지금 당신의 턴이 아닙니다.' };
    if (!canDiscardAllDraw(this._state, playerId)) {
      this.emit('invalidAction', { reason: '사용 가능한 카드가 있을 때는 전부 버리기를 할 수 없습니다.' });
      return { ok: false, reason: '사용 가능한 카드가 있습니다.' };
    }

    const action = { type: 'DISCARD_ALL_DRAW', playerId };
    const prev = this._state;
    this._state = applyAction(this._state, action);
    this.emit('stateChanged', { prev, next: this._state, action });
    this.emit('turnStart', { playerId: this._state.currentPlayer });
    return { ok: true };
  }

  // 원격 액션 적용 (AI 또는 Firebase 동기화용)
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
