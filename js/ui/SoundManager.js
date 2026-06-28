class SoundManager {
  constructor() {
    this._ctx = null;
    this._muted = false;
    this._bgmPlaying = false;
    this._bgmTimeout = null;
    this._bgmIndex = 0;
  }

  get muted() { return this._muted; }

  _getCtx() {
    if (!this._ctx) {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this._ctx.state === 'suspended') this._ctx.resume();
    return this._ctx;
  }

  toggleMute() {
    this._muted = !this._muted;
    if (this._muted) {
      this._bgmPlaying = false;
      clearTimeout(this._bgmTimeout);
    } else {
      this._bgmPlaying = true;
      this._playBgmNote();
    }
    return this._muted;
  }

  startBgm() {
    if (this._muted || this._bgmPlaying) return;
    this._bgmPlaying = true;
    this._playBgmNote();
  }

  stopBgm() {
    this._bgmPlaying = false;
    clearTimeout(this._bgmTimeout);
  }

  // Pentatonic C major loop: C4 E4 G4 A4 G4 E4 D4 C4
  _bgmNotes = [261.63, 329.63, 392.00, 440.00, 392.00, 329.63, 293.66, 261.63];

  _playBgmNote() {
    if (!this._bgmPlaying || this._muted) return;
    try {
      const ctx = this._getCtx();
      const freq = this._bgmNotes[this._bgmIndex % this._bgmNotes.length];
      this._bgmIndex++;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;

      const now = ctx.currentTime;
      const dur = 0.55;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.07, now + 0.06);
      gain.gain.linearRampToValueAtTime(0.05, now + dur * 0.75);
      gain.gain.linearRampToValueAtTime(0, now + dur * 0.95);
      osc.start(now);
      osc.stop(now + dur);
    } catch (_) { /* AudioContext not available */ }

    this._bgmTimeout = setTimeout(() => this._playBgmNote(), 560);
  }

  _tone(freq, type, dur, vol, delay = 0) {
    if (this._muted) return;
    try {
      const ctx = this._getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur);
    } catch (_) {}
  }

  // Card play — light swoosh
  playCard() { this._tone(520, 'triangle', 0.16, 0.22); }

  // Hamster falls asleep — three descending soft tones
  playSleep() {
    [400, 320, 260].forEach((f, i) => this._tone(f, 'sine', 0.28, 0.18, i * 0.14));
  }

  // Hamster wakes up — ascending chirp
  playWake() {
    [300, 420, 560].forEach((f, i) => this._tone(f, 'triangle', 0.16, 0.18, i * 0.08));
  }

  // Attachment added — two-note click
  playAttach() {
    this._tone(440, 'square', 0.10, 0.10, 0);
    this._tone(600, 'square', 0.10, 0.10, 0.09);
  }

  // Discard — low thud
  playDiscard() { this._tone(220, 'sawtooth', 0.14, 0.14); }

  // Round win — three ascending tones
  playRoundWin() {
    [392, 523, 659].forEach((f, i) => this._tone(f, 'triangle', 0.32, 0.20, i * 0.13));
  }

  // Tournament win — ascending fanfare
  playWin() {
    [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 'triangle', 0.40, 0.24, i * 0.14));
  }
}
