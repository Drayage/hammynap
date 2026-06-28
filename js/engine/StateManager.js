const DEFAULT_HAND_SIZE = 3;

function createInitialState(config) {
  const { playerSetup, hamsterCount, mode } = config;
  const includeExpansion = mode.includes('expansion');
  const deck = buildDeck(includeExpansion);

  const players = {};
  let remaining = [...deck];

  for (const p of playerSetup) {
    const count = hamsterCount ?? (includeExpansion ? 3 : HAMSTER_COUNT_BY_PLAYERS[playerSetup.length]) ?? 3;
    const hand = remaining.splice(0, DEFAULT_HAND_SIZE);
    players[p.id] = {
      id: p.id,
      type: p.type,
      name: p.name,
      hand,
      hamsters: createHamsters(count, p.id),
      maxHandSize: DEFAULT_HAND_SIZE
    };
  }

  return {
    mode,
    phase: 'playing',
    currentPlayer: playerSetup[Math.floor(Math.random() * playerSetup.length)].id,
    playerOrder: playerSetup.map(p => p.id),
    players,
    deck: remaining,
    discardPile: [],
    winner: null,
    luckyBirdActive: false,
    luckyBirdPlayer: null
  };
}

function applyAction(state, action) {
  switch (action.type) {
    case 'PLAY_CARD':        return applyPlayCard(state, action);
    case 'END_TURN':         return applyEndTurn(state, action);
    case 'DISCARD_CARD':     return applyDiscardCard(state, action);
    case 'DISCARD_ALL_DRAW': return applyDiscardAllDraw(state, action);
    case 'LUCKY_BIRD_END':   return applyLuckyBirdEnd(state, action);
    default:                 return state;
  }
}

// ---- 덱 재활용: 버린 패가 새 덱이 됨 ----

function reshuffleIfNeeded(state) {
  if (state.deck.length > 0 || state.discardPile.length === 0) return state;
  return { ...state, deck: shuffle([...state.discardPile]), discardPile: [] };
}

function drawCardsForPlayer(state, playerId, count) {
  let s = reshuffleIfNeeded(state);
  const drawCount = Math.min(count, s.deck.length);
  if (drawCount === 0) return s;
  const drawn = s.deck.slice(0, drawCount);
  return {
    ...s,
    deck: s.deck.slice(drawCount),
    players: {
      ...s.players,
      [playerId]: { ...s.players[playerId], hand: [...s.players[playerId].hand, ...drawn] }
    }
  };
}

// ---- 카드 플레이 ----

function applyPlayCard(state, action) {
  const { playerId, cardId, targetPlayerId, targetHamsterId } = action;
  const card = CARDS[cardId];

  let s = removeCardFromHand(state, playerId, cardId);
  s = { ...s, discardPile: [...s.discardPile, cardId] };

  if (card.targetType === 'all') {
    s = applyEffectsToAll(s, card, playerId);
  } else if (card.targetType === 'hamster') {
    s = applyEffectsToHamster(s, card.effects, targetPlayerId, targetHamsterId, playerId);
  } else {
    s = applyMetaEffects(s, card.effects, playerId);
  }

  return s;
}

function applyEffectsToAll(state, card, playerId) {
  let s = state;
  for (const [pid, player] of Object.entries(s.players)) {
    if (card.targetOwner === 'self' && pid !== playerId) continue;
    if (card.targetOwner === 'opponent' && pid === playerId) continue;
    for (const hamster of player.hamsters) {
      const meetsConditions = card.targetConditions.every(
        c => getNestedField(hamster, c.field) === c.value
      );
      const isBlocked = card.blockedBy.some(att => hamster.attachments[att] === true);
      if (meetsConditions && !isBlocked) {
        s = applyEffectsToHamster(s, card.effects, pid, hamster.id, playerId);
      }
    }
  }
  return s;
}

function applyEffectsToHamster(state, effects, targetPlayerId, targetHamsterId, actingPlayerId) {
  let s = state;
  for (const effect of effects) {
    const handler = effectHandlers[effect.type];
    if (handler) s = handler(s, effect, { targetPlayerId, targetHamsterId, actingPlayerId });
  }
  return s;
}

function applyMetaEffects(state, effects, actingPlayerId) {
  let s = state;
  for (const effect of effects) {
    const handler = effectHandlers[effect.type];
    if (handler) s = handler(s, effect, { actingPlayerId });
  }
  return s;
}

const effectHandlers = {
  setField(state, effect, ctx) {
    return updateHamster(state, ctx.targetPlayerId, ctx.targetHamsterId, h => ({
      ...h,
      [effect.field]: effect.value
    }));
  },

  setAttachment(state, effect, ctx) {
    let s = updateHamster(state, ctx.targetPlayerId, ctx.targetHamsterId, h => ({
      ...h,
      attachments: { ...h.attachments, [effect.field]: effect.value }
    }));

    // 방음 케이스 제거 시 그 위 모든 어태치먼트도 제거
    if (effect.field === 'soundproofCase' && effect.value === false) {
      s = updateHamster(s, ctx.targetPlayerId, ctx.targetHamsterId, h => ({
        ...h,
        attachments: { ...h.attachments, caseLock: false, waterBottle: false }
      }));
    }

    // 리본 제거 시 배낭도 함께 제거 (배낭은 리본 햄스터에게만 부착 가능)
    if (effect.field === 'ribbon' && effect.value === false) {
      const hamster = getHamster(s, ctx.targetPlayerId, ctx.targetHamsterId);
      if (hamster?.attachments.backpack) {
        s = updateHamster(s, ctx.targetPlayerId, ctx.targetHamsterId, h => ({
          ...h, attachments: { ...h.attachments, backpack: false }
        }));
        s = {
          ...s,
          players: {
            ...s.players,
            [ctx.targetPlayerId]: {
              ...s.players[ctx.targetPlayerId],
              maxHandSize: Math.max(DEFAULT_HAND_SIZE, s.players[ctx.targetPlayerId].maxHandSize - 1)
            }
          }
        };
      }
    }

    return s;
  },

  modifyPlayerStat(state, effect, ctx) {
    const player = state.players[ctx.actingPlayerId];
    return {
      ...state,
      players: {
        ...state.players,
        [ctx.actingPlayerId]: { ...player, [effect.stat]: player[effect.stat] + effect.delta }
      }
    };
  },

  // 행운의 새: 다른 행운의 새 카드들은 즉시 버리고 luckyBirdActive 상태로 진입
  luckyBird(state, _effect, ctx) {
    const { actingPlayerId } = ctx;
    const player = state.players[actingPlayerId];
    const extraLuckyBirds = player.hand.filter(c => c === 'luckyBird');
    const remainingHand = player.hand.filter(c => c !== 'luckyBird');
    return {
      ...state,
      luckyBirdActive: true,
      luckyBirdPlayer: actingPlayerId,
      discardPile: [...state.discardPile, ...extraLuckyBirds],
      players: {
        ...state.players,
        [actingPlayerId]: { ...player, hand: remainingHand }
      }
    };
  }
};

// ---- 턴 종료: 카드 사용/버리기 후 자동 호출 ----

function applyEndTurn(state, action) {
  const { playerId } = action;
  const order = state.playerOrder;
  const nextPlayer = order[(order.indexOf(playerId) + 1) % order.length];

  // 턴 종료 시 maxHandSize까지 보충 (덱 소진 시 버린 패 셔플)
  const needed = state.players[playerId].maxHandSize - state.players[playerId].hand.length;
  const s = needed > 0 ? drawCardsForPlayer(state, playerId, needed) : state;

  return { ...s, currentPlayer: nextPlayer };
}

// ---- 1장 버리기 ----

function applyDiscardCard(state, action) {
  const { playerId, cardId } = action;
  const hand = state.players[playerId].hand;
  const idx = hand.indexOf(cardId);
  if (idx === -1) return state;
  const newHand = [...hand.slice(0, idx), ...hand.slice(idx + 1)];
  return {
    ...state,
    discardPile: [...state.discardPile, cardId],
    players: { ...state.players, [playerId]: { ...state.players[playerId], hand: newHand } }
  };
}

// ---- 전부 버리고 3장 뽑기 ----

function applyDiscardAllDraw(state, action) {
  const { playerId } = action;
  const player = state.players[playerId];

  let s = {
    ...state,
    discardPile: [...state.discardPile, ...player.hand],
    players: { ...state.players, [playerId]: { ...player, hand: [] } }
  };

  // 덱 소진 시 버린 패 셔플 후 3장 뽑기
  s = drawCardsForPlayer(s, playerId, DEFAULT_HAND_SIZE);

  const order = s.playerOrder;
  const nextPlayer = order[(order.indexOf(playerId) + 1) % order.length];
  return { ...s, currentPlayer: nextPlayer };
}

// ---- 행운의 새 종료: 3장 뽑고 턴 이동 ----

function applyLuckyBirdEnd(state, action) {
  const { playerId } = action;
  let s = { ...state, luckyBirdActive: false, luckyBirdPlayer: null };
  s = drawCardsForPlayer(s, playerId, DEFAULT_HAND_SIZE);
  const order = s.playerOrder;
  const nextPlayer = order[(order.indexOf(playerId) + 1) % order.length];
  return { ...s, currentPlayer: nextPlayer };
}

// ---- 유틸리티 ----

function removeCardFromHand(state, playerId, cardId) {
  const hand = state.players[playerId].hand;
  const idx = hand.indexOf(cardId);
  if (idx === -1) return state;
  const newHand = [...hand.slice(0, idx), ...hand.slice(idx + 1)];
  return {
    ...state,
    players: { ...state.players, [playerId]: { ...state.players[playerId], hand: newHand } }
  };
}

function updateHamster(state, playerId, hamsterId, updater) {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        ...state.players[playerId],
        hamsters: state.players[playerId].hamsters.map(h =>
          h.id === hamsterId ? updater(h) : h
        )
      }
    }
  };
}

function getHamster(state, playerId, hamsterId) {
  return state.players[playerId]?.hamsters.find(h => h.id === hamsterId);
}

function checkWin(state) {
  const isExpansion = state.mode.includes('expansion');
  for (const [playerId, player] of Object.entries(state.players)) {
    const allSleeping = player.hamsters.every(h => h.sleeping && !h.attachments.ribbon);
    const allRibbon = isExpansion && player.hamsters.every(h => h.attachments.ribbon);
    if (allSleeping || allRibbon) return playerId;
  }
  return null;
}
