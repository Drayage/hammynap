class TournamentManager {
  constructor(playerSetup, isExpansion) {
    this._players    = playerSetup;
    this._isExpansion = isExpansion;
    this._roundNumber = 0;

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
      return { over, awardedItem, winnerId, winType };
    } else {
      this._wins[winnerId] = (this._wins[winnerId] || 0) + 1;
      const over = this._wins[winnerId] >= 2;
      return { over, winnerId };
    }
  }

  _getWinType(state, winnerId) {
    const player = state.players[winnerId];
    if (player?.hamsters.every(h => h.attachments.ribbon)) return 'ribbon';
    return 'sleep';
  }

  getTournamentWinners() {
    if (!this._isExpansion) {
      return Object.entries(this._wins).filter(([, w]) => w >= 2).map(([id]) => id);
    }
    let topScore = -1, topCount = -1;
    for (const pid of Object.keys(this._scores)) {
      const s = this._scores[pid], c = this._items[pid].length;
      if (s > topScore || (s === topScore && c > topCount)) { topScore = s; topCount = c; }
    }
    return Object.keys(this._scores).filter(p =>
      this._scores[p] === topScore && this._items[p].length === topCount
    );
  }

  getRoundNumber() { return this._roundNumber; }

  getState() {
    return {
      isExpansion: this._isExpansion,
      roundNumber: this._roundNumber,
      medals:  this._isExpansion ? [...this._medals]  : null,
      pillows: this._isExpansion ? [...this._pillows] : null,
      scores:  this._isExpansion ? { ...this._scores } : null,
      items:   this._isExpansion ? { ...this._items }  : null,
      wins:    !this._isExpansion ? { ...this._wins }  : null,
    };
  }
}
