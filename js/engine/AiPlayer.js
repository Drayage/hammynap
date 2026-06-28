const AI_DELAY_MS = 800;

class AiPlayer {
  constructor(playerId, engine) {
    this._id = playerId;
    this._engine = engine;

    engine.on('turnStart', ({ playerId }) => {
      if (playerId === this._id) {
        setTimeout(() => this._takeTurn(), AI_DELAY_MS);
      }
    });

    // 행운의 새 모드: stateChanged에서 남은 카드 처리
    engine.on('stateChanged', ({ next }) => {
      if (
        next?.phase === 'playing' &&
        next?.luckyBirdActive &&
        next?.luckyBirdPlayer === this._id
      ) {
        setTimeout(() => this._playNextLuckyBirdCard(), AI_DELAY_MS / 2);
      }
    });
  }

  _takeTurn() {
    const state = this._engine.getState();
    if (!state || state.phase !== 'playing') return;
    if (state.currentPlayer !== this._id) return;

    const hand = state.players[this._id].hand;
    const move = this._chooseMove(state, hand);

    if (move) {
      this._engine.playCard(this._id, move.cardId, move.targetPlayerId, move.targetHamsterId);
    } else if (canDiscardAllDraw(state, this._id)) {
      this._engine.discardAllAndDraw(this._id);
    } else {
      // 사용할 카드 없으면 첫 번째 카드 버리기
      this._engine.discardCard(this._id, hand[0]);
    }
    // 턴은 자동 종료됨
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
    // 유효 대상 없음 → 버리기
    this._engine.discardCard(this._id, cardId);
  }

  _chooseMove(state, hand) {
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
}
