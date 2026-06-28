const MAX_PER_TYPE = 5;
const STORAGE_KEY = 'hammynap_records';

export class RecordManager {
  constructor(engine) {
    this._engine = engine;
    this._currentRecord = null;
    this._turnCount = 0;

    engine.on('stateChanged', ({ prev, next, action }) => {
      if (!prev && next) {
        this._startRecord(next);
      } else if (action && prev) {
        this._recordAction(prev, next, action);
      }
    });

    engine.on('gameOver', ({ winner }) => {
      this._finalizeRecord(winner);
    });
  }

  _startRecord(initialState) {
    this._turnCount = 0;
    this._currentRecord = {
      id: `game-${Date.now()}`,
      mode: initialState.mode,
      playerSetup: Object.values(initialState.players).map(p => ({
        id: p.id, type: p.type, name: p.name
      })),
      hamsterCount: Object.values(initialState.players)[0]?.hamsters.length ?? 0,
      startedAt: new Date().toISOString(),
      endedAt: null,
      winner: null,
      turns: []
    };
  }

  _recordAction(prev, next, action) {
    if (!this._currentRecord) return;
    if (action.type !== 'PLAY_CARD' && action.type !== 'END_TURN') return;

    this._turnCount++;
    this._currentRecord.turns.push({
      turnNumber: this._turnCount,
      playerId: action.playerId,
      action: {
        type: action.type,
        cardId: action.cardId ?? null,
        targetPlayerId: action.targetPlayerId ?? null,
        targetHamsterId: action.targetHamsterId ?? null
      },
      stateBefore: prev,
      stateAfter: next
    });
  }

  _finalizeRecord(winner) {
    if (!this._currentRecord) return;
    this._currentRecord.endedAt = new Date().toISOString();
    this._currentRecord.winner = winner;

    const type = this._currentRecord.playerSetup.some(p => p.type === 'ai') ? 'ai' : 'single';
    this._save(this._currentRecord, type);
    this._currentRecord = null;
  }

  _save(record, type) {
    const all = this._load();
    if (!all[type]) all[type] = [];
    all[type].unshift(record);
    all[type] = all[type].slice(0, MAX_PER_TYPE);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      // localStorage 용량 초과 시 오래된 기록 제거 후 재시도
      all[type] = all[type].slice(0, 2);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    }
  }

  _load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  getRecords(type = null) {
    const all = this._load();
    if (type) return all[type] ?? [];
    return [...(all.single ?? []), ...(all.ai ?? [])].sort(
      (a, b) => new Date(b.startedAt) - new Date(a.startedAt)
    );
  }

  exportRecord(recordId) {
    const records = this.getRecords();
    const record = records.find(r => r.id === recordId);
    if (!record) return;

    const json = JSON.stringify(record, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `hammy-game-${record.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importRecord(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const record = JSON.parse(e.target.result);
          if (!record.id || !record.turns) {
            reject(new Error('올바른 기록 파일이 아닙니다.'));
            return;
          }
          resolve(record);
        } catch {
          reject(new Error('파일을 읽을 수 없습니다.'));
        }
      };
      reader.readAsText(file);
    });
  }
}
