// 인원이 많을수록 개인당 햄스터가 너무 적으면 사용 가능한 카드가 급격히 줄어들어
// "전부 버리기"만 반복하게 되므로, 4인에서도 최소 4마리는 보장한다.
const HAMSTER_COUNT_BY_PLAYERS = { 2: 5, 3: 4, 4: 4 };

function createHamsters(count, playerId) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${playerId}-h${i}`,
    sleeping: false,
    attachments: {
      soundproofCase: false,
      caseLock: false,
      waterBottle: false,
      ribbon: false,
      backpack: false
    }
  }));
}
