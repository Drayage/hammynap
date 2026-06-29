const CARDS = {
  blanket: {
    id: 'blanket',
    nameKo: '이불 덮기',
    descKo: '내 햄스터 1마리를 재웁니다.',
    emoji: '🛏️',
    expansionOnly: false,
    deckCount: 21,
    targetType: 'hamster',
    targetOwner: 'self',
    targetConditions: [
      { field: 'sleeping', value: false },
      { field: 'attachments.ribbon', value: false }
    ],
    blockedBy: [],
    effects: [
      { type: 'setField', field: 'sleeping', value: true }
    ]
  },

  blanketAway: {
    id: 'blanketAway',
    nameKo: '이불 치우기',
    descKo: '잠든 상대 햄스터의 이불을 치웁니다. 수면캡슐·잠금 있으면 불가.',
    emoji: '✋',
    expansionOnly: false,
    deckCount: 8,
    targetType: 'hamster',
    targetOwner: 'opponent',
    targetConditions: [
      { field: 'sleeping', value: true },
      { field: 'attachments.ribbon', value: false }
    ],
    blockedBy: ['caseLock'],
    effects: [
      { type: 'setField', field: 'sleeping', value: false }
    ]
  },

  bigNoise: {
    id: 'bigNoise',
    nameKo: '큰 소음',
    descKo: '수면캡슐이 없는 모든 잠든 햄스터를 깨웁니다.',
    emoji: '📢',
    expansionOnly: false,
    deckCount: 4,
    targetType: 'all',
    targetOwner: 'any',
    targetConditions: [
      { field: 'sleeping', value: true }
    ],
    blockedBy: ['soundproofCase'],
    effects: [
      { type: 'setField', field: 'sleeping', value: false }
    ]
  },

  soundproofCase: {
    id: 'soundproofCase',
    nameKo: '수면캡슐',
    descKo: '내 햄스터를 수면캡슐에 넣어 큰 소음을 막습니다.',
    emoji: '📦',
    expansionOnly: false,
    deckCount: 9,
    targetType: 'hamster',
    targetOwner: 'self',
    targetConditions: [
      { field: 'attachments.soundproofCase', value: false }
    ],
    blockedBy: [],
    effects: [
      { type: 'setAttachment', field: 'soundproofCase', value: true }
    ]
  },

  caseLock: {
    id: 'caseLock',
    nameKo: '수면캡슐 잠금',
    descKo: '수면캡슐에 자물쇠를 달아 이불 치우기를 막습니다.',
    emoji: '🔒',
    expansionOnly: false,
    deckCount: 4,
    targetType: 'hamster',
    targetOwner: 'self',
    targetConditions: [
      { field: 'sleeping', value: true },
      { field: 'attachments.soundproofCase', value: true },
      { field: 'attachments.caseLock', value: false },
      { field: 'attachments.ribbon', value: false }
    ],
    blockedBy: [],
    effects: [
      { type: 'setAttachment', field: 'caseLock', value: true }
    ]
  },

  cat: {
    id: 'cat',
    nameKo: '망치',
    descKo: '상대 수면캡슐(잠금 포함)을 파괴합니다. 강화되어 있으면 막힙니다.',
    emoji: '🔨',
    expansionOnly: false,
    deckCount: 4,
    targetType: 'hamster',
    targetOwner: 'opponent',
    targetConditions: [
      { field: 'attachments.soundproofCase', value: true }
    ],
    blockedBy: ['waterBottle'],
    effects: [
      { type: 'setAttachment', field: 'caseLock', value: false },
      { type: 'setAttachment', field: 'soundproofCase', value: false }
    ]
  },

  waterBottle: {
    id: 'waterBottle',
    nameKo: '수면캡슐 강화',
    descKo: '수면캡슐을 벽돌로 바꿔 망치로 파괴되지 않습니다.',
    emoji: '🧱',
    expansionOnly: false,
    deckCount: 4,
    targetType: 'hamster',
    targetOwner: 'self',
    targetConditions: [
      { field: 'attachments.soundproofCase', value: true },
      { field: 'attachments.waterBottle', value: false }
    ],
    blockedBy: [],
    effects: [
      { type: 'setAttachment', field: 'waterBottle', value: true }
    ]
  },

  // --- 확장팩 ---

  ribbon: {
    id: 'ribbon',
    nameKo: '리본',
    descKo: '어느 햄스터에나 리본을 답니다. 리본 달린 햄스터는 잠들지 않습니다.',
    emoji: '🎀',
    expansionOnly: true,
    deckCount: 16,
    targetType: 'hamster',
    targetOwner: 'any',
    targetConditions: [
      { field: 'attachments.ribbon', value: false }
    ],
    blockedBy: ['caseLock'],
    effects: [
      { type: 'setAttachment', field: 'ribbon', value: true }
    ]
  },

  escape: {
    id: 'escape',
    nameKo: '리본 제거',
    descKo: '햄스터의 리본을 제거합니다.',
    emoji: '✂️',
    expansionOnly: true,
    deckCount: 16,
    targetType: 'hamster',
    targetOwner: 'any',
    targetConditions: [
      { field: 'attachments.ribbon', value: true }
    ],
    blockedBy: [],
    effects: [
      { type: 'setAttachment', field: 'ribbon', value: false }
    ]
  },

  luckyBird: {
    id: 'luckyBird',
    nameKo: '행운의 새',
    descKo: '이번 턴에 손패의 모든 카드를 사용할 수 있습니다.',
    emoji: '🐦',
    expansionOnly: true,
    deckCount: 4,
    targetType: 'none',
    targetOwner: null,
    targetConditions: [],
    blockedBy: [],
    effects: [
      { type: 'luckyBird' }
    ]
  },

  backpack: {
    id: 'backpack',
    nameKo: '배낭',
    descKo: '리본 달린 내 햄스터에 배낭을 달아 손패 최대 크기를 +1 합니다.',
    emoji: '🎒',
    expansionOnly: true,
    deckCount: 4,
    targetType: 'hamster',
    targetOwner: 'self',
    targetConditions: [
      { field: 'attachments.ribbon', value: true },
      { field: 'attachments.backpack', value: false }
    ],
    blockedBy: [],
    effects: [
      { type: 'setAttachment', field: 'backpack', value: true },
      { type: 'modifyPlayerStat', stat: 'maxHandSize', delta: 1 }
    ]
  }
};

function getNestedField(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function buildDeck(includeExpansion) {
  const deck = [];
  for (const card of Object.values(CARDS)) {
    if (!includeExpansion && card.expansionOnly) continue;
    for (let i = 0; i < card.deckCount; i++) {
      deck.push(card.id);
    }
  }
  return shuffle(deck);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
