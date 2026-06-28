// All dependencies loaded as globals via ordered <script> tags in index.html

const VIEWS = ['view-lobby', 'view-game', 'view-pass-screen'];

function showView(id) {
  VIEWS.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = v === id ? '' : 'none';
  });
}

let engine, renderer, recordManager, recordViewer;
let sound, tournament;
let _gameMode, _config;
let myPlayerId = 'p1';

function init() {
  sound = new SoundManager();
  showView('view-lobby');
  setupLobby();
  setupAdvancedToggle();
  setupGameButtons();
}

function setupAdvancedToggle() {
  const btn   = document.getElementById('advanced-toggle');
  const panel = document.getElementById('advanced-panel');
  btn?.addEventListener('click', () => {
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
  });
}

function setupLobby() {
  document.getElementById('btn-start-single-ai')?.addEventListener('click', () => startGame('ai'));
  document.getElementById('btn-start-passplay')?.addEventListener('click', () => startGame('passplay'));
  document.getElementById('btn-open-records')?.addEventListener('click', () => recordViewer?.open());
  document.getElementById('records-close')?.addEventListener('click', () => recordViewer?.close());

  document.getElementById('btn-import-record')?.addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const record = await recordManager?.importRecord(file);
      if (record) recordViewer?._renderDetail(record);
    } catch (err) {
      alert(err.message);
    }
  });
}

function setupGameButtons() {
  document.getElementById('btn-mute')?.addEventListener('click', () => {
    const muted = sound.toggleMute();
    const btn = document.getElementById('btn-mute');
    if (btn) btn.textContent = muted ? '🔇' : '🔊';
  });

  document.getElementById('btn-rules')?.addEventListener('click', () => {
    document.getElementById('rules-modal').style.display = 'flex';
  });
  document.getElementById('rules-close')?.addEventListener('click', () => {
    document.getElementById('rules-modal').style.display = 'none';
  });

  document.getElementById('btn-surrender')?.addEventListener('click', () => {
    const state = engine?.getState();
    if (!state || state.phase !== 'playing') return;
    if (!confirm('정말 항복하시겠습니까?')) return;
    engine.surrender(myPlayerId);
  });

  document.getElementById('btn-back-to-lobby')?.addEventListener('click', () => {
    sound.stopBgm();
    showView('view-lobby');
    document.getElementById('game-over-overlay').style.display = 'none';
  });

  document.getElementById('btn-next-round')?.addEventListener('click', () => {
    document.getElementById('round-over-overlay').style.display = 'none';
    startRound();
  });

  document.getElementById('btn-end-tournament')?.addEventListener('click', () => {
    document.getElementById('round-over-overlay').style.display = 'none';
    sound.stopBgm();
    showView('view-lobby');
  });

  document.getElementById('btn-round-to-lobby')?.addEventListener('click', () => {
    document.getElementById('round-over-overlay').style.display = 'none';
    sound.stopBgm();
    showView('view-lobby');
  });
}

function buildConfig(mode) {
  const playerCount  = parseInt(document.getElementById('setting-players')?.value ?? '2');
  const expansion    = document.getElementById('setting-expansion')?.checked ?? false;
  const hamsterCount = parseInt(document.getElementById('setting-hamsters')?.value ?? '0') ||
                       (expansion ? 3 : (HAMSTER_COUNT_BY_PLAYERS[playerCount] ?? 3));
  const realtime     = document.getElementById('setting-realtime')?.checked ?? false;

  let gameMode = 'basic';
  if (expansion && realtime) gameMode = 'realtime-expansion';
  else if (expansion)        gameMode = 'expansion';
  else if (realtime)         gameMode = 'realtime';

  const playerSetup = [];
  if (mode === 'ai') {
    playerSetup.push({ id: 'p1', type: 'human', name: '나' });
    for (let i = 2; i <= playerCount; i++) {
      playerSetup.push({ id: `p${i}`, type: 'ai', name: `AI ${i - 1}` });
    }
  } else {
    for (let i = 1; i <= playerCount; i++) {
      playerSetup.push({ id: `p${i}`, type: 'human', name: `플레이어 ${i}` });
    }
  }

  return { mode: gameMode, playerSetup, hamsterCount };
}

function startGame(mode) {
  _gameMode = mode;
  _config   = buildConfig(mode);

  const isExpansion = _config.mode.includes('expansion');
  const isSingle    = document.getElementById('setting-single')?.checked ?? false;

  tournament = isSingle ? null : new TournamentManager(_config.playerSetup, isExpansion);

  sound.startBgm();
  startRound();
}

function startRound() {
  engine = new GameEngine();

  // Register tournament handler BEFORE Renderer so it fires first and can suppress overlay
  if (tournament) {
    engine.on('gameOver', ({ winner }) => {
      renderer.suppressGameOver();
      const finalState = engine.getState();
      const result = tournament.recordWin(winner, finalState);
      renderTournamentInfo();
      if (result.over) {
        sound.playWin();
        showTournamentEndOverlay(tournament.getTournamentWinners());
      } else {
        sound.playRoundWin();
        showRoundOverlay(winner, result);
      }
    });
  } else {
    engine.on('gameOver', () => sound.playWin());
  }

  // Sound hooks
  engine.on('stateChanged', ({ prev, next, action }) => {
    if (!prev || !action) return;
    if (action.type === 'PLAY_CARD') {
      let handled = false;
      outer: for (const [pid, player] of Object.entries(next.players)) {
        for (const h of player.hamsters) {
          const oldH = prev.players[pid]?.hamsters.find(oh => oh.id === h.id);
          if (!oldH) continue;
          if (!oldH.sleeping && h.sleeping)                                         { sound.playSleep();  handled = true; break outer; }
          if (oldH.sleeping && !h.sleeping)                                         { sound.playWake();   handled = true; break outer; }
          if (JSON.stringify(oldH.attachments) !== JSON.stringify(h.attachments))   { sound.playAttach(); handled = true; break outer; }
        }
      }
      if (!handled) sound.playCard();
    } else if (action.type === 'DISCARD_CARD' || action.type === 'DISCARD_ALL_DRAW') {
      sound.playDiscard();
    }
  });

  renderer      = new Renderer(engine);
  recordManager = new RecordManager(engine);
  recordViewer  = new RecordViewer(recordManager);

  myPlayerId = 'p1';
  renderer.setMyPlayer(myPlayerId);

  for (const p of _config.playerSetup) {
    if (p.type === 'ai') new AiPlayer(p.id, engine);
  }

  if (_gameMode === 'passplay') {
    let firstTurn = true;
    engine.on('turnStart', ({ playerId }) => {
      const state = engine.getState();
      if (!state || state.phase !== 'playing') return;
      if (firstTurn && playerId === 'p1') { firstTurn = false; return; }
      firstTurn = false;
      showPassScreen(state.players[playerId]?.name, playerId);
    });
  }

  engine.startGame(_config);
  window.game = engine;

  renderTournamentInfo();
  document.getElementById('round-over-overlay').style.display = 'none';
  document.getElementById('game-over-overlay').style.display  = 'none';
  showView('view-game');
}

function renderTournamentInfo() {
  const el = document.getElementById('tournament-info');
  if (!el) return;
  if (!tournament) { el.innerHTML = ''; return; }

  const ts = tournament.getState();
  if (!ts.isExpansion) {
    const parts = _config.playerSetup.map(p => `${p.name} ${ts.wins[p.id] || 0}승`).join(' / ');
    el.innerHTML = `<div class="tournament-basic">${parts}</div>`;
  } else {
    const medalIcons  = ts.medals.map(v  => `<span class="t-item t-item--medal">${v}</span>`).join('');
    const pillowIcons = ts.pillows.map(v => `<span class="t-item t-item--pillow">${v}</span>`).join('');
    const scores = _config.playerSetup.map(p => `${p.name}:${ts.scores[p.id] || 0}pt`).join(' / ');
    el.innerHTML = `
      <div class="tournament-exp">
        <div class="t-pools">🏅${medalIcons} 🛌${pillowIcons}</div>
        <div class="t-scores">${scores}</div>
      </div>`;
  }
}

function showRoundOverlay(winnerId, result) {
  const state      = engine.getState();
  const winnerName = state.players[winnerId]?.name ?? winnerId;
  const ts         = tournament.getState();
  const overlay    = document.getElementById('round-over-overlay');
  if (!overlay) return;

  overlay.querySelector('.round-over__title').textContent = `🎉 ${winnerName} 라운드 승리!`;

  const awardEl = overlay.querySelector('.round-over__award');
  if (result.awardedItem) {
    const emoji = result.awardedItem.type === 'medal' ? '🏅' : '🛌';
    const label = result.awardedItem.type === 'medal' ? '메달' : '베개';
    awardEl.textContent = `${emoji} ${result.awardedItem.value}점 ${label} 획득!`;
  } else {
    awardEl.textContent = '';
  }

  overlay.querySelector('.round-over__scores').innerHTML = _buildScoresHTML(ts);
  document.getElementById('btn-next-round').style.display    = '';
  document.getElementById('btn-end-tournament').style.display = 'none';
  overlay.style.display = 'flex';
}

function showTournamentEndOverlay(winners) {
  const state      = engine.getState();
  const ts         = tournament.getState();
  const names      = winners.map(id => state.players[id]?.name ?? id).join(', ');
  const overlay    = document.getElementById('round-over-overlay');
  if (!overlay) return;

  overlay.querySelector('.round-over__title').textContent  = `🏆 토너먼트 종료!`;
  overlay.querySelector('.round-over__award').textContent  = `${names} 최종 우승!`;
  overlay.querySelector('.round-over__scores').innerHTML   = _buildScoresHTML(ts);
  document.getElementById('btn-next-round').style.display    = 'none';
  document.getElementById('btn-end-tournament').style.display = '';
  overlay.style.display = 'flex';
}

function _buildScoresHTML(ts) {
  return _config.playerSetup.map(p => {
    if (ts.isExpansion) {
      const score   = ts.scores[p.id] || 0;
      const itemStr = (ts.items[p.id] || [])
        .map(i => i.type === 'medal' ? `🏅${i.value}` : `🛌${i.value}`)
        .join(' ');
      return `<div>${p.name}: ${score}점  ${itemStr}</div>`;
    }
    return `<div>${p.name}: ${ts.wins[p.id] || 0}승</div>`;
  }).join('');
}

function showPassScreen(playerName, playerId) {
  const el = document.getElementById('pass-player-name');
  if (el) el.textContent = playerName;
  showView('view-pass-screen');

  document.getElementById('btn-pass-ready')?.addEventListener('click', () => {
    myPlayerId = playerId;
    renderer.setMyPlayer(myPlayerId);
    renderer._renderHand(engine.getState());
    renderer._updateTurnIndicator(engine.getState());
    showView('view-game');
  }, { once: true });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

init();
