function createHamsterElement(hamster, playerId, isOwn) {
  const el = document.createElement('div');
  el.className = 'hamster';
  el.dataset.hamsterId = hamster.id;
  el.dataset.playerId = playerId;
  el.dataset.own = isOwn ? '1' : '0';
  el.innerHTML = buildHamsterHTML(hamster);
  return el;
}

function updateHamsterElement(el, oldH, newH) {
  const classes = [
    ['sleeping',            'hamster--sleeping'],
    ['soundproofCase',      'hamster--in-case'],
    ['caseLock',            'hamster--locked'],
    ['waterBottle',         'hamster--has-bottle'],
    ['ribbon',              'hamster--has-ribbon'],
    ['backpack',            'hamster--has-backpack'],
  ];

  for (const [key, cls] of classes) {
    const newVal = key === 'sleeping' ? newH.sleeping : newH.attachments[key];
    const oldVal = key === 'sleeping' ? oldH.sleeping : oldH.attachments[key];
    if (newVal !== oldVal) {
      el.classList.toggle(cls, newVal);
      if (newVal) el.classList.add('hamster--animating');
    }
  }

  el.addEventListener('animationend', () => el.classList.remove('hamster--animating'), { once: true });
  el.innerHTML = buildHamsterHTML(newH);
}

// Layer stacking order (bottom → top):
// 1. hamster__body   — always
// 2. hamster__blanket — when sleeping (covers lower body + ZZZ)
// 3. hamster__ribbon-overlay — when has ribbon (big bow hiding all state)
// 4. hamster__case   — when has soundproofCase (transparent outer box)
// 5. badges          — bottle (inside case), backpack (outside)

function buildHamsterHTML(h) {
  const layers = [];

  if (h.attachments.ribbon) {
    // Back view — sleeping/awake state naturally hidden
    layers.push(`<div class="hamster__body">${hamsterBackSvg()}</div>`);
  } else {
    layers.push(`<div class="hamster__body">${hamsterSvg(h.sleeping)}</div>`);
    if (h.sleeping) {
      layers.push(`<div class="hamster__layer hamster__blanket">${blanketSvg()}</div>`);
    }
  }

  if (h.attachments.soundproofCase) {
    layers.push(`<div class="hamster__layer hamster__earmuffs">${earmuffsSvg()}</div>`);
    layers.push(`<div class="hamster__layer hamster__case">${caseSvg(h.attachments.caseLock, h.attachments.waterBottle)}</div>`);
    if (h.attachments.waterBottle) {
      layers.push(`<div class="hamster__badge hamster__bottle">🧱</div>`);
    }
  }

  if (h.attachments.backpack) {
    layers.push(`<div class="hamster__badge hamster__backpack">🎒</div>`);
  }

  return layers.join('');
}

// Hamster SVG — closed eyes when sleeping
function hamsterSvg(sleeping) {
  const eyeL = sleeping
    ? `<path d="M27 35 Q31 31 35 35" stroke="#5C3A1E" stroke-width="2.5" fill="none" stroke-linecap="round"/>`
    : `<circle cx="31" cy="35" r="3.5" fill="#5C3A1E"/>`;
  const eyeR = sleeping
    ? `<path d="M45 35 Q49 31 53 35" stroke="#5C3A1E" stroke-width="2.5" fill="none" stroke-linecap="round"/>`
    : `<circle cx="49" cy="35" r="3.5" fill="#5C3A1E"/>`;
  return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" class="hamster-svg">
    <ellipse cx="22" cy="22" rx="12" ry="12" fill="#F4A261"/>
    <ellipse cx="58" cy="22" rx="12" ry="12" fill="#F4A261"/>
    <ellipse cx="22" cy="22" rx="7" ry="7" fill="#FDDCB5"/>
    <ellipse cx="58" cy="22" rx="7" ry="7" fill="#FDDCB5"/>
    <ellipse cx="40" cy="46" rx="30" ry="28" fill="#F4A261"/>
    <ellipse cx="40" cy="38" rx="24" ry="22" fill="#FDDCB5"/>
    <ellipse cx="20" cy="44" rx="8" ry="6" fill="#F9B8C0" opacity="0.6"/>
    <ellipse cx="60" cy="44" rx="8" ry="6" fill="#F9B8C0" opacity="0.6"/>
    ${eyeL}
    ${eyeR}
    <ellipse cx="40" cy="43" rx="4" ry="3" fill="#E07B7B"/>
    <path d="M36 47 Q40 51 44 47" stroke="#E07B7B" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  </svg>`;
}

// Blanket SVG — covers lower body when sleeping, includes ZZZ
function blanketSvg() {
  return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" class="blanket-svg">
    <path d="M1 50 Q12 39 22 47 Q32 55 42 47 Q52 39 62 47 Q72 55 79 50 L79 80 L1 80 Z"
          fill="#92C5E8" opacity="0.93"/>
    <path d="M1 57 Q14 49 27 55 Q40 61 53 55 Q66 49 79 57 L79 80 L1 80 Z"
          fill="#6EB0D8" opacity="0.72"/>
    <text x="53" y="30" font-size="13" fill="#5A9FC0" font-weight="bold" font-family="sans-serif">z</text>
    <text x="61" y="21" font-size="10" fill="#5A9FC0" font-weight="bold" font-family="sans-serif">z</text>
    <text x="67" y="14" font-size="7" fill="#5A9FC0" font-weight="bold" font-family="sans-serif">z</text>
  </svg>`;
}

// Hamster back view SVG — shown when ribbon is attached; hides sleeping state naturally
function hamsterBackSvg() {
  return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" class="hamster-svg">
    <ellipse cx="22" cy="22" rx="12" ry="12" fill="#F4A261"/>
    <ellipse cx="58" cy="22" rx="12" ry="12" fill="#F4A261"/>
    <ellipse cx="22" cy="22" rx="7" ry="7" fill="#E8955A"/>
    <ellipse cx="58" cy="22" rx="7" ry="7" fill="#E8955A"/>
    <ellipse cx="40" cy="46" rx="30" ry="28" fill="#F4A261"/>
    <ellipse cx="40" cy="50" rx="13" ry="20" fill="#FDDCB5" opacity="0.55"/>
    <ellipse cx="40" cy="72" rx="5" ry="4" fill="#FDDCB5"/>
    <ellipse cx="25" cy="37" rx="13" ry="8.5" fill="#FF6B9D" transform="rotate(-15 25 37)"/>
    <ellipse cx="25" cy="37" rx="8" ry="5.5" fill="#FF96BC" transform="rotate(-15 25 37)"/>
    <ellipse cx="55" cy="37" rx="13" ry="8.5" fill="#FF6B9D" transform="rotate(15 55 37)"/>
    <ellipse cx="55" cy="37" rx="8" ry="5.5" fill="#FF96BC" transform="rotate(15 55 37)"/>
    <circle cx="40" cy="37" r="6.5" fill="#D81B70"/>
    <circle cx="40" cy="37" r="3.8" fill="#FF6BAD"/>
    <path d="M37 43 Q30 55 25 64" stroke="#FF6B9D" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M43 43 Q50 55 55 64" stroke="#FF6B9D" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="M37.5 43 Q31 54 26 63" stroke="#FF96BC" stroke-width="2" stroke-linecap="round" fill="none"/>
    <path d="M42.5 43 Q49 54 54 63" stroke="#FF96BC" stroke-width="2" stroke-linecap="round" fill="none"/>
  </svg>`;
}

// Earmuffs SVG — shown when hamster is in soundproof case
function earmuffsSvg() {
  return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" class="hamster-svg">
    <path d="M22 22 Q40 5 58 22" stroke="#7B1FA2" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <circle cx="22" cy="22" r="12" fill="#AB47BC" opacity="0.88"/>
    <circle cx="22" cy="22" r="7.5" fill="#E1BEE7"/>
    <circle cx="58" cy="22" r="12" fill="#AB47BC" opacity="0.88"/>
    <circle cx="58" cy="22" r="7.5" fill="#E1BEE7"/>
  </svg>`;
}

// Case SVG — simple big rectangle; turns brick-red when reinforced (waterBottle)
function caseSvg(locked, reinforced) {
  const fill    = reinforced ? '#C8543A' : '#C8E6C9';
  const stroke  = reinforced ? '#8B3012' : '#81C784';
  const opacity = reinforced ? '0.40'    : '0.28';
  const lockIcon = locked
    ? `<rect x="28" y="40" width="24" height="18" rx="3" fill="#5D2A10" opacity="0.90"/>
       <path d="M34 40 V34 Q40 28 46 34 V40" stroke="#5D2A10" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : '';
  return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" class="case-svg">
    <rect x="2" y="2" width="76" height="76" rx="14"
          fill="${fill}" stroke="${stroke}" stroke-width="3.5" opacity="${opacity}"/>
    ${lockIcon}
  </svg>`;
}

// ---- 결과 페이지 전용 표정 ----
// 우승자: 행복하게 자는 표정 (큰 미소 + 반짝임), 나머지: 삐죽 입을 내민 불만 표정.
// 실제 게임 종료 시점의 sleeping 상태와 무관하게, 결과 화면 연출용으로 고정한다.

function buildResultHamsterHTML(h, isWinner) {
  const layers = [];

  if (h.attachments.ribbon) {
    layers.push(`<div class="hamster__body">${hamsterBackSvg()}</div>`);
  } else {
    layers.push(`<div class="hamster__body">${isWinner ? resultHappySvg() : resultPoutySvg()}</div>`);
    if (isWinner) {
      layers.push(`<div class="hamster__layer hamster__blanket">${blanketSvg()}</div>`);
    }
  }

  if (h.attachments.soundproofCase) {
    layers.push(`<div class="hamster__layer hamster__earmuffs">${earmuffsSvg()}</div>`);
    layers.push(`<div class="hamster__layer hamster__case">${caseSvg(h.attachments.caseLock, h.attachments.waterBottle)}</div>`);
    if (h.attachments.waterBottle) {
      layers.push(`<div class="hamster__badge hamster__bottle">🧱</div>`);
    }
  }

  if (h.attachments.backpack) {
    layers.push(`<div class="hamster__badge hamster__backpack">🎒</div>`);
  }

  return layers.join('');
}

// 우승자: 감은 눈(^ ^) + 크게 웃는 입 + 반짝임
function resultHappySvg() {
  return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" class="hamster-svg">
    <ellipse cx="22" cy="22" rx="12" ry="12" fill="#F4A261"/>
    <ellipse cx="58" cy="22" rx="12" ry="12" fill="#F4A261"/>
    <ellipse cx="22" cy="22" rx="7" ry="7" fill="#FDDCB5"/>
    <ellipse cx="58" cy="22" rx="7" ry="7" fill="#FDDCB5"/>
    <ellipse cx="40" cy="46" rx="30" ry="28" fill="#F4A261"/>
    <ellipse cx="40" cy="38" rx="24" ry="22" fill="#FDDCB5"/>
    <ellipse cx="20" cy="44" rx="8" ry="6" fill="#F9B8C0" opacity="0.6"/>
    <ellipse cx="60" cy="44" rx="8" ry="6" fill="#F9B8C0" opacity="0.6"/>
    <path d="M27 35 Q31 31 35 35" stroke="#5C3A1E" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M45 35 Q49 31 53 35" stroke="#5C3A1E" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="40" cy="43" rx="4" ry="3" fill="#E07B7B"/>
    <path d="M31 46 Q40 57 49 46" stroke="#E07B7B" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M60 10 L62.5 15.5 L68 16 L64 20 L65 25.5 L60 22.5 L55 25.5 L56 20 L52 16 L57.5 15.5 Z" fill="#FFC107"/>
    <path d="M13 56 L14.5 59.5 L18 60 L15.5 62.5 L16 66 L13 64 L10 66 L10.5 62.5 L8 60 L11.5 59.5 Z" fill="#FFC107"/>
  </svg>`;
}

// 패자: 살짝 찌푸린 눈썹 + 뜬 눈 + 삐죽 내민 입
function resultPoutySvg() {
  return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" class="hamster-svg">
    <ellipse cx="22" cy="22" rx="12" ry="12" fill="#F4A261"/>
    <ellipse cx="58" cy="22" rx="12" ry="12" fill="#F4A261"/>
    <ellipse cx="22" cy="22" rx="7" ry="7" fill="#FDDCB5"/>
    <ellipse cx="58" cy="22" rx="7" ry="7" fill="#FDDCB5"/>
    <ellipse cx="40" cy="46" rx="30" ry="28" fill="#F4A261"/>
    <ellipse cx="40" cy="38" rx="24" ry="22" fill="#FDDCB5"/>
    <ellipse cx="20" cy="44" rx="8" ry="6" fill="#F9B8C0" opacity="0.6"/>
    <ellipse cx="60" cy="44" rx="8" ry="6" fill="#F9B8C0" opacity="0.6"/>
    <path d="M27 31 Q31 28 35 30" stroke="#5C3A1E" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M45 30 Q49 28 53 31" stroke="#5C3A1E" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="31" cy="36" r="3.2" fill="#5C3A1E"/>
    <circle cx="49" cy="36" r="3.2" fill="#5C3A1E"/>
    <ellipse cx="40" cy="45" rx="4" ry="3" fill="#E07B7B"/>
    <ellipse cx="40" cy="53" rx="6" ry="4" fill="#E07B7B"/>
  </svg>`;
}
