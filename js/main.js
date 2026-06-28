// HAMSTER_COUNT_BY_PLAYERS, GameEngine, AiPlayer, Renderer, RecordManager, RecordViewer
// 모두 전역 변수로 로드됨 (index.html 스크립트 태그 순서 참고)

const VIEWS = ['view-lobby', 'view-game', 'view-pass-screen'];

function showView(id) {
  VIEWS.forEach(v => {
    const el = document.getElementById(v);
    if (el) el.style.display = v === id ? '' : 'none';
  });
}

let engine, renderer, recordManager, recordViewer;
let myPlayerId = 'p1';

function init() {
  showView('view-lobby');
  setupLobby();
  setupAdvancedToggle();
}

function setupAdvancedToggle() {
  const btn = document.getElementById('advanced-toggle');
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
  const config = buildConfig(mode);

  engine        = new GameEngine();
  renderer      = new Renderer(engine);
  recordManager = new RecordManager(engine);
  recordViewer  = new RecordViewer(recordManager);

  myPlayerId = 'p1';
  renderer.setMyPlayer(myPlayerId);

  // AI 플레이어 등록
  for (const p of config.playerSetup) {
    if (p.type === 'ai') new AiPlayer(p.id, engine);
  }

  // pass-and-play: startGame() 이전에 리스너 등록 (Bug 3 수정)
  if (mode === 'passplay') {
    let firstTurn = true;
    engine.on('turnStart', ({ playerId }) => {
      const state = engine.getState();
      if (!state || state.phase !== 'playing') return;
      // 첫 번째 턴은 게임 시작과 동시에 발생 - 플레이어 1은 이미 준비됨
      if (firstTurn && playerId === 'p1') {
        firstTurn = false;
        return;
      }
      firstTurn = false;
      const playerName = state.players[playerId]?.name;
      showPassScreen(playerName, playerId);
    });
  }

  engine.startGame(config);

  // 콘솔 디버깅용
  window.game = engine;

  showView('view-game');

  document.getElementById('btn-back-to-lobby')?.addEventListener('click', () => {
    showView('view-lobby');
    document.getElementById('game-over-overlay').style.display = 'none';
  }, { once: true });
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
