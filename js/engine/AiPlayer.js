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

    engine.on('stateChanged', ({ next }) => {
      if (
        next?.mode?.includes('realtime') &&
        next?.phase === 'playing' &&
        next?.currentPlayer !== this._id
      ) {
        // 실시간 모드: 상대가 카드 낸 직후 즉시 반응 가능
        // 현재는 별도 처리 없음 (turnStart 이벤트 없는 실시간은 추후 구현)
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
    }

    // 카드 낸 뒤 짧은 딜레이 후 턴 종료
    setTimeout(() => {
      const s = this._engine.getState();
      if (s?.phase === 'playing' && s?.currentPlayer === this._id) {
        this._engine.endTurn(this._id);
      }
    }, AI_DELAY_MS);
  }

  _chooseMove(state, hand) {
    // 우선순위: 잠재우기(자기) → 방어 → 공격
    const priorities = ['blanket', 'soundproofCase', 'caseLock', 'waterBottle',
                        'blanketAway', 'cat', 'bigNoise', 'backpack',
                        'ribbon', 'escape', 'luckyBird'];

    for (const cardId of priorities) {
      if (!hand.includes(cardId)) continue;
      const card = CARDS[cardId];
      if (!card) continue;

      if (card.targetType === 'none') {
        return { cardId };
      }

      if (card.targetType === 'all') {
        return { cardId };
      }

      const targets = getValidTargets(state, this._id, cardId);
      if (targets.length > 0) {
        // 잠재우기 카드는 깨어있는 햄스터 중 첫 번째
        const target = targets[0];
        return { cardId, targetPlayerId: target.playerId, targetHamsterId: target.hamsterId };
      }
    }

    return null;
  }
}
