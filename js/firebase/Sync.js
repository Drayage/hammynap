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
    this._db               = firebase.database();
    this._roomId           = null;
    this._isHost           = false;
    this._engine           = null;
    this._statusCb         = null;
    this._lastActionTs     = 0;
    this._processedActions = new Set(); // 클럭 스큐 대응: 타임스탬프 대신 키 기반 중복 제거
    this._offCallbacks     = [];
    this._tournamentMgr    = null;
    this._lastRemoteAction = null;
    this._onTournamentCb   = null;
    this._hostEngineOff    = null;
    this._pendingTournament = false; // tournament push를 stateChanged에 묶기 위한 플래그
  }

  setTournamentManager(tm) { this._tournamentMgr = tm; }
  onTournamentUpdate(cb)    { this._onTournamentCb = cb; }

  // ---- 방 만들기 (호스트) ----------------------------------------
  async createRoom(engine, config) {
    this._isHost = true;
    this._roomId = this._generateCode();

    // 인간 게스트 슬롯 목록 (p1 제외)
    const humanSlots = config.playerSetup
      .filter(p => p.type === 'human' && p.id !== 'p1')
      .map(p => p.id);

    const roomRef = this._db.ref(`games/${this._roomId}`);

    await roomRef.set({
      meta: {
        status:      'waiting',
        hostId:      'p1',
        config:      JSON.stringify(config),
        humanSlots:  humanSlots.length ? humanSlots : null,
        createdAt:   Date.now()
      },
      state:         null,
      lastAction:    null,
      pendingAction: null,
      tournament:    null
    });

    // 게스트 참가 감지: joinedSlots 카운트로 판단
    const joinedRef    = roomRef.child('meta/joinedSlots');
    const guestHandler = joinedRef.on('value', snap => {
      const joined      = snap.val() || {};
      const filledCount = humanSlots.filter(s => joined[s]).length;
      if (!this._statusCb) return;
      if (filledCount >= humanSlots.length) {
        this._statusCb('guest_joined');
      } else if (filledCount > 0) {
        this._statusCb(`partial_join:${filledCount}:${humanSlots.length}`);
      }
    });
    this._offCallbacks.push(() => joinedRef.off('value', guestHandler));

    // 게스트 액션 수신 (호스트가 검증 후 적용)
    const actionRef = roomRef.child('pendingAction');
    const actionHandler = actionRef.on('value', snap => {
      const action = snap.val();
      if (!action || !action.timestamp) return;
      // 클럭 스큐 대응: 타임스탬프+타입+카드 조합으로 중복 판별
      const actionKey = `${action.timestamp}:${action.type}:${action.cardId}:${action.playerId}`;
      if (this._processedActions.has(actionKey)) return;
      this._processedActions.add(actionKey);
      if (this._processedActions.size > 200) {
        const iter = this._processedActions.values();
        for (let i = 0; i < 100; i++) this._processedActions.delete(iter.next().value);
      }
      this._lastActionTs = action.timestamp;
      actionRef.remove().catch(() => {});
      this._applyGuestAction(action);
    });
    this._offCallbacks.push(() => actionRef.off('value', actionHandler));

    this._attachHostEngine(engine);

    // 비정상 접속 종료 시 방 상태만 마킹 (삭제 대신 → 재접속 가능)
    roomRef.child('meta').onDisconnect().update({ status: 'host_disconnected' });

    return this._roomId;
  }

  _attachHostEngine(engine) {
    // 이전 엔진 리스너 정리
    if (this._hostEngineOff) {
      this._hostEngineOff();
      this._hostEngineOff = null;
    }
    this._engine = engine;
    this._hostEngineOff = engine.on('stateChanged', ({ next, action }) => {
      if (!this._isHost || !next || !this._roomId) return;
      const cleanAction = action ? {
        type:            action.type            || null,
        playerId:        action.playerId        || null,
        cardId:          action.cardId          || null,
        targetPlayerId:  action.targetPlayerId  || null,
        targetHamsterId: action.targetHamsterId || null,
      } : null;
      const update = { state: next, lastAction: cleanAction };
      // pushTournamentState()가 대기 중인 경우 함께 묶어서 atomic 업데이트 (경쟁 방지)
      if (this._pendingTournament && this._tournamentMgr) {
        update.tournament = this._tournamentMgr.getState();
        this._pendingTournament = false;
      } else if (this._tournamentMgr) {
        update.tournament = this._tournamentMgr.getState();
      }
      this._db.ref(`games/${this._roomId}`).update(update).catch(err => {
        console.error('[Sync] state push failed:', err);
      });
    });
  }

  // 온라인 토너먼트: 새 라운드 시 엔진 교체
  attachNewRound(engine) {
    if (!this._isHost || !this._roomId) return;
    this._attachHostEngine(engine);
  }

  // 토너먼트 상태만 즉시 Firebase에 반영 (라운드 승리 직후 등, stateChanged를 기다리지 않고 push)
  // stateChanged와 동시 쓰기 경쟁을 피하기 위해 _pendingTournament 플래그로 다음 update에 묶음
  pushTournamentState() {
    if (!this._isHost || !this._roomId || !this._tournamentMgr) return;
    this._pendingTournament = true;
    // stateChanged가 곧 발생하지 않을 경우를 위해 단독 업데이트도 예약 (200ms 후)
    setTimeout(() => {
      if (this._pendingTournament && this._roomId && this._tournamentMgr) {
        this._pendingTournament = false;
        this._db.ref(`games/${this._roomId}`).update({
          tournament: this._tournamentMgr.getState()
        }).catch(err => console.error('[Sync] tournament push failed:', err));
      }
    }, 200);
  }

  // ---- 방 메타 조회 (게스트 참가 전) ----------------------------
  async fetchRoomMeta(roomId) {
    const snap = await this._db.ref(`games/${roomId}/meta`).get();
    if (!snap.exists()) throw new Error('방을 찾을 수 없습니다. 코드를 확인해 주세요.');
    const meta = snap.val();
    if (meta.status === 'host_disconnected') throw new Error('호스트가 연결 중이 아닙니다. 잠시 후 다시 시도하세요.');
    if (meta.status === 'ended')             throw new Error('이미 종료된 방입니다.');
    return { config: JSON.parse(meta.config) };
  }

  // ---- 방 참가 (게스트) ----------------------------------------
  async joinRoom(roomId, engine) {
    this._engine = engine;
    this._isHost = false;
    this._roomId = roomId.toUpperCase().trim();

    // Firebase transaction으로 빈 슬롯 선점
    const metaRef    = this._db.ref(`games/${this._roomId}/meta`);
    let assignedSlot = null;

    await metaRef.transaction(meta => {
      assignedSlot = null; // 재시도 시 초기화
      if (!meta) return meta;
      // humanSlots가 없으면 레거시 방 → p2 고정
      const slots = meta.humanSlots
        ? (Array.isArray(meta.humanSlots) ? meta.humanSlots : Object.values(meta.humanSlots))
        : ['p2'];
      const joined = meta.joinedSlots || {};
      for (const slot of slots) {
        if (!joined[slot]) {
          if (!meta.joinedSlots) meta.joinedSlots = {};
          meta.joinedSlots[slot] = true;
          assignedSlot = slot;
          // 모든 슬롯이 채워지면 playing으로 전환
          if (slots.every(s => meta.joinedSlots[s])) meta.status = 'playing';
          return meta;
        }
      }
      return undefined; // abort: 빈 슬롯 없음
    });

    if (!assignedSlot) throw new Error('방이 꽉 찼거나 참가할 수 없습니다.');
    this._mySlot = assignedSlot;

    // 비정상 종료 시 슬롯 자동 해제 → 재접속 가능
    this._db.ref(`games/${this._roomId}/meta/joinedSlots/${assignedSlot}`).onDisconnect().remove();

    // 게임 루트 구독: state + lastAction을 같은 스냅샷에서 읽어 레이스 방지
    let _prevStateJson = null;
    let _firstState    = true;
    const gameRef      = this._db.ref(`games/${this._roomId}`);
    const gameHandler  = gameRef.on('value', snap => {
      const data = snap.val();
      if (!this._engine) return;

      // 토너먼트 업데이트
      if (data?.tournament && this._onTournamentCb) {
        this._onTournamentCb(data.tournament);
      }

      // state가 없거나 변경이 없으면 스킵
      if (!data?.state) return;
      const stateJson = JSON.stringify(data.state);
      if (stateJson === _prevStateJson) return;
      _prevStateJson = stateJson;

      // 첫 번째 수신: lastAction은 이전 게임 잔여일 수 있어 무시
      const action = _firstState ? null : (data.lastAction || null);
      _firstState  = false;

      this._applyRemoteState(data.state, action);
    });
    this._offCallbacks.push(() => gameRef.off('value', gameHandler));
  }

  // ---- 호스트로 재접속 ----------------------------------------
  async rejoinAsHost(roomId, engine, config) {
    const cleanRoomId = roomId.toUpperCase().trim();

    // Firebase에서 현재 상태 가져오기 (상태 설정 전에 검증)
    const snap = await this._db.ref(`games/${cleanRoomId}/state`).get();
    if (!snap.exists() || !snap.val()) {
      // 내부 상태는 건드리지 않고 에러 throw (cancelRoom 후 rejoin 크래시 방지)
      throw new Error('저장된 게임 상태가 없습니다. 방이 만료되었거나 취소되었습니다.');
    }
    const savedState = snap.val();

    // 검증 통과 후 내부 상태 설정
    this._isHost = true;
    this._roomId = cleanRoomId;
    this._processedActions.clear();

    await this._db.ref(`games/${this._roomId}/meta`).update({ status: 'playing' });

    // 게스트 액션 수신 재시작
    const actionRef = this._db.ref(`games/${this._roomId}/pendingAction`);
    const actionHandler = actionRef.on('value', snap => {
      const action = snap.val();
      if (!action || !action.timestamp) return;
      const actionKey = `${action.timestamp}:${action.type}:${action.cardId}:${action.playerId}`;
      if (this._processedActions.has(actionKey)) return;
      this._processedActions.add(actionKey);
      this._lastActionTs = action.timestamp;
      actionRef.remove().catch(() => {});
      this._applyGuestAction(action);
    });
    this._offCallbacks.push(() => actionRef.off('value', actionHandler));

    this._attachHostEngine(engine);
    this._db.ref(`games/${this._roomId}/meta`).onDisconnect().update({ status: 'host_disconnected' });

    return savedState;
  }

  // ---- 게스트 액션 전송 ----------------------------------------
  sendAction(action) {
    if (this._isHost || !this._roomId) return;
    const payload = {
      type:            action.type            ?? null,
      playerId:        action.playerId        ?? null,
      cardId:          action.cardId          ?? null,
      targetPlayerId:  action.targetPlayerId  ?? null,
      targetHamsterId: action.targetHamsterId ?? null,
      timestamp:       Date.now()
    };
    const ref = this._db.ref(`games/${this._roomId}/pendingAction`);
    ref.set(payload).catch(err => {
      console.error('[Sync] sendAction failed, retrying...', err);
      // 네트워크 순간 끊김 시 1회 재시도
      setTimeout(() => {
        if (this._roomId) ref.set(payload).catch(e => console.error('[Sync] sendAction retry failed:', e));
      }, 1000);
    });
  }

  // ---- 콜백 등록 -----------------------------------------------
  onStatusChange(cb) { this._statusCb = cb; }

  // ---- 방 취소 (호스트가 명시적으로 취소) ------------------------
  cancelRoom() {
    if (this._roomId) {
      this._db.ref(`games/${this._roomId}`).remove().catch(() => {});
    }
    this.disconnect();
  }

  // ---- 연결 해제 (게임 종료 / 로비 복귀) -----------------------
  disconnect() {
    if (this._hostEngineOff) { this._hostEngineOff(); this._hostEngineOff = null; }
    this._offCallbacks.forEach(fn => fn());
    this._offCallbacks = [];
    this._roomId   = null;
    this._engine   = null;
    this._isHost   = false;
  }

  // ---- 내부 ----------------------------------------------------

  _applyGuestAction(action) {
    if (!action || !this._engine) return;
    const { type, playerId, cardId, targetPlayerId, targetHamsterId } = action;
    let result;
    try {
      switch (type) {
        case 'PLAY_CARD':        result = this._engine.playCard(playerId, cardId, targetPlayerId, targetHamsterId); break;
        case 'DISCARD_CARD':     result = this._engine.discardCard(playerId, cardId);    break;
        case 'DISCARD_ALL_DRAW': result = this._engine.discardAllAndDraw(playerId);      break;
        case 'SURRENDER':        result = this._engine.surrender(playerId);              break;
      }
    } catch (e) {
      result = { ok: false };
    }
    // 거부된 액션: 현재 상태를 Firebase에 강제 push → 게스트 낙관적 업데이트 롤백
    if (result && !result.ok && this._roomId) {
      const currentState = this._engine.getState();
      if (currentState) this._db.ref(`games/${this._roomId}/state`).set(currentState);
    }
  }

  _applyRemoteState(state, action = null) {
    if (!this._engine) return;
    // Firebase는 null/undefined 필드를 제거함 → 기본값 복원
    const sanitized = {
      ...state,
      deck:            Array.isArray(state.deck)        ? state.deck        : (state.deck        ? Object.values(state.deck)        : []),
      discardPile:     Array.isArray(state.discardPile) ? state.discardPile : (state.discardPile ? Object.values(state.discardPile) : []),
      winner:          state.winner          ?? null,
      luckyBirdPlayer: state.luckyBirdPlayer ?? null,
      luckyBirdActive: state.luckyBirdActive ?? false,
    };
    // playerOrder 복원
    if (!Array.isArray(sanitized.playerOrder)) {
      sanitized.playerOrder = sanitized.playerOrder ? Object.values(sanitized.playerOrder) : Object.keys(sanitized.players ?? {});
    }
    // 각 플레이어 hand/hamsters 배열 복원
    for (const player of Object.values(sanitized.players ?? {})) {
      if (!Array.isArray(player.hand))     player.hand     = player.hand     ? Object.values(player.hand)     : [];
      if (!Array.isArray(player.hamsters)) player.hamsters = player.hamsters ? Object.values(player.hamsters) : [];
    }

    const prev     = this._engine._state;
    const wasEnded = prev?.phase === 'ended';
    this._engine._state = sanitized;

    // 이전 라운드가 끝났고 새 게임이 시작됐으면 prev=null → _initialRender 강제
    this._engine.emit('stateChanged', {
      prev:   wasEnded ? null : prev,
      next:   sanitized,
      action
    });
    if (!wasEnded && sanitized.phase === 'ended' && sanitized.winner) {
      this._engine.emit('gameOver', { winner: sanitized.winner });
    }
  }

  _generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }
}
