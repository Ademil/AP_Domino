/* ===================================================================
   AP DOMINÓ — storage-manager.js
   Persistência local (LocalStorage) de estatísticas, configurações
   e partida em andamento.
   =================================================================== */
(function (global) {
  'use strict';

  const AP = (global.AP = global.AP || {});

  const PREFIX = 'apdomino.';
  const K_STATS = PREFIX + 'stats';
  const K_SETTINGS = PREFIX + 'settings';
  const K_GAME = PREFIX + 'game';
  const K_CHALLENGES = PREFIX + 'challenges';

  const DEFAULT_STATS = {
    matchesPlayed: 0,
    matchesWon: 0,
    matchesLost: 0,
    roundsWon: 0,
    highestScore: 0,
    currentStreak: 0,
    bestStreak: 0,
    tilesPlayed: 0,
    draws: 0,
    passes: 0,
    totalPoints: 0
  };

  const DEFAULT_SETTINGS = {
    theme: 'dark',
    lang: 'pt',
    sound: true,
    vibration: true,
    speed: 'normal',
    tileSize: 'normal',
    contrast: false,
    fontScale: 1,
    aiSpeed: 850
  };

  function safeParse(raw, fallback) {
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object') return fallback;
      return parsed;
    } catch (e) {
      return fallback;
    }
  }

  const StorageManager = {
    PREFIX: PREFIX,

    /* ---------- Genéricos ---------- */
    get(key, fallback) {
      try { return safeParse(global.localStorage.getItem(key), fallback); }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { global.localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    remove(key) {
      try { global.localStorage.removeItem(key); return true; }
      catch (e) { return false; }
    },
    isAvailable() {
      try {
        global.localStorage.setItem(PREFIX + 'test', '1');
        global.localStorage.removeItem(PREFIX + 'test');
        return true;
      } catch (e) { return false; }
    },

    /* ---------- Estatísticas ---------- */
    loadStats() {
      return Object.assign({}, DEFAULT_STATS, this.get(K_STATS, {}));
    },
    saveStats(stats) {
      return this.set(K_STATS, stats);
    },
    resetStats() {
      return this.set(K_STATS, Object.assign({}, DEFAULT_STATS));
    },
    registerMatchWon(score) {
      const s = this.loadStats();
      s.matchesPlayed++;
      s.matchesWon++;
      s.currentStreak++;
      if (s.currentStreak > s.bestStreak) s.bestStreak = s.currentStreak;
      if (score > s.highestScore) s.highestScore = score;
      s.totalPoints += score;
      this.saveStats(s);
      return s;
    },
    registerMatchLost(score) {
      const s = this.loadStats();
      s.matchesPlayed++;
      s.matchesLost++;
      s.currentStreak = 0;
      if (score > s.highestScore) s.highestScore = score;
      s.totalPoints += score;
      this.saveStats(s);
      return s;
    },
    registerRoundWon() {
      const s = this.loadStats();
      s.roundsWon++;
      this.saveStats(s);
      return s;
    },
    addCounters(delta) {
      const s = this.loadStats();
      s.tilesPlayed += delta.tilesPlayed || 0;
      s.draws += delta.draws || 0;
      s.passes += delta.passes || 0;
      this.saveStats(s);
      return s;
    },

    /* ---------- Configurações ---------- */
    loadSettings() {
      return Object.assign({}, DEFAULT_SETTINGS, this.get(K_SETTINGS, {}));
    },
    saveSettings(settings) {
      return this.set(K_SETTINGS, settings);
    },
    defaultSettings() { return Object.assign({}, DEFAULT_SETTINGS); },

    /* ---------- Partida em andamento ---------- */
    saveGame(engine) {
      if (!engine || !engine.state) return false;
      const payload = engine.serialize();
      if (!payload) return false;
      return this.set(K_GAME, payload);
    },
    loadGame() {
      return this.get(K_GAME, null);
    },
    hasGame() {
      const g = this.loadGame();
      return !!(g && g.state && g.state.phase === 'playing');
    },
    clearGame() {
      return this.remove(K_GAME);
    },

    /* ---------- Desafios ---------- */
    loadChallengeProgress() {
      return this.get(K_CHALLENGES, {});
    },
    markChallengeDone(id) {
      const p = this.loadChallengeProgress();
      p[id] = true;
      this.set(K_CHALLENGES, p);
      return p;
    }
  };

  AP.StorageManager = StorageManager;
  AP.DEFAULT_SETTINGS = DEFAULT_SETTINGS;

})(window);