// All dependencies loaded as globals via ordered <script> tags in index.html

const VIEWS = ['view-lobby', 'view-game', 'view-pass-screen'];

function showView(id) {
  VIEWS.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = v === id ? '' : 'none';
  });
}

let engine, renderer, recordManager, recordViewer;
let sound, tournament, sync;
let _gameMode, _config;
let myPlayerId = 'p1';

function init() {
  sound = new SoundManager();
  showView('view-lobby');
  setupLobby();
  setupAdvancedToggle();
  setupGameButtons();
  setupOnlineButtons();
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

function setupOnlineButtons() {
  // 방 만들기 / 방 참가 토글
  document.getElementById('btn-create-room')?.addEventListener('click', () => createOnlineRoom());
  document.getElementById('btn-show-join')?.addEventListener('click', () => {
    document.getElementById('online-buttons').style.display    = 'none';
    document.getElementById('online-join-panel').style.display = '';
    document.getElementById('room-code-input').focus();
  });

  document.getElementById('btn-cancel-room')?.addEventListener('click', () => {
    sync?.disconnect();
    sync = null;
    document.getElementById('online-waiting').style.display = 'none';
    document.getElementById('online-buttons').style.display = '';
  });

  document.getElementById('btn-cancel-join')?.addEventListener('click', () => {
    document.getElementById('online-join-panel').style.display = 'none';
    document.getElementById('join-error').style.display        = 'none';
    document.getElementById('online-buttons').style.display    = '';
  });

  document.getElementById('btn-copy-code')?.addEventListener('click', () => {
    const code = document.getElementById('room-code-value')?.textContent;
    if (code) navigator.clipboard?.writeText(code).catch(() => {});
  });

  document.getElementById('btn-join-confirm')?.addEventListener('click', () => joinOnlineGame());
  document.getElementById('room-code-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') joinOnlineGame();
    // uppercase automatically
    e.target.value = e.target.value.toUpperCase();
  });
}

function buildOnlineConfig() {
  const playerCount  = parseInt(document.getElementById('setting-players')?.value ?? '2');
  const expansion    = document.getElementById('setting-expansion')?.checked ?? false;
  const hamsterCount = parseInt(document.getElementById('setting-hamsters')?.value ?? '0') ||
                       (expansion ? 3 : (HAMSTER_COUNT_BY_PLAYERS[playerCount] ?? 3));
  const gameMode     = expansion ? 'expansion' : 'basic';
  // realtime 모드는 온라인에서 미지원 (동시 쓰기 충돌)

  // p1=호스트, p2=게스트(human), p3~=AI
  const playerSetup = [
    { id: 'p1', type: 'human', name: '호스트' },
    { id: 'p2', type: 'human', name: '게스트' },
  ];
  for (let i = 3; i <= playerCount; i++) {
    playerSetup.push({ id: `p${i}`, type: 'ai', name: `AI ${i - 2}` });
  }

  return { mode: gameMode, playerSetup, hamsterCount };
}

async function createOnlineRoom() {
  _gameMode = 'online';
  _config   = buildOnlineConfig();
  tournament = null;

  // 엔진 + 렌더러 생성 (game start는 게스트 참가 후)
  engine        = new GameEngine();
  renderer      = new Renderer(engine);
  recordManager = new RecordManager(engine);
  recordViewer  = new RecordViewer(recordManager);
  myPlayerId    = 'p1';
  renderer.setMyPlayer(myPlayerId);

  // AI 등록 (호스트 엔진에서 실행)
  for (const p of _config.playerSetup) {
    if (p.type === 'ai') new AiPlayer(p.id, engine);
  }

  engine.on('gameOver', () => sound.playWin());

  // Firebase 방 생성
  sync = new FirebaseSync();
  let roomCode;
  try {
    roomCode = await sync.createRoom(engine, _config);
  } catch (err) {
    alert('방 생성 실패: ' + err.message);
    return;
  }

  // 대기 UI 표시
  document.getElementById('room-code-value').textContent     = roomCode;
  document.getElementById('online-status-text').textContent  = '상대방 참가 대기 중…';
  document.getElementById('online-buttons').style.display    = 'none';
  document.getElementById('online-waiting').style.display    = '';

  // 게스트 참가 대기
  sync.onStatusChange(status => {
    if (status !== 'guest_joined') return;

    const statusEl = document.getElementById('online-status-text');
    if (statusEl) {
      statusEl.textContent = '게스트 참가! 게임 시작 중…';
      statusEl.className   = 'online-status-text online-status-text--connected';
    }

    setTimeout(() => {
      document.getElementById('online-waiting').style.display = 'none';
      document.getElementById('online-buttons').style.display = '';

      _attachSoundHooks(engine);
      engine.startGame(_config);
      sound.startBgm();
      window.game = engine;
      renderTournamentInfo();
      showView('view-game');
    }, 600);
  });
}

async function joinOnlineGame() {
  const input = document.getElementById('room-code-input');
  const errorEl = document.getElementById('join-error');
  const roomId = (input?.value ?? '').toUpperCase().trim();

  if (roomId.length < 5) {
    _showJoinError('방 코드는 5자리입니다.');
    return;
  }

  errorEl.style.display = 'none';
  document.getElementById('btn-join-confirm').disabled = true;

  let meta;
  try {
    const tempSync = new FirebaseSync();
    meta = await tempSync.fetchRoomMeta(roomId);
    tempSync.disconnect();
  } catch (err) {
    _showJoinError(err.message);
    document.getElementById('btn-join-confirm').disabled = false;
    return;
  }

  _gameMode = 'online-guest';
  _config   = meta.config;
  tournament = null;

  // 게스트 엔진 + 렌더러 생성
  engine        = new GameEngine();
  renderer      = new Renderer(engine);
  recordManager = new RecordManager(engine);
  recordViewer  = new RecordViewer(recordManager);
  myPlayerId    = 'p2';
  renderer.setMyPlayer(myPlayerId);

  // 게스트 엔진 액션을 Firebase로 중계
  sync = new FirebaseSync();
  _wrapEngineForGuest(engine, sync);

  engine.on('gameOver', () => sound.playWin());
  _attachSoundHooks(engine);

  // 방 참가 (Firebase 상태 구독 시작)
  try {
    await sync.joinRoom(roomId, engine);
  } catch (err) {
    _showJoinError(err.message);
    document.getElementById('btn-join-confirm').disabled = false;
    return;
  }

  document.getElementById('btn-join-confirm').disabled = false;
  document.getElementById('online-join-panel').style.display = 'none';
  document.getElementById('online-buttons').style.display    = '';

  sound.startBgm();
  window.game = engine;
  renderTournamentInfo();
  showView('view-game');
}

// 게스트 엔진 메서드를 Firebase 전송으로 대체
function _wrapEngineForGuest(eng, s) {
  eng.playCard = (playerId, cardId, targetPlayerId, targetHamsterId) => {
    const state = eng.getState();
    if (!state) return { ok: false };
    const check = validatePlay(state, { type: 'PLAY_CARD', playerId, cardId, targetPlayerId, targetHamsterId });
    if (!check.valid) {
      eng.emit('invalidAction', { reason: check.reason });
      return { ok: false, reason: check.reason };
    }
    s.sendAction({ type: 'PLAY_CARD', playerId, cardId, targetPlayerId, targetHamsterId });
    return { ok: true };
  };

  eng.discardCard = (playerId, cardId) => {
    s.sendAction({ type: 'DISCARD_CARD', playerId, cardId });
    return { ok: true };
  };

  eng.discardAllAndDraw = (playerId) => {
    s.sendAction({ type: 'DISCARD_ALL_DRAW', playerId });
    return { ok: true };
  };

  eng.surrender = (playerId) => {
    s.sendAction({ type: 'SURRENDER', playerId });
    return { ok: true };
  };
}

function _showJoinError(msg) {
  const el = document.getElementById('join-error');
  if (!el) return;
  el.textContent    = msg;
  el.style.display  = '';
}

// 사운드 훅 (startRound / online 공통)
function _attachSoundHooks(eng) {
  eng.on('stateChanged', ({ prev, next, action }) => {
    if (!prev || !action) return;
    if (action.type === 'PLAY_CARD') {
      let handled = false;
      outer: for (const [pid, player] of Object.entries(next.players)) {
        for (const h of player.hamsters) {
          const oldH = prev.players[pid]?.hamsters.find(oh => oh.id === h.id);
          if (!oldH) continue;
          if (!oldH.sleeping && h.sleeping)                                        { sound.playSleep();  handled = true; break outer; }
          if (oldH.sleeping && !h.sleeping)                                        { sound.playWake();   handled = true; break outer; }
          if (JSON.stringify(oldH.attachments) !== JSON.stringify(h.attachments))  { sound.playAttach(); handled = true; break outer; }
        }
      }
      if (!handled) sound.playCard();
    } else if (action.type === 'DISCARD_CARD' || action.type === 'DISCARD_ALL_DRAW') {
      sound.playDiscard();
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
  _attachSoundHooks(engine);

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
