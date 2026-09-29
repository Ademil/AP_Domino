/* ===================================================================
   AP DOMINÓ — audio-manager.js
   Efeitos sonoros gerados em tempo real via Web Audio API (sem arquivos).
   =================================================================== */
(function (global) {
  'use strict';

  const AP = (global.AP = global.AP || {});

  class AudioManager {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      this.masterGain = null;
    }

    /** Cria/retoma o contexto de áudio (precisa de gesto do usuário). */
    ensure() {
      if (!this.ctx) {
        const Ctx = global.AudioContext || global.webkitAudioContext;
        if (!Ctx) return null;
        this.ctx = new Ctx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.5;
        this.masterGain.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(function () {});
      }
      return this.ctx;
    }

    setEnabled(value) {
      this.enabled = !!value;
      if (this.masterGain) {
        this.masterGain.gain.value = this.enabled ? 0.5 : 0;
      }
    }

    /** Tom simples com envelope. */
    tone(freq, duration, type, peak, delay) {
      if (!this.enabled) return;
      const ctx = this.ensure();
      if (!ctx) return;

      const t0 = ctx.currentTime + (delay || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type || 'triangle';
      osc.frequency.setValueAtTime(freq, t0);

      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak || 0.25, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t0);
      osc.stop(t0 + duration + 0.03);
    }

    /** Ruído curto filtrado (som de "clack" da peça). */
    click(duration, peak, filterFreq) {
      if (!this.enabled) return;
      const ctx = this.ensure();
      if (!ctx) return;

      const dur = duration || 0.06;
      const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
      }

      const src = ctx.createBufferSource();
      src.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = filterFreq || 1800;
      filter.Q.value = 1.1;

      const gain = ctx.createGain();
      gain.gain.value = peak || 0.35;

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      src.start(ctx.currentTime);
    }

    /** Reproduz um evento nomeado. */
    play(name) {
      if (!this.enabled) return;
      switch (name) {
        case 'button':
          this.tone(760, 0.05, 'square', 0.12);
          break;

        case 'place':
          this.click(0.07, 0.4, 1600);
          this.tone(320, 0.07, 'sine', 0.16, 0.005);
          break;

        case 'draw':
          this.tone(420, 0.07, 'triangle', 0.16);
          this.tone(620, 0.06, 'triangle', 0.12, 0.06);
          break;

        case 'pass':
          this.tone(300, 0.14, 'sine', 0.18);
          this.tone(200, 0.18, 'sine', 0.14, 0.1);
          break;

        case 'error':
          this.tone(180, 0.16, 'sawtooth', 0.16);
          break;

        case 'win':
          this.tone(523.25, 0.16, 'triangle', 0.24, 0);
          this.tone(659.25, 0.16, 'triangle', 0.24, 0.14);
          this.tone(783.99, 0.16, 'triangle', 0.24, 0.28);
          this.tone(1046.5, 0.42, 'triangle', 0.26, 0.42);
          break;

        case 'lose':
          this.tone(440, 0.20, 'sine', 0.22, 0);
          this.tone(349.23, 0.20, 'sine', 0.22, 0.18);
          this.tone(261.63, 0.46, 'sine', 0.22, 0.36);
          break;

        case 'start':
          this.tone(392, 0.14, 'triangle', 0.20, 0);
          this.tone(523.25, 0.14, 'triangle', 0.20, 0.12);
          this.tone(659.25, 0.24, 'triangle', 0.22, 0.24);
          break;

        case 'shuffle':
          for (let i = 0; i < 6; i++) this.click(0.04, 0.16, 1200 + i * 260);
          break;

        case 'point':
          this.tone(880, 0.10, 'square', 0.16);
          this.tone(1174.66, 0.16, 'square', 0.14, 0.09);
          break;

        default:
          break;
      }
    }
  }

  AP.AudioManager = AudioManager;

})(window);