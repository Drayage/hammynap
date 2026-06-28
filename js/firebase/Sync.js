// Firebase Realtime Database sync
// 호스트: 권위있는 GameEngine 실행 + state를 Firebase에 push
// 게스트: Firebase state를 받아서 렌더만, 액션은 pendingAction으로 전달

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyDnEYQRvb16iW0HZyq4bgrvtnPysDbeFBc",
  authDomain:        "frenzy-49857.firebaseapp.com",
  databaseURL:       "https://frenzy-49857-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "frenzy-49857",
  storageBucket:     "frenzy-49857.firebasestorage.app",
  messagingSenderId: "256453631137",
  appId:             "1:256453631137:web:97941738a912b64644a4e0"
};

class FirebaseSync {
  constructor() {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    this._db     = firebase.database();
    this._roomId = null;
    this._isHost = false;
    this._engine = null;
    this._statusCb = null;
    this._lastActionTs = 0;
    this._offCallbacks = [];  // Firebase listener cleanup
  }

  // ---- 방 만들기 (호스트) ----------------------------------------
  // engine은 아직 startGame() 안 된 상태. createRoom 후 게스트 참가 때 startGame.
  async createRoom(engine, config) {
    this._engine = engine;
    this._isHost = true;
    this._roomId = this._generateCode();

    const roomRef = this._db.ref(`games/${this._roomId}`);

    // 초기 메타 기록
    await roomRef.set({
      meta: {
        status:    'waiting',
        hostId:    'p1',
        config:    JSON.stringify(config),
        createdAt: Date.now()
      },
      state:         null,
      pendingAction: null
    });

    // 게스트 참가 감지
    const guestRef = roomRef.child('meta/guestId');
    const guestHandler = guestRef.on('value', snap => {
      if (snap.val() && this._statusCb) this._statusCb('guest_joined');
    });
    this._offCallbacks.push(() => guestRef.off('value', guestHandler));

    // 게스트 액션 수신 (호스트가 검증 후 적용)
    const actionRef = roomRef.child('pendingAction');
    const actionHandler = actionRef.on('value', snap => {
      const action = snap.val();
      if (!action || action.timestamp <= this._lastActionTs) return;
      this._lastActionTs = action.timestamp;
      actionRef.remove();
      this._applyGuestAction(action);
    });
    this._offCallbacks.push(() => actionRef.off('value', actionHandler));

    // 호스트의 상태 변화 → Firebase push
    engine.on('stateChanged', ({ next }) => {
      if (!this._isHost || !next || !this._roomId) return;
      this._db.ref(`games/${this._roomId}/state`).set(next);
    });

    // 호스트 접속 끊길 때 방 삭제
    roomRef.onDisconnect().remove();

    return this._roomId;
  }

  // ---- 방 메타 조회 (게스트 참가 전) ----------------------------
  async fetchRoomMeta(roomId) {
    const snap = await this._db.ref(`games/${roomId}/meta`).get();
    if (!snap.exists()) throw new Error('방을 찾을 수 없습니다. 코드를 확인해 주세요.');
    const meta = snap.val();
    if (meta.status !== 'waiting') throw new Error('이미 게임이 시작된 방입니다.');
    return { config: JSON.parse(meta.config) };
  }

  // ---- 방 참가 (게스트) ----------------------------------------
  // engine은 이미 생성+renderer 연결된 상태
  async joinRoom(roomId, engine) {
    this._engine = engine;
    this._isHost = false;
    this._roomId = roomId.toUpperCase().trim();

    // 게스트 등록
    await this._db.ref(`games/${this._roomId}/meta`).update({
      guestId: 'p2',
      status:  'playing'
    });

    // 상태 수신 → 엔진에 주입
    const stateRef = this._db.ref(`games/${this._roomId}/state`);
    const stateHandler = stateRef.on('value', snap => {
      const state = snap.val();
      if (!state || !this._engine) return;
      this._applyRemoteState(state);
    });
    this._offCallbacks.push(() => stateRef.off('value', stateHandler));
  }

  // ---- 게스트 액션 전송 ----------------------------------------
  // 엔진 메서드를 대체: 로컬 적용 대신 Firebase로 전송
  sendAction(action) {
    if (this._isHost || !this._roomId) return;
    this._db.ref(`games/${this._roomId}/pendingAction`).set({
      ...action,
      timestamp: Date.now()
    });
  }

  // ---- 콜백 등록 -----------------------------------------------
  onStatusChange(cb) { this._statusCb = cb; }

  // ---- 연결 해제 -----------------------------------------------
  disconnect() {
    this._offCallbacks.forEach(fn => fn());
    this._offCallbacks = [];
    this._roomId = null;
    this._engine = null;
  }

  // ---- 내부 ----

  _applyGuestAction(action) {
    if (!action || !this._engine) return;
    const { type, playerId, cardId, targetPlayerId, targetHamsterId } = action;
    switch (type) {
      case 'PLAY_CARD':        this._engine.playCard(playerId, cardId, targetPlayerId, targetHamsterId); break;
      case 'DISCARD_CARD':     this._engine.discardCard(playerId, cardId);    break;
      case 'DISCARD_ALL_DRAW': this._engine.discardAllAndDraw(playerId);      break;
      case 'SURRENDER':        this._engine.surrender(playerId);              break;
    }
  }

  _applyRemoteState(state) {
    if (!this._engine) return;
    const prev      = this._engine._state;
    const wasEnded  = prev?.phase === 'ended';
    this._engine._state = state;
    this._engine.emit('stateChanged', { prev, next: state, action: null });
    if (!wasEnded && state.phase === 'ended' && state.winner) {
      this._engine.emit('gameOver', { winner: state.winner });
    }
  }

  _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // I, O 제외
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }
}
