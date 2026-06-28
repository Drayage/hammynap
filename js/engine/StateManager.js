import { CARDS, buildDeck, getNestedField } from '../data/cards.js';
import { createHamsters, HAMSTER_COUNT_BY_PLAYERS } from '../data/hamsters.js';

const DEFAULT_HAND_SIZE = 3;

export function createInitialState(config) {
  const { playerSetup, hamsterCount, mode } = config;
  const includeExpansion = mode.includes('expansion');
  const deck = buildDeck(includeExpansion);

  const players = {};
  let remaining = [...deck];

  for (const p of playerSetup) {
    const count = hamsterCount ?? HAMSTER_COUNT_BY_PLAYERS[playerSetup.length] ?? 3;
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
    currentPlayer: playerSetup[0].id,
    playerOrder: playerSetup.map(p => p.id),
    players,
    deck: remaining,
    discardPile: [],
    winner: null,
    extraTurnActive: false
  };
}

export function applyAction(state, action) {
  switch (action.type) {
    case 'PLAY_CARD':    return applyPlayCard(state, action);
    case 'END_TURN':     return applyEndTurn(state, action);
    case 'DRAW_CARD':    return applyDrawCard(state, action);
    default:             return state;
  }
}

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
      const isBlocked = card.blockedBy.some(
        att => hamster.attachments[att] === true
      );
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
    if (handler) {
      s = handler(s, effect, { targetPlayerId, targetHamsterId, actingPlayerId });
    }
  }
  return s;
}

function applyMetaEffects(state, effects, actingPlayerId) {
  let s = state;
  for (const effect of effects) {
    const handler = effectHandlers[effect.type];
    if (handler) {
      s = handler(s, effect, { actingPlayerId });
    }
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

    // 방음 케이스가 제거되면 그 위의 모든 어태치먼트도 제거
    if (effect.field === 'soundproofCase' && effect.value === false) {
      s = updateHamster(s, ctx.targetPlayerId, ctx.targetHamsterId, h => ({
        ...h,
        attachments: { ...h.attachments, caseLock: false, waterBottle: false }
      }));
    }

    // 햄스터가 깨어나면 배낭도 제거 (배낭은 잠든 햄스터에만 유지)
    if (effect.field === 'sleeping' && effect.value === false) {
      s = updateHamster(s, ctx.targetPlayerId, ctx.targetHamsterId, h => {
        if (!h.attachments.backpack) return h;
        return { ...h, attachments: { ...h.attachments, backpack: false } };
      });
      // maxHandSize도 되돌림 - 배낭이 있었던 경우만
      const hamster = getHamster(state, ctx.targetPlayerId, ctx.targetHamsterId);
      if (hamster?.attachments.backpack) {
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
        [ctx.actingPlayerId]: {
          ...player,
          [effect.stat]: player[effect.stat] + effect.delta
        }
      }
    };
  },

  extraTurn(state, _effect, ctx) {
    return { ...state, extraTurnActive: true, extraTurnPlayer: ctx.actingPlayerId };
  }
};

function applyEndTurn(state, action) {
  const { playerId } = action;

  // extraTurn 중이면 무시
  if (state.extraTurnActive && state.extraTurnPlayer === playerId) {
    return { ...state, extraTurnActive: false, extraTurnPlayer: null };
  }

  const order = state.playerOrder;
  const idx = order.indexOf(playerId);
  const nextPlayer = order[(idx + 1) % order.length];

  let s = state;

  // 턴 종료 시 손패를 maxHandSize까지 보충
  const player = s.players[playerId];
  const needed = player.maxHandSize - player.hand.length;
  if (needed > 0 && s.deck.length > 0) {
    const drawn = s.deck.slice(0, Math.min(needed, s.deck.length));
    s = {
      ...s,
      deck: s.deck.slice(drawn.length),
      players: {
        ...s.players,
        [playerId]: {
          ...s.players[playerId],
          hand: [...s.players[playerId].hand, ...drawn]
        }
      }
    };
  }

  return { ...s, currentPlayer: nextPlayer };
}

function applyDrawCard(state, action) {
  const { playerId } = action;
  if (state.deck.length === 0) return state;

  const [card, ...rest] = state.deck;
  return {
    ...state,
    deck: rest,
    players: {
      ...state.players,
      [playerId]: {
        ...state.players[playerId],
        hand: [...state.players[playerId].hand, card]
      }
    }
  };
}

function removeCardFromHand(state, playerId, cardId) {
  const hand = state.players[playerId].hand;
  const idx = hand.indexOf(cardId);
  if (idx === -1) return state;
  const newHand = [...hand.slice(0, idx), ...hand.slice(idx + 1)];
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...state.players[playerId], hand: newHand }
    }
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

export function checkWin(state) {
  const isExpansion = state.mode.includes('expansion');
  for (const [playerId, player] of Object.entries(state.players)) {
    const won = isExpansion
      ? player.hamsters.every(h => h.attachments.ribbon)
      : player.hamsters.every(h => h.sleeping);
    if (won) return playerId;
  }
  return null;
}
