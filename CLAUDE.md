# 햄찌 낮잠시간 (hammynap) — 카드게임

바닐라 JS (전역 네임스페이스 + script 태그 — **ES modules 금지**, 과거 제거한 전례 있음).
Firebase 온라인 멀티 + 토너먼트, 확장팩(귀요미 사진대회), PWA, GitHub Pages 배포.

## 파일 지도

- `js/engine/` — GameEngine, RuleEngine, StateManager, AiPlayer, TournamentManager
- `js/ui/` — Renderer, CardAnimator, HamsterView, SoundManager
- `js/firebase/Sync.js` — 온라인 동기화 (**undefined→null 변환 필수 지점**)
- `js/records/` — 결과 기록/뷰어
- `js/data/cards.js`, `js/data/hamsters.js` — 카드/햄스터 정의
- `js/main.js`(~1,100줄) — 진입점/화면 전환
- `sw.js` — PWA 캐시

## 규칙

이 저장소는 커밋의 71%가 수정 커밋이었다. 아래를 지키면 대부분 예방된다:

- 온라인 코드 수정 시 **탭 2개(호스트/게스트) 스모크 테스트 없이 push 금지**
  — firebase-online 스킬의 검증 절차 필수.
- 강제 플레이 카드(리본/탈출 등)와 전부버리기 상호작용은 교착 전례 다수 —
  카드 규칙 변경 시 확장 모드 포함해 "버릴 수 있는 수가 없는 상태"를 반드시 확인.
- 카드 설명은 팝업이 아니라 핸드 위 고정 라인으로 표시하는 방식이 확정임.
- SW/캐시/배포/모바일: webgame-ship 스킬 참조.
