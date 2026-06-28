class RecordViewer {
  constructor(recordManager) {
    this._mgr = recordManager;
    this._modal = document.getElementById('records-modal');
    this._list  = document.getElementById('records-list');
    this._detail= document.getElementById('record-detail');
  }

  open() {
    if (!this._modal) return;
    this._renderList();
    this._modal.style.display = 'flex';
  }

  close() {
    if (!this._modal) return;
    this._modal.style.display = 'none';
    if (this._detail) this._detail.innerHTML = '';
  }

  _renderList() {
    if (!this._list) return;
    const records = this._mgr.getRecords();
    if (records.length === 0) {
      this._list.innerHTML = '<p class="records-empty">저장된 기록이 없습니다.</p>';
      return;
    }

    this._list.innerHTML = '';
    for (const rec of records) {
      const el = document.createElement('div');
      el.className = 'record-item';
      const date = new Date(rec.startedAt).toLocaleDateString('ko-KR', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      const winner = rec.playerSetup.find(p => p.id === rec.winner)?.name ?? rec.winner;
      el.innerHTML = `
        <span class="record-item__date">${date}</span>
        <span class="record-item__winner">🏆 ${winner}</span>
        <span class="record-item__turns">${rec.turns.length}턴</span>
        <button class="btn btn--small record-item__view">보기</button>
        <button class="btn btn--small record-item__export">내보내기</button>
      `;
      el.querySelector('.record-item__view').addEventListener('click', () => this._renderDetail(rec));
      el.querySelector('.record-item__export').addEventListener('click', () => this._mgr.exportRecord(rec.id));
      this._list.appendChild(el);
    }
  }

  _renderDetail(record) {
    if (!this._detail) return;
    const playActions = record.turns.filter(t => t.action.type === 'PLAY_CARD');

    this._detail.innerHTML = `
      <h3 class="record-detail__title">게임 기록</h3>
      <div class="record-detail__timeline">
        ${playActions.map(t => this._renderTurn(t, record)).join('')}
      </div>
    `;

    this._detail.querySelectorAll('.turn-entry').forEach((el, i) => {
      el.addEventListener('click', () => this._showSnapshot(playActions[i], record));
    });
  }

  _renderTurn(turn, record) {
    const card = CARDS[turn.action.cardId];
    const playerName = record.playerSetup.find(p => p.id === turn.playerId)?.name ?? turn.playerId;
    let target = '';
    if (turn.action.targetHamsterId) {
      const idx = record.playerSetup.findIndex(p => p.id === turn.action.targetPlayerId);
      target = ` → 햄스터 ${idx + 1}-${turn.action.targetHamsterId.split('-h')[1]}`;
    } else if (turn.action.cardId === 'bigNoise') {
      target = ' → (전체)';
    }

    return `<div class="turn-entry" title="클릭하면 상태 보기">
      <span class="turn-entry__num">턴 ${turn.turnNumber}</span>
      <span class="turn-entry__player">[${playerName}]</span>
      <span class="turn-entry__card">${card?.emoji ?? ''} ${card?.nameKo ?? turn.action.cardId}</span>
      <span class="turn-entry__target">${target}</span>
    </div>`;
  }

  _showSnapshot(turn, record) {
    const snap = document.getElementById('state-snapshot');
    if (!snap) return;

    const state = turn.stateAfter;
    let html = '<div class="snapshot">';
    for (const [pid, player] of Object.entries(state.players)) {
      const pName = record.playerSetup.find(p => p.id === pid)?.name ?? pid;
      html += `<div class="snapshot__player"><strong>${pName}</strong><div class="snapshot__hamsters">`;
      for (const h of player.hamsters) {
        const flags = [];
        if (h.sleeping) flags.push('😴');
        if (h.attachments.soundproofCase) flags.push('📦');
        if (h.attachments.caseLock) flags.push('🔒');
        if (h.attachments.waterBottle) flags.push('💧');
        if (h.attachments.ribbon) flags.push('🎀');
        if (h.attachments.backpack) flags.push('🎒');
        html += `<span class="snapshot__hamster">🐹${flags.join('')}</span>`;
      }
      html += '</div></div>';
    }
    html += '</div>';
    snap.innerHTML = html;
    snap.style.display = 'block';
  }
}
