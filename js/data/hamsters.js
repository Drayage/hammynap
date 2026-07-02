const HAMSTER_COUNT_BY_PLAYERS = { 2: 5, 3: 4, 4: 3 };

function createHamsters(count, playerId) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${playerId}-h${i}`,
    sleeping: false,
    attachments: {
      soundproofCase: false,
      caseLock: false,
      waterBottle: false,
      ribbon: false,
      backpack: false
    }
  }));
}
