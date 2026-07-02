// 상태 객체만으로 우승자를 계산 (TournamentManager 인스턴스 없이도 사용 가능 — 온라인 게스트용)
function computeTournamentWinners(ts) {
  if (!ts) return [];
  if (!ts.isExpansion) {
    return Object.entries(ts.wins || {}).filter(([, w]) => w >= 2).map(([id]) => id);
  }
  const scores = ts.scores || {};
  const items  = ts.items  || {};
  let topScore = -1, topCount = -1;
  for (const pid of Object.keys(scores)) {
    const s = scores[pid], c = (items[pid] || []).length;
    if (s > topScore || (s === topScore && c > topCount)) { topScore = s; topCount = c; }
  }
  return Object.keys(scores).filter(p =>
    scores[p] === topScore && (items[p] || []).length === topCount
  );
}

class TournamentManager {
  constructor(playerSetup, isExpansion) {
    this._players    = playerSetup;
    this._isExpansion = isExpansion;
    this._roundNumber = 0;
    this._isOver      = false;
    this._resultsShown = false;

    if (isExpansion) {
      this._medals  = [1, 2, 3];
      this._pillows = [1, 2, 3];
      this._scores  = {};
      this._items   = {};
      for (const p of playerSetup) { this._scores[p.id] = 0; this._items[p.id] = []; }
    } else {
      this._wins = {};
      for (const p of playerSetup) this._wins[p.id] = 0;
    }
  }

  recordWin(winnerId, finalState) {
    this._roundNumber++;
    if (this._isExpansion) {
      const winType = this._getWinType(finalState, winnerId);
      let awardedItem = null;
      if (winType === 'ribbon' && this._medals.length > 0) {
        const value = this._medals.shift();
        this._scores[winnerId] += value;
        this._items[winnerId].push({ type: 'medal', value });
        awardedItem = { type: 'medal', value };
      } else if (winType === 'sleep' && this._pillows.length > 0) {
        const value = this._pillows.shift();
        this._scores[winnerId] += value;
        this._items[winnerId].push({ type: 'pillow', value });
        awardedItem = { type: 'pillow', value };
      }
      const over = this._medals.length === 0 || this._pillows.length === 0;
      this._isOver = over;
      return { over, awardedItem, winnerId, winType };
    } else {
      this._wins[winnerId] = (this._wins[winnerId] || 0) + 1;
      const over = this._wins[winnerId] >= 2;
      this._isOver = over;
      return { over, winnerId };
    }
  }

  markResultsShown() { this._resultsShown = true; }

  _getWinType(state, winnerId) {
    const player = state.players[winnerId];
    if (player?.hamsters.every(h => h.attachments.ribbon)) return 'ribbon';
    return 'sleep';
  }

  getTournamentWinners() {
    return computeTournamentWinners(this.getState());
  }

  getRoundNumber() { return this._roundNumber; }

  getState() {
    return {
      isExpansion:   this._isExpansion,
      roundNumber:   this._roundNumber,
      isOver:        this._isOver,
      resultsShown:  this._resultsShown,
      medals:  this._isExpansion ? [...this._medals]  : null,
      pillows: this._isExpansion ? [...this._pillows] : null,
      scores:  this._isExpansion ? { ...this._scores } : null,
      items:   this._isExpansion ? { ...this._items }  : null,
      wins:    !this._isExpansion ? { ...this._wins }  : null,
    };
  }
}
