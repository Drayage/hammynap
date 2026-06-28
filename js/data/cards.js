const CARDS = {
  blanket: {
    id: 'blanket',
    nameKo: '이불 덮기',
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
    emoji: '📢',
    expansionOnly: false,
    deckCount: 4,
    targetType: 'all',
    targetOwner: 'any',
    targetConditions: [
      { field: 'sleeping', value: true }
    ],
    blockedBy: ['soundproofCase', 'ribbon'],
    effects: [
      { type: 'setField', field: 'sleeping', value: false }
    ]
  },

  soundproofCase: {
    id: 'soundproofCase',
    nameKo: '방음 케이스',
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
    nameKo: '케이스 잠금',
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
    nameKo: '케이스 강화',
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
