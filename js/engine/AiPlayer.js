const AI_DELAY_MS = 800;

class AiPlayer {
  constructor(playerId, engine) {
    this._id = playerId;
    this._engine = engine;
    this._realtimeScheduled = false;

    engine.on('turnStart', ({ playerId }) => {
      if (playerId === this._id) {
        setTimeout(() => this._takeTurn(), AI_DELAY_MS);
      }
    });

    engine.on('stateChanged', ({ next }) => {
      if (!next || next.phase !== 'playing') return;

      if (next.mode?.includes('realtime') && !this._realtimeScheduled) {
        const aiPlayer = next.players[this._id];
        if (aiPlayer) {
          this._realtimeScheduled = true;
          setTimeout(() => {
            this._realtimeScheduled = false;
            this._takeTurn();
          }, AI_DELAY_MS);
        }
        return;
      }

      if (next.luckyBirdActive && next.luckyBirdPlayer === this._id) {
        setTimeout(() => this._playNextLuckyBirdCard(), AI_DELAY_MS / 2);
      }
    });
  }

  _takeTurn() {
    const state = this._engine.getState();
    if (!state || state.phase !== 'playing') return;
    const isRealtime = state.mode?.includes('realtime');
    if (!isRealtime && state.currentPlayer !== this._id) return;

    const hand = state.players[this._id]?.hand;
    if (!hand || hand.length === 0) return;

    const move = this._chooseMove(state, hand);

    if (move) {
      this._engine.playCard(this._id, move.cardId, move.targetPlayerId, move.targetHamsterId);
    } else if (canDiscardAllDraw(state, this._id)) {
      this._engine.discardAllAndDraw(this._id);
    } else {
      this._engine.discardCard(this._id, hand[0]);
    }
  }

  _playNextLuckyBirdCard() {
    const state = this._engine.getState();
    if (!state?.luckyBirdActive || state?.luckyBirdPlayer !== this._id) return;

    const hand = state.players[this._id].hand;
    if (hand.length === 0) return;

    const cardId = hand[0];
    const card = CARDS[cardId];

    if (card.targetType === 'none') {
      this._engine.playCard(this._id, cardId);
      return;
    }
    if (card.targetType === 'all') {
      const check = validatePlay(state, { type: 'PLAY_CARD', playerId: this._id, cardId });
      if (check.valid) { this._engine.playCard(this._id, cardId); return; }
    } else {
      const targets = getValidTargets(state, this._id, cardId);
      if (targets.length > 0) {
        const t = targets[0];
        this._engine.playCard(this._id, cardId, t.playerId, t.hamsterId);
        return;
      }
    }
    this._engine.discardCard(this._id, cardId);
  }

  _chooseMove(state, hand) {
    // 1. 즉시 승리 가능하면 그 수를 둠
    const winMove = this._findWinningMove(state, hand);
    if (winMove) return winMove;

    // 2. 상대가 이기기 직전(1수 남음)이면 막기
    const threat = this._findMostUrgentThreat(state);
    if (threat) {
      const blockMove = this._findBlockingMove(state, hand, threat);
      if (blockMove) return blockMove;
    }

    // 3. 일반 휴리스틱
    const priorities = ['blanket', 'soundproofCase', 'caseLock', 'waterBottle',
                        'blanketAway', 'cat', 'bigNoise', 'backpack',
                        'ribbon', 'escape', 'luckyBird'];

    for (const cardId of priorities) {
      if (!hand.includes(cardId)) continue;
      const card = CARDS[cardId];
      if (!card) continue;

      if (card.targetType === 'none') return { cardId };

      if (card.targetType === 'all') {
        const check = validatePlay(state, { type: 'PLAY_CARD', playerId: this._id, cardId });
        if (check.valid) return { cardId };
        continue;
      }

      const targets = getValidTargets(state, this._id, cardId);
      if (targets.length > 0) {
        return { cardId, targetPlayerId: targets[0].playerId, targetHamsterId: targets[0].hamsterId };
      }
    }

    return null;
  }

  // 이번 턴에 카드 1장으로 승리 가능한지 확인
  _findWinningMove(state, hand) {
    for (const cardId of hand) {
      const card = CARDS[cardId];
      if (!card) continue;

      if (card.targetType === 'none') {
        const ns = applyAction(state, { type: 'PLAY_CARD', playerId: this._id, cardId });
        if (checkWin(ns) === this._id) return { cardId };
      } else if (card.targetType === 'all') {
        const check = validatePlay(state, { type: 'PLAY_CARD', playerId: this._id, cardId });
        if (!check.valid) continue;
        const ns = applyAction(state, { type: 'PLAY_CARD', playerId: this._id, cardId });
        if (checkWin(ns) === this._id) return { cardId };
      } else {
        for (const t of getValidTargets(state, this._id, cardId)) {
          const action = { type: 'PLAY_CARD', playerId: this._id, cardId, targetPlayerId: t.playerId, targetHamsterId: t.hamsterId };
          if (checkWin(applyAction(state, action)) === this._id) {
            return { cardId, targetPlayerId: t.playerId, targetHamsterId: t.hamsterId };
          }
        }
      }
    }
    return null;
  }

  // 가장 위협적인 상대 찾기 (1수 남은 경우만 반응)
  _findMostUrgentThreat(state) {
    const isExpansion = state.mode.includes('expansion');
    let worstPid = null;
    let worstLevel = Infinity;

    for (const [pid, player] of Object.entries(state.players)) {
      if (pid === this._id) continue;
      const notSleep = player.hamsters.filter(h => !(h.sleeping && !h.attachments.ribbon)).length;
      const notRibbon = isExpansion
        ? player.hamsters.filter(h => !h.attachments.ribbon).length
        : Infinity;
      const level = Math.min(notSleep, notRibbon);
      if (level < worstLevel) { worstLevel = level; worstPid = pid; }
    }

    if (worstLevel <= 1 && worstPid) {
      const player = state.players[worstPid];
      const notSleep = player.hamsters.filter(h => !(h.sleeping && !h.attachments.ribbon)).length;
      const notRibbon = isExpansion
        ? player.hamsters.filter(h => !h.attachments.ribbon).length
        : Infinity;
      return { pid: worstPid, threat: notRibbon <= notSleep ? 'ribbon' : 'sleeping' };
    }
    return null;
  }

  // 상대 막기 수 찾기
  _findBlockingMove(state, hand, { pid, threat }) {
    if (threat === 'sleeping') {
      // 리본을 상대 잠든 햄스터에 붙이면 수면 승리 방해 가능
      if (hand.includes('ribbon')) {
        const targets = getValidTargets(state, this._id, 'ribbon').filter(t => t.playerId === pid);
        const sleepingFirst = targets.slice().sort((a, b) => {
          const hA = state.players[a.playerId].hamsters.find(h => h.id === a.hamsterId);
          const hB = state.players[b.playerId].hamsters.find(h => h.id === b.hamsterId);
          return (hB?.sleeping ? 1 : 0) - (hA?.sleeping ? 1 : 0);
        });
        if (sleepingFirst.length > 0) {
          const t = sleepingFirst[0];
          return { cardId: 'ribbon', targetPlayerId: t.playerId, targetHamsterId: t.hamsterId };
        }
      }
      if (hand.includes('blanketAway')) {
        const targets = getValidTargets(state, this._id, 'blanketAway').filter(t => t.playerId === pid);
        if (targets.length > 0) return { cardId: 'blanketAway', targetPlayerId: targets[0].playerId, targetHamsterId: targets[0].hamsterId };
      }
      if (hand.includes('bigNoise')) {
        const check = validatePlay(state, { type: 'PLAY_CARD', playerId: this._id, cardId: 'bigNoise' });
        if (check.valid) return { cardId: 'bigNoise' };
      }
      if (hand.includes('cat')) {
        const targets = getValidTargets(state, this._id, 'cat').filter(t => t.playerId === pid);
        if (targets.length > 0) return { cardId: 'cat', targetPlayerId: targets[0].playerId, targetHamsterId: targets[0].hamsterId };
      }
    }
    if (threat === 'ribbon') {
      if (hand.includes('escape')) {
        const targets = getValidTargets(state, this._id, 'escape').filter(t => t.playerId === pid);
        if (targets.length > 0) return { cardId: 'escape', targetPlayerId: targets[0].playerId, targetHamsterId: targets[0].hamsterId };
      }
    }
    return null;
  }
}
