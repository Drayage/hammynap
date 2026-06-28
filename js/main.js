// All dependencies loaded as globals via ordered <script> tags in index.html

const VIEWS = ['view-lobby', 'view-game', 'view-pass-screen'];
const SESSION_KEY     = 'hammynap_session';
const SESSION_MAX_MS  = 30 * 60 * 1000;  // 30분

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
let _remoteTournamentState = null;

function init() {
  sound = new SoundManager();
  showView('view-lobby');
  setupLobby();
  setupAdvancedToggle();
  setupGameButtons();
  setupOnlineButtons();
  checkSavedSession();
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

function _updateHumanGuestsOptions() {
  const playerCount   = parseInt(document.getElementById('online-player-count')?.value ?? '2');
  const guestsSel     = document.getElementById('online-human-guests');
  if (!guestsSel) return;
  const prevVal       = parseInt(guestsSel.value ?? '1');
  const maxGuests     = playerCount - 1;
  guestsSel.innerHTML = '';
  for (let i = 1; i <= maxGuests; i++) {
    const opt   = document.createElement('option');
    opt.value   = i;
    opt.textContent = `${i}명`;
    guestsSel.appendChild(opt);
  }
  guestsSel.value = Math.min(prevVal, maxGuests);
}

function setupOnlineButtons() {
  // 방 만들기: 설정 패널 표시
  document.getElementById('btn-create-room')?.addEventListener('click', () => {
    _updateHumanGuestsOptions();
    document.getElementById('online-buttons').style.display     = 'none';
    document.getElementById('online-setup-panel').style.display = '';
  });

  // 총 인원 변경 시 사람 게스트 수 옵션 갱신
  document.getElementById('online-player-count')?.addEventListener('change', _updateHumanGuestsOptions);

  // 방 설정 패널의 "방 열기"
  document.getElementById('btn-open-room')?.addEventListener('click', () => createOnlineRoom());

  // 방 설정 패널의 "취소"
  document.getElementById('btn-cancel-setup')?.addEventListener('click', () => {
    document.getElementById('online-setup-panel').style.display = 'none';
    document.getElementById('online-buttons').style.display     = '';
  });

  document.getElementById('btn-show-join')?.addEventListener('click', () => {
    document.getElementById('online-buttons').style.display    = 'none';
    document.getElementById('online-join-panel').style.display = '';
    document.getElementById('room-code-input').focus();
  });

  document.getElementById('btn-cancel-room')?.addEventListener('click', () => {
    sync?.cancelRoom();
    sync = null;
    document.getElementById('online-waiting').style.display      = 'none';
    document.getElementById('online-setup-panel').style.display  = 'none';
    document.getElementById('online-buttons').style.display      = '';
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
    e.target.value = e.target.value.toUpperCase();
  });
}

function buildOnlineConfig() {
  const playerCount  = parseInt(document.getElementById('online-player-count')?.value ?? '2');
  const humanGuests  = Math.min(
    parseInt(document.getElementById('online-human-guests')?.value ?? '1'),
    playerCount - 1
  );
  const expansion    = document.getElementById('online-expansion')?.checked ?? false;
  const isSingle     = document.getElementById('online-single')?.checked ?? false;
  const rawHamsters  = parseInt(document.getElementById('online-hamsters')?.value ?? '0');
  const hamsterCount = rawHamsters || (expansion ? 3 : (HAMSTER_COUNT_BY_PLAYERS[playerCount] ?? 3));
  const gameMode     = expansion ? 'expansion' : 'basic';

  // p1=호스트(인간), p2~p(1+humanGuests)=인간 게스트, 나머지=AI
  const playerSetup = [{ id: 'p1', type: 'human', name: '호스트' }];
  for (let i = 2; i <= 1 + humanGuests; i++) {
    playerSetup.push({ id: `p${i}`, type: 'human', name: `게스트 ${i - 1}` });
  }
  for (let i = 2 + humanGuests; i <= playerCount; i++) {
    playerSetup.push({ id: `p${i}`, type: 'ai', name: `AI ${i - 1 - humanGuests}` });
  }

  return { mode: gameMode, playerSetup, hamsterCount, isSingle };
}

async function createOnlineRoom() {
  _gameMode = 'online';
  _config   = buildOnlineConfig();
  const isSingle = _config.isSingle;
  _remoteTournamentState = null;

  tournament = isSingle ? null
    : new TournamentManager(_config.playerSetup, _config.mode.includes('expansion'));

  engine        = new GameEngine();
  renderer      = new Renderer(engine);
  recordManager = new RecordManager(engine);
  recordViewer  = new RecordViewer(recordManager);
  myPlayerId    = 'p1';
  renderer.setMyPlayer(myPlayerId);

  // AI 등록
  for (const p of _config.playerSetup) {
    if (p.type === 'ai') new AiPlayer(p.id, engine);
  }

  if (tournament) {
    engine.on('gameOver', ({ winner }) => {
      renderer.suppressGameOver();
      const finalState = engine.getState();
      const result     = tournament.recordWin(winner, finalState);
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

  sync = new FirebaseSync();
  sync.setTournamentManager(tournament);

  let roomCode;
  try {
    roomCode = await sync.createRoom(engine, _config);
  } catch (err) {
    alert('방 생성 실패: ' + err.message);
    document.getElementById('online-setup-panel').style.display = 'none';
    document.getElementById('online-buttons').style.display     = '';
    return;
  }

  // 방 설정 패널 숨기고 대기 UI 표시
  const humanGuestCount = _config.playerSetup.filter(p => p.type === 'human' && p.id !== 'p1').length;
  document.getElementById('online-setup-panel').style.display = 'none';
  document.getElementById('room-code-value').textContent      = roomCode;
  document.getElementById('online-status-text').textContent   =
    humanGuestCount > 1 ? `게스트 0/${humanGuestCount} 참가 대기 중…` : '상대방 참가 대기 중…';
  document.getElementById('online-status-text').className     = 'online-status-text';
  document.getElementById('online-buttons').style.display     = 'none';
  document.getElementById('online-waiting').style.display     = '';

  // 게스트 참가 대기 → 게임 시작
  sync.onStatusChange(status => {
    const statusEl = document.getElementById('online-status-text');
    if (status.startsWith('partial_join:')) {
      const [, filled, total] = status.split(':');
      if (statusEl) statusEl.textContent = `게스트 ${filled}/${total} 참가 대기 중…`;
      return;
    }
    if (status !== 'guest_joined') return;

    if (statusEl) {
      statusEl.textContent = humanGuestCount > 1 ? '모든 게스트 참가! 게임 시작 중…' : '게스트 참가! 게임 시작 중…';
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
      _saveOnlineHostSession(roomCode, _config);
      document.getElementById('round-over-overlay').style.display = 'none';
      document.getElementById('game-over-overlay').style.display  = 'none';
      showView('view-game');
    }, 600);
  });
}

async function joinOnlineGame() {
  const input   = document.getElementById('room-code-input');
  const errorEl = document.getElementById('join-error');
  const roomId  = (input?.value ?? '').toUpperCase().trim();

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
  _remoteTournamentState = null;
  tournament = null;

  engine        = new GameEngine();
  renderer      = new Renderer(engine);
  recordManager = new RecordManager(engine);
  recordViewer  = new RecordViewer(recordManager);

  sync = new FirebaseSync();
  sync.onTournamentUpdate(ts => {
    _remoteTournamentState = ts;
    renderTournamentInfo();
  });

  try {
    await sync.joinRoom(roomId, engine);
  } catch (err) {
    _showJoinError(err.message);
    document.getElementById('btn-join-confirm').disabled = false;
    return;
  }

  myPlayerId = sync._mySlot;
  renderer.setMyPlayer(myPlayerId);

  // 게임 오버 처리 (토너먼트 여부는 서버로부터 수신)
  engine.on('gameOver', ({ winner }) => {
    sound.playWin();
    if (_remoteTournamentState) {
      renderer.suppressGameOver();
      _showGuestRoundOverlay(winner);
    }
  });

  _wrapEngineForGuest(engine, sync);
  _attachSoundHooks(engine);

  document.getElementById('btn-join-confirm').disabled      = false;
  document.getElementById('online-join-panel').style.display = 'none';
  document.getElementById('online-buttons').style.display    = '';

  sound.startBgm();
  window.game = engine;
  renderTournamentInfo();
  _saveOnlineGuestSession(roomId);
  document.getElementById('round-over-overlay').style.display = 'none';
  document.getElementById('game-over-overlay').style.display  = 'none';
  showView('view-game');
}

// 게스트 엔진 메서드를 Firebase 전송 + 낙관적 UI 업데이트로 대체
function _wrapEngineForGuest(eng, s) {
  eng.playCard = (playerId, cardId, targetPlayerId, targetHamsterId) => {
    const state = eng.getState();
    if (!state) return { ok: false };
    const action = { type: 'PLAY_CARD', playerId, cardId, targetPlayerId, targetHamsterId };
    const check  = validatePlay(state, action);
    if (!check.valid) {
      eng.emit('invalidAction', { reason: check.reason });
      return { ok: false, reason: check.reason };
    }
    // 낙관적 업데이트: 카드를 즉시 손패에서 제거 (UI 반응성↑)
    _applyOptimisticCardRemoval(eng, state, action);
    s.sendAction({ type: 'PLAY_CARD', playerId, cardId, targetPlayerId, targetHamsterId });
    return { ok: true };
  };

  eng.discardCard = (playerId, cardId) => {
    const state = eng.getState();
    if (!state) return { ok: false };
    if (!state.players[playerId]?.hand.includes(cardId)) return { ok: false };
    const action = { type: 'DISCARD_CARD', playerId, cardId };
    _applyOptimisticCardRemoval(eng, state, action);
    s.sendAction({ type: 'DISCARD_CARD', playerId, cardId });
    return { ok: true };
  };

  eng.discardAllAndDraw = (playerId) => {
    const state = eng.getState();
    if (!state) return { ok: false };
    const action = { type: 'DISCARD_ALL_DRAW', playerId };
    const prev   = state;
    const optimistic = {
      ...state,
      players: {
        ...state.players,
        [playerId]: { ...state.players[playerId], hand: [] }
      }
    };
    eng._state = optimistic;
    eng.emit('stateChanged', { prev, next: optimistic, action });
    s.sendAction({ type: 'DISCARD_ALL_DRAW', playerId });
    return { ok: true };
  };

  eng.surrender = (playerId) => {
    s.sendAction({ type: 'SURRENDER', playerId });
    return { ok: true };
  };
}

function _applyOptimisticCardRemoval(eng, state, action) {
  const { playerId, cardId } = action;
  const hand    = state.players[playerId]?.hand ?? [];
  const idx     = hand.indexOf(cardId);
  if (idx === -1) return;
  const newHand = [...hand.slice(0, idx), ...hand.slice(idx + 1)];
  const optimistic = {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...state.players[playerId], hand: newHand }
    }
  };
  eng._state = optimistic;
  eng.emit('stateChanged', { prev: state, next: optimistic, action });
}

function _showJoinError(msg) {
  const el = document.getElementById('join-error');
  if (!el) return;
  el.textContent   = msg;
  el.style.display = '';
}

// ---- 게스트 라운드 오버 오버레이 (온라인 토너먼트) ----
function _showGuestRoundOverlay(winner) {
  const state      = engine.getState();
  const winnerName = state?.players[winner]?.name ?? winner;
  const ts         = _remoteTournamentState;
  const overlay    = document.getElementById('round-over-overlay');
  if (!overlay) return;

  overlay.querySelector('.round-over__title').textContent = `🎉 ${winnerName} 라운드 승리!`;
  overlay.querySelector('.round-over__award').textContent = '';
  overlay.querySelector('.round-over__scores').innerHTML  = ts ? _buildRemoteTournamentScores(ts) : '';

  // 게스트는 버튼 대신 대기 메시지 표시
  document.getElementById('btn-next-round').style.display    = 'none';
  document.getElementById('btn-end-tournament').style.display = 'none';
  const actionsEl = overlay.querySelector('.round-over__actions');
  let waitMsg = actionsEl.querySelector('.guest-wait-msg');
  if (!waitMsg) {
    waitMsg = document.createElement('p');
    waitMsg.className = 'guest-wait-msg';
    actionsEl.prepend(waitMsg);
  }

  if (ts?.isOver) {
    waitMsg.textContent = '토너먼트가 종료되었습니다!';
    document.getElementById('btn-round-to-lobby').style.display = '';
  } else {
    waitMsg.textContent = '호스트가 다음 라운드를 시작하면 자동으로 시작됩니다…';
    document.getElementById('btn-round-to-lobby').style.display = '';
  }
  overlay.style.display = 'flex';
}

function _buildRemoteTournamentScores(ts) {
  if (!ts || !_config) return '';
  return (_config.playerSetup || []).map(p => {
    if (ts.isExpansion) {
      const score   = ts.scores?.[p.id] || 0;
      const itemStr = (ts.items?.[p.id] || [])
        .map(i => i.type === 'medal' ? `🏅${i.value}` : `🛌${i.value}`)
        .join(' ');
      return `<div>${p.name}: ${score}점  ${itemStr}</div>`;
    }
    return `<div>${p.name}: ${ts.wins?.[p.id] || 0}승</div>`;
  }).join('');
}

// ---- 사운드 훅 ----
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

// ---- 게임 버튼 설정 ----
function setupGameButtons() {
  document.getElementById('btn-mute')?.addEventListener('click', () => {
    const muted = sound.toggleMute();
    const btn   = document.getElementById('btn-mute');
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
    sync?.disconnect();
    sync = null;
    _clearSession();
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
    _clearSession();
    showView('view-lobby');
  });

  document.getElementById('btn-round-to-lobby')?.addEventListener('click', () => {
    document.getElementById('round-over-overlay').style.display = 'none';
    sound.stopBgm();
    sync?.disconnect();
    sync = null;
    _clearSession();
    showView('view-lobby');
  });
}

// ---- 로컬 게임 시작 ----
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
  _gameMode  = mode;
  _config    = buildConfig(mode);
  _remoteTournamentState = null;

  const isExpansion = _config.mode.includes('expansion');
  const isSingle    = document.getElementById('setting-single')?.checked ?? false;

  tournament = isSingle ? null : new TournamentManager(_config.playerSetup, isExpansion);

  sound.startBgm();
  startRound();
}

function startRound() {
  engine = new GameEngine();

  if (tournament) {
    engine.on('gameOver', ({ winner }) => {
      renderer.suppressGameOver();
      const finalState = engine.getState();
      const result     = tournament.recordWin(winner, finalState);
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

  _attachSoundHooks(engine);

  renderer      = new Renderer(engine);
  recordManager = new RecordManager(engine);
  recordViewer  = new RecordViewer(recordManager);

  // 온라인 호스트: 새 라운드에 sync 엔진 교체
  if (_gameMode === 'online' && sync) {
    sync.attachNewRound(engine);
    if (tournament) sync.setTournamentManager(tournament);
  }

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

  // 로컬 게임 자동 저장 (passplay 제외)
  if (_gameMode !== 'online' && _gameMode !== 'online-guest') {
    _attachLocalSessionSave(engine, _gameMode, _config);
  }

  renderTournamentInfo();
  document.getElementById('round-over-overlay').style.display = 'none';
  document.getElementById('game-over-overlay').style.display  = 'none';
  showView('view-game');
}

// ---- 토너먼트 정보 렌더링 ----
function renderTournamentInfo() {
  const el = document.getElementById('tournament-info');
  if (!el) return;

  // 게스트는 서버에서 받은 토너먼트 상태 사용
  const ts = tournament ? tournament.getState() : _remoteTournamentState;
  if (!ts) { el.innerHTML = ''; return; }

  if (!ts.isExpansion) {
    const parts = (_config?.playerSetup ?? []).map(p => `${p.name} ${ts.wins?.[p.id] || 0}승`).join(' / ');
    el.innerHTML = `<div class="tournament-basic">${parts}</div>`;
  } else {
    const medalIcons  = (ts.medals  ?? []).map(v => `<span class="t-item t-item--medal">${v}</span>`).join('');
    const pillowIcons = (ts.pillows ?? []).map(v => `<span class="t-item t-item--pillow">${v}</span>`).join('');
    const scores = (_config?.playerSetup ?? []).map(p => `${p.name}:${ts.scores?.[p.id] || 0}pt`).join(' / ');
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

  const waitMsg = overlay.querySelector('.guest-wait-msg');
  if (waitMsg) waitMsg.remove();
  document.getElementById('btn-next-round').style.display    = '';
  document.getElementById('btn-end-tournament').style.display = 'none';
  document.getElementById('btn-round-to-lobby').style.display = '';
  overlay.style.display = 'flex';
}

function showTournamentEndOverlay(winners) {
  const state      = engine.getState();
  const ts         = tournament.getState();
  const names      = winners.map(id => state.players[id]?.name ?? id).join(', ');
  const overlay    = document.getElementById('round-over-overlay');
  if (!overlay) return;

  overlay.querySelector('.round-over__title').textContent = `🏆 토너먼트 종료!`;
  overlay.querySelector('.round-over__award').textContent = `${names} 최종 우승!`;
  overlay.querySelector('.round-over__scores').innerHTML  = _buildScoresHTML(ts);

  const waitMsg = overlay.querySelector('.guest-wait-msg');
  if (waitMsg) waitMsg.remove();
  document.getElementById('btn-next-round').style.display    = 'none';
  document.getElementById('btn-end-tournament').style.display = '';
  document.getElementById('btn-round-to-lobby').style.display = '';
  overlay.style.display = 'flex';
}

function _buildScoresHTML(ts) {
  return (_config.playerSetup ?? []).map(p => {
    if (ts.isExpansion) {
      const score   = ts.scores?.[p.id] || 0;
      const itemStr = (ts.items?.[p.id] || [])
        .map(i => i.type === 'medal' ? `🏅${i.value}` : `🛌${i.value}`)
        .join(' ');
      return `<div>${p.name}: ${score}점  ${itemStr}</div>`;
    }
    return `<div>${p.name}: ${ts.wins?.[p.id] || 0}승</div>`;
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

// ---- 세션 저장/복원 ----

function _saveOnlineHostSession(roomCode, config) {
  _saveSession({ type: 'online-host', roomId: roomCode, config });
}

function _saveOnlineGuestSession(roomId) {
  _saveSession({ type: 'online-guest', roomId });
}

function _attachLocalSessionSave(eng, gameMode, config) {
  eng.on('stateChanged', ({ next }) => {
    if (!next) return;
    if (next.phase === 'ended') {
      _clearSession();
      return;
    }
    const ts = tournament ? tournament.getState() : null;
    _saveSession({
      type:           'local',
      gameMode,
      config,
      state:          next,
      myPlayerId:     'p1',
      tournamentState: ts
    });
  });
}

function _saveSession(data) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch (e) {}
}

function _loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.savedAt || Date.now() - data.savedAt > SESSION_MAX_MS) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return data;
  } catch (e) { return null; }
}

function _clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function checkSavedSession() {
  const session = _loadSession();
  if (!session) return;

  const banner  = document.getElementById('session-restore-banner');
  if (!banner) return;

  const minutesAgo = Math.round((Date.now() - session.savedAt) / 60000);
  let desc = '';
  if (session.type === 'local')         desc = `로컬 게임 (${minutesAgo}분 전)`;
  else if (session.type === 'online-host')  desc = `내가 만든 방 ${session.roomId} (${minutesAgo}분 전)`;
  else if (session.type === 'online-guest') desc = `온라인 방 ${session.roomId} (${minutesAgo}분 전)`;

  banner.querySelector('.session-restore-text').textContent = `이전 게임: ${desc}`;
  banner.style.display = '';

  document.getElementById('btn-restore-session')?.addEventListener('click', () => {
    banner.style.display = 'none';
    restoreSession(session);
  }, { once: true });

  document.getElementById('btn-dismiss-restore')?.addEventListener('click', () => {
    banner.style.display = 'none';
    _clearSession();
  }, { once: true });
}

async function restoreSession(session) {
  if (session.type === 'local') {
    restoreLocalSession(session);
  } else if (session.type === 'online-guest') {
    const input = document.getElementById('room-code-input');
    if (input) input.value = session.roomId;
    document.getElementById('online-join-panel').style.display = '';
    document.getElementById('online-buttons').style.display    = 'none';
    await joinOnlineGame();
  } else if (session.type === 'online-host') {
    await restoreOnlineHostSession(session);
  }
}

function restoreLocalSession(session) {
  _gameMode = session.gameMode;
  _config   = session.config;
  _remoteTournamentState = null;

  const isExpansion = _config.mode.includes('expansion');
  tournament = session.tournamentState
    ? _restoreTournamentManager(session.tournamentState, _config.playerSetup, isExpansion)
    : null;

  engine = new GameEngine();

  if (tournament) {
    engine.on('gameOver', ({ winner }) => {
      renderer.suppressGameOver();
      const finalState = engine.getState();
      const result     = tournament.recordWin(winner, finalState);
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

  _attachSoundHooks(engine);

  renderer      = new Renderer(engine);
  recordManager = new RecordManager(engine);
  recordViewer  = new RecordViewer(recordManager);

  myPlayerId = session.myPlayerId ?? 'p1';
  renderer.setMyPlayer(myPlayerId);

  for (const p of _config.playerSetup) {
    if (p.type === 'ai') new AiPlayer(p.id, engine);
  }

  // 상태 직접 주입 (startGame 대신)
  engine._state = session.state;
  engine.emit('stateChanged', { prev: null, next: session.state, action: null });

  // AI 턴이면 turnStart 발화
  const currentPlayer = session.state.currentPlayer;
  const playerDef     = _config.playerSetup.find(p => p.id === currentPlayer);
  if (playerDef?.type === 'ai') {
    engine.emit('turnStart', { playerId: currentPlayer });
  }

  window.game = engine;
  renderTournamentInfo();
  _attachLocalSessionSave(engine, _gameMode, _config);
  document.getElementById('round-over-overlay').style.display = 'none';
  document.getElementById('game-over-overlay').style.display  = 'none';
  sound.startBgm();
  showView('view-game');
}

async function restoreOnlineHostSession(session) {
  _gameMode = 'online';
  _config   = session.config;
  _remoteTournamentState = null;

  const isSingle    = _config.isSingle;
  const isExpansion = _config.mode.includes('expansion');
  tournament = isSingle ? null : new TournamentManager(_config.playerSetup, isExpansion);

  engine        = new GameEngine();
  renderer      = new Renderer(engine);
  recordManager = new RecordManager(engine);
  recordViewer  = new RecordViewer(recordManager);
  myPlayerId    = 'p1';
  renderer.setMyPlayer(myPlayerId);

  if (tournament) {
    engine.on('gameOver', ({ winner }) => {
      renderer.suppressGameOver();
      const finalState = engine.getState();
      const result     = tournament.recordWin(winner, finalState);
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

  for (const p of _config.playerSetup) {
    if (p.type === 'ai') new AiPlayer(p.id, engine);
  }

  sync = new FirebaseSync();
  sync.setTournamentManager(tournament);
  _attachSoundHooks(engine);

  let savedState;
  try {
    savedState = await sync.rejoinAsHost(session.roomId, engine, _config);
  } catch (err) {
    alert('재접속 실패: ' + err.message);
    _clearSession();
    return;
  }

  // Firebase 상태 주입
  engine._state = savedState;
  engine.emit('stateChanged', { prev: null, next: savedState, action: null });

  const currentPlayer = savedState.currentPlayer;
  const playerDef     = _config.playerSetup.find(p => p.id === currentPlayer);
  if (playerDef?.type === 'ai') {
    engine.emit('turnStart', { playerId: currentPlayer });
  }

  window.game = engine;
  renderTournamentInfo();
  _saveOnlineHostSession(session.roomId, _config);
  document.getElementById('round-over-overlay').style.display = 'none';
  document.getElementById('game-over-overlay').style.display  = 'none';
  sound.startBgm();
  showView('view-game');
}

function _restoreTournamentManager(ts, playerSetup, isExpansion) {
  const tm       = new TournamentManager(playerSetup, isExpansion);
  tm._roundNumber = ts.roundNumber ?? 0;
  if (isExpansion) {
    tm._medals  = ts.medals  ?? [];
    tm._pillows = ts.pillows ?? [];
    tm._scores  = ts.scores  ?? {};
    tm._items   = ts.items   ?? {};
  } else {
    tm._wins = ts.wins ?? {};
  }
  return tm;
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

init();
