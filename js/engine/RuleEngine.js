function validatePlay(state, action) {
  const { playerId, cardId, targetPlayerId, targetHamsterId } = action;

  if (!state.extraTurnActive && state.currentPlayer !== playerId) {
    return fail('지금 당신의 턴이 아닙니다.');
  }

  const player = state.players[playerId];
  if (!player) return fail('플레이어를 찾을 수 없습니다.');

  if (!player.hand.includes(cardId)) {
    return fail('해당 카드가 손패에 없습니다.');
  }

  const card = CARDS[cardId];
  if (!card) return fail('존재하지 않는 카드입니다.');

  if (card.targetType === 'none') {
    return ok();
  }

  if (card.targetType === 'all') {
    const affected = countAffected(state, card, playerId);
    if (affected === 0) return fail('효과를 받을 햄스터가 없습니다.');
    return ok();
  }

  // targetType === 'hamster'
  const targetOwnerCheck = checkTargetOwner(card.targetOwner, playerId, targetPlayerId);
  if (!targetOwnerCheck.valid) return targetOwnerCheck;

  const targetPlayer = state.players[targetPlayerId];
  if (!targetPlayer) return fail('대상 플레이어를 찾을 수 없습니다.');

  const hamster = targetPlayer.hamsters.find(h => h.id === targetHamsterId);
  if (!hamster) return fail('대상 햄스터를 찾을 수 없습니다.');

  for (const cond of card.targetConditions) {
    const actual = getNestedField(hamster, cond.field);
    if (actual !== cond.value) {
      return fail(`조건 불충족: ${cond.field}가 ${cond.value}이어야 합니다.`);
    }
  }

  for (const att of card.blockedBy) {
    if (hamster.attachments[att] === true) {
      return fail(`${att}에 의해 차단되었습니다.`);
    }
  }

  return ok();
}

function getValidTargets(state, playerId, cardId) {
  const card = CARDS[cardId];
  if (!card) return [];
  if (card.targetType === 'none') return [];
  if (card.targetType === 'all') return [];

  const targets = [];
  for (const [pid, player] of Object.entries(state.players)) {
    if (card.targetOwner === 'self' && pid !== playerId) continue;
    if (card.targetOwner === 'opponent' && pid === playerId) continue;

    for (const hamster of player.hamsters) {
      const meetsConditions = card.targetConditions.every(
        c => getNestedField(hamster, c.field) === c.value
      );
      const isBlocked = card.blockedBy.some(att => hamster.attachments[att] === true);
      if (meetsConditions && !isBlocked) {
        targets.push({ playerId: pid, hamsterId: hamster.id });
      }
    }
  }
  return targets;
}

function countAffected(state, card, actingPlayerId) {
  let count = 0;
  for (const [pid, player] of Object.entries(state.players)) {
    if (card.targetOwner === 'self' && pid !== actingPlayerId) continue;
    if (card.targetOwner === 'opponent' && pid === actingPlayerId) continue;
    for (const h of player.hamsters) {
      const meets = card.targetConditions.every(c => getNestedField(h, c.field) === c.value);
      const blocked = card.blockedBy.some(att => h.attachments[att] === true);
      if (meets && !blocked) count++;
    }
  }
  return count;
}

function checkTargetOwner(targetOwner, playerId, targetPlayerId) {
  if (targetOwner === 'self' && targetPlayerId !== playerId) {
    return fail('자신의 햄스터를 대상으로 해야 합니다.');
  }
  if (targetOwner === 'opponent' && targetPlayerId === playerId) {
    return fail('상대방의 햄스터를 대상으로 해야 합니다.');
  }
  return ok();
}

function canDiscardAllDraw(state, playerId) {
  if (state.currentPlayer !== playerId) return false;
  const player = state.players[playerId];
  if (!player || player.hand.length === 0) return false;

  for (const cardId of player.hand) {
    const card = CARDS[cardId];
    if (!card) continue;
    if (card.targetType === 'none') return false;
    if (card.targetType === 'all') {
      if (countAffected(state, card, playerId) > 0) return false;
    } else {
      if (getValidTargets(state, playerId, cardId).length > 0) return false;
    }
  }
  return true;
}

function ok() { return { valid: true, reason: null }; }
function fail(reason) { return { valid: false, reason }; }
