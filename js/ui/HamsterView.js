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

  layers.push(`<div class="hamster__body">${hamsterSvg(h.sleeping)}</div>`);

  if (h.sleeping) {
    layers.push(`<div class="hamster__layer hamster__blanket">${blanketSvg()}</div>`);
  }

  if (h.attachments.ribbon) {
    layers.push(`<div class="hamster__layer hamster__ribbon-overlay">${ribbonSvg()}</div>`);
  }

  if (h.attachments.soundproofCase) {
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

// Ribbon SVG — large bow covering entire hamster, hides sleeping/awake state
function ribbonSvg() {
  return `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" class="ribbon-svg">
    <circle cx="40" cy="40" r="37" fill="#FFD6E4" opacity="0.90"/>
    <ellipse cx="25" cy="29" rx="17" ry="12" fill="#FF6B9D" transform="rotate(-18 25 29)"/>
    <ellipse cx="25" cy="29" rx="10" ry="7" fill="#FF96BC" transform="rotate(-18 25 29)"/>
    <ellipse cx="55" cy="29" rx="17" ry="12" fill="#FF6B9D" transform="rotate(18 55 29)"/>
    <ellipse cx="55" cy="29" rx="10" ry="7" fill="#FF96BC" transform="rotate(18 55 29)"/>
    <circle cx="40" cy="34" r="7.5" fill="#D81B70"/>
    <circle cx="40" cy="34" r="4.5" fill="#FF6BAD"/>
    <path d="M36 40 Q27 54 21 65" stroke="#FF6B9D" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path d="M44 40 Q53 54 59 65" stroke="#FF6B9D" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path d="M37 41 Q29 54 23 64" stroke="#FF96BC" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    <path d="M43 41 Q51 54 57 64" stroke="#FF96BC" stroke-width="2.5" stroke-linecap="round" fill="none"/>
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
