export function createHamsterElement(hamster, playerId, isOwn) {
  const el = document.createElement('div');
  el.className = 'hamster';
  el.dataset.hamsterId = hamster.id;
  el.dataset.playerId = playerId;
  el.dataset.own = isOwn ? '1' : '0';
  el.innerHTML = buildHamsterHTML(hamster);
  return el;
}

export function updateHamsterElement(el, oldH, newH) {
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

function buildHamsterHTML(h) {
  const layers = [];

  // 기본 햄스터 (Phase 1에서는 SVG 플레이스홀더)
  layers.push(`<div class="hamster__body">${hamsterSvg(h.sleeping)}</div>`);

  if (h.attachments.soundproofCase) {
    layers.push(`<div class="hamster__layer hamster__case">${caseSvg(h.attachments.caseLock)}</div>`);
    if (h.attachments.waterBottle) {
      layers.push(`<div class="hamster__badge hamster__bottle">💧</div>`);
    }
  }
  if (h.attachments.ribbon) {
    layers.push(`<div class="hamster__badge hamster__ribbon">🎀</div>`);
  }
  if (h.attachments.backpack) {
    layers.push(`<div class="hamster__badge hamster__backpack">🎒</div>`);
  }

  return layers.join('');
}

function hamsterSvg(sleeping) {
  // Phase 1 플레이스홀더: 동그란 SVG 햄스터
  const eyeLeft  = sleeping ? `<path d="M28 36 Q31 33 34 36" stroke="#5C3A1E" stroke-width="2.5" fill="none" stroke-linecap="round"/>` : `<circle cx="31" cy="35" r="3.5" fill="#5C3A1E"/>`;
  const eyeRight = sleeping ? `<path d="M46 36 Q49 33 52 36" stroke="#5C3A1E" stroke-width="2.5" fill="none" stroke-linecap="round"/>` : `<circle cx="49" cy="35" r="3.5" fill="#5C3A1E"/>`;
  const zzz      = sleeping ? `<text x="62" y="22" font-size="12" fill="#8ABCD1" font-weight="bold" font-family="sans-serif">z</text><text x="68" y="14" font-size="9" fill="#8ABCD1" font-weight="bold" font-family="sans-serif">z</text>` : '';

  return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" class="hamster-svg">
    <!-- 귀 -->
    <ellipse cx="22" cy="22" rx="12" ry="12" fill="#F4A261"/>
    <ellipse cx="58" cy="22" rx="12" ry="12" fill="#F4A261"/>
    <ellipse cx="22" cy="22" rx="7" ry="7" fill="#FDDCB5"/>
    <ellipse cx="58" cy="22" rx="7" ry="7" fill="#FDDCB5"/>
    <!-- 몸통 -->
    <ellipse cx="40" cy="46" rx="30" ry="28" fill="#F4A261"/>
    <!-- 얼굴 -->
    <ellipse cx="40" cy="38" rx="24" ry="22" fill="#FDDCB5"/>
    <!-- 볼 -->
    <ellipse cx="20" cy="44" rx="8" ry="6" fill="#F9B8C0" opacity="0.6"/>
    <ellipse cx="60" cy="44" rx="8" ry="6" fill="#F9B8C0" opacity="0.6"/>
    <!-- 눈 -->
    ${eyeLeft}
    ${eyeRight}
    <!-- 코 -->
    <ellipse cx="40" cy="43" rx="4" ry="3" fill="#E07B7B"/>
    <!-- 입 -->
    <path d="M36 47 Q40 51 44 47" stroke="#E07B7B" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    ${zzz}
  </svg>`;
}

function caseSvg(locked) {
  const lockIcon = locked
    ? `<rect x="28" y="38" width="24" height="20" rx="3" fill="#A0855B" opacity="0.9"/>
       <path d="M34 38 V32 Q40 26 46 32 V38" stroke="#A0855B" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : '';
  return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" class="case-svg">
    <rect x="8" y="20" width="64" height="52" rx="8" fill="#C8E6C9" stroke="#81C784" stroke-width="2.5" opacity="0.85"/>
    <rect x="8" y="20" width="64" height="16" rx="8" fill="#81C784" opacity="0.9"/>
    ${lockIcon}
  </svg>`;
}
