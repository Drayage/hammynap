export class CardAnimator {
  playCard(cardEl, targetEl, onComplete) {
    if (!cardEl) { onComplete?.(); return; }

    cardEl.classList.add('card--playing');
    const duration = 350;

    if (targetEl) {
      const fromRect = cardEl.getBoundingClientRect();
      const toRect   = targetEl.getBoundingClientRect();
      const dx = toRect.left + toRect.width  / 2 - (fromRect.left + fromRect.width  / 2);
      const dy = toRect.top  + toRect.height / 2 - (fromRect.top  + fromRect.height / 2);

      cardEl.animate([
        { transform: 'translate(0,0) scale(1)',       opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) scale(0.5)`, opacity: 0 }
      ], { duration, easing: 'ease-in', fill: 'forwards' }).onfinish = () => {
        cardEl.classList.remove('card--playing');
        onComplete?.();
      };
    } else {
      cardEl.animate([
        { transform: 'translateY(0) scale(1)', opacity: 1 },
        { transform: 'translateY(-30px) scale(0.8)', opacity: 0 }
      ], { duration, easing: 'ease-out', fill: 'forwards' }).onfinish = () => {
        cardEl.classList.remove('card--playing');
        onComplete?.();
      };
    }
  }

  attachItem(hamsterEl) {
    hamsterEl?.classList.add('hamster--snap-in');
    hamsterEl?.addEventListener('animationend', () => {
      hamsterEl.classList.remove('hamster--snap-in');
    }, { once: true });
  }

  wakeHamster(hamsterEl, delay = 0) {
    setTimeout(() => {
      hamsterEl?.classList.add('hamster--shaking');
      hamsterEl?.addEventListener('animationend', () => {
        hamsterEl.classList.remove('hamster--shaking');
      }, { once: true });
    }, delay);
  }

  sleepHamster(hamsterEl) {
    hamsterEl?.classList.add('hamster--dozing');
    hamsterEl?.addEventListener('animationend', () => {
      hamsterEl.classList.remove('hamster--dozing');
    }, { once: true });
  }
}
