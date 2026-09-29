/* ===================================================================
   AP DOMINÓ — app.js
   Controlador da interface. Suporta 1, 2 ou 3 humanos no mesmo aparelho
   (hot-seat) com nomes personalizados.
   =================================================================== */
(function (global) {
  'use strict';

  const AP = global.AP;
  const PRIMARY_HUMAN = 0;

  /* ==================== CORES DOS BADGES ==================== */
  const PLAYER_COLORS = ['#16a34a', '#0891b2', '#d97706', '#7c3aed'];

  /* ==================== DESAFIOS ==================== */
  const CHALLENGES = [
    {
      id: 'rapido',
      title: '⚡ Vitória Relâmpago',
      desc: 'Vença uma rodada usando no máximo 5 jogadas suas. Adversário: IA Fácil.',
      config: { mode: 'challenge', playerCount: 2, humanCount: 1, difficulty: 'easy', targetScore: 50 },
      check: function (ctx) { return ctx.humanWonRound && ctx.roundStats.plays[0] <= 5; }
    },
    {
      id: 'sem-compra',
      title: '🧤 Mão Limpa',
      desc: 'Vença uma rodada sem comprar nenhuma peça do monte. Adversário: IA Médio.',
      config: { mode: 'challenge', playerCount: 2, humanCount: 1, difficulty: 'medium', targetScore: 100 },
      check: function (ctx) { return ctx.humanWonRound && ctx.roundStats.draws[0] === 0; }
    },
    {
      id: 'fechado',
      title: '🔒 Mestre do Bloqueio',
      desc: 'Vença uma rodada por jogo fechado, com 4 jogadores. IA Difícil.',
      config: { mode: 'challenge', playerCount: 4, humanCount: 1, difficulty: 'hard', targetScore: 100 },
      check: function (ctx) { return ctx.humanWonRound && ctx.reason === 'BLOCKED'; }
    },
    {
      id: 'pontuador',
      title: '💯 Pontuador',
      desc: 'Faça 30 pontos ou mais em uma única rodada. IA Difícil.',
      config: { mode: 'challenge', playerCount: 4, humanCount: 1, difficulty: 'hard', targetScore: 200 },
      check: function (ctx) { return ctx.humanWonRound && ctx.points >= 30; }
    }
  ];

  /* ==================== APLICATIVO ==================== */
  const App = {
    engine: null,
    renderer: null,
    audio: null,
    aiPlayers: [],
    settings: null,
    stats: null,
    challengeProgress: {},
    currentChallenge: null,
    selectedTileId: null,
    aiTimer: null,
    aiBusy: false,
    gameOver: false,
    ui: {},
    lastRoundHumanWon: false,

    // Hot-seat
    humanIndices: [0],
    viewingPlayer: 0,
    humanNames: [],   // mantém os nomes digitados entre partidas

    /* ---------------- Inicialização ---------------- */
    init() {
      this.cacheElements();
      this.settings = AP.StorageManager.loadSettings();
      this.stats = AP.StorageManager.loadStats();
      this.challengeProgress = AP.StorageManager.loadChallengeProgress();

      this.audio = new AP.AudioManager();
      this.audio.setEnabled(this.settings.sound);

      this.engine = new AP.GameEngine();
      this.bindEngineEvents();

      this.renderer = new AP.Renderer(this.engine, {
        boardViewport: this.ui.boardViewport,
        boardInner: this.ui.boardInner,
        playerHand: this.ui.playerHand,
        scoreboard: this.ui.scoreboard,
        historyList: this.ui.historyList,
        hudRound: this.ui.hudRound,
        hudTurn: this.ui.hudTurn,
        boneyardCount: this.ui.boneyardCount
      });

      this.renderer.onTileClick = this.handleTileClick.bind(this);
      this.renderer.onSideClick = this.handleSideClick.bind(this);

      this.applySettings();
      this.bindUI();
      this.refreshMenuState();
      this.showScreen('screen-menu');

      AP.PWAManager.init(this.handleInstallAvailability.bind(this));
    },

    cacheElements() {
      this.ui = {
        screens: Array.prototype.slice.call(document.querySelectorAll('.screen')),
        boardViewport: document.getElementById('boardViewport'),
        boardInner: document.getElementById('boardInner'),
        playerHand: document.getElementById('playerHand'),
        scoreboard: document.getElementById('scoreboard'),
        historyList: document.getElementById('historyList'),
        historyPanel: document.getElementById('historyPanel'),
        hudRound: document.getElementById('hudRound'),
        hudTurn: document.getElementById('hudTurn'),
        boneyardCount: document.getElementById('boneyardCount'),
        btnDraw: document.getElementById('btnDraw'),
        btnPass: document.getElementById('btnPass'),
        btnUndo: document.getElementById('btnUndo'),
        gameMessage: document.getElementById('gameMessage'),
        btnContinue: document.getElementById('btnContinue'),
        btnInstall: document.getElementById('btnInstall'),
        btnSound: document.getElementById('btnSound'),
        brandLogo: document.getElementById('brandLogo'),
        brandLogoFallback: document.getElementById('brandLogoFallback'),
        overlayPause: document.getElementById('overlayPause'),
        overlayPassDevice: document.getElementById('overlayPassDevice'),
        passDeviceText: document.getElementById('passDeviceText'),
        overlayRound: document.getElementById('overlayRound'),
        overlayMatch: document.getElementById('overlayMatch'),
        overlayConfirm: document.getElementById('overlayConfirm'),
        roundTitle: document.getElementById('roundTitle'),
        roundBody: document.getElementById('roundBody'),
        roundActions: document.getElementById('roundActions'),
        matchTitle: document.getElementById('matchTitle'),
        matchBody: document.getElementById('matchBody'),
        confirmTitle: document.getElementById('confirmTitle'),
        confirmText: document.getElementById('confirmText'),
        confirmYes: document.getElementById('confirmYes'),
        confirmNo: document.getElementById('confirmNo'),
        toast: document.getElementById('toast'),
        setupMode: document.getElementById('setupMode'),
        setupPlayers: document.getElementById('setupPlayers'),
        setupHumans: document.getElementById('setupHumans'),
        setupDifficulty: document.getElementById('setupDifficulty'),
        setupTarget: document.getElementById('setupTarget'),
        namesGroup: document.getElementById('namesGroup'),
        namesInputs: document.getElementById('namesInputs'),
        challengeList: document.getElementById('challengeList'),
        statsBody: document.getElementById('statsBody')
      };

      if (this.ui.brandLogo && this.ui.brandLogoFallback) {
        this.ui.brandLogo.addEventListener('error', () => {
          this.ui.brandLogo.hidden = true;
          this.ui.brandLogoFallback.hidden = false;
        });
      }
    },

    /* ---------------- Helpers hot-seat ---------------- */
    isHuman(idx) { return this.humanIndices.indexOf(idx) !== -1; },
    humanLabel() {
      return this.humanIndices.length > 1 ? 'VOCÊS' : 'VOCÊ';
    },

    /* ---------------- Inputs de nomes ---------------- */
    renderNameInputs(humanCount) {
      const group = this.ui.namesGroup;
      const container = this.ui.namesInputs;
      if (!group || !container) return;

      if (humanCount <= 1) {
        group.hidden = true;
        container.innerHTML = '';
        return;
      }
      group.hidden = false;

      // Preserva valores digitados anteriormente
      const previous = [];
      Array.prototype.forEach.call(container.querySelectorAll('input'), function (inp) {
        previous.push(inp.value);
      });
      if (previous.length === 0 && this.humanNames.length > 0) {
        for (let i = 0; i < this.humanNames.length; i++) previous[i] = this.humanNames[i];
      }

      container.innerHTML = '';

      for (let i = 0; i < humanCount; i++) {
        const row = document.createElement('div');
        row.className = 'name-input-row';

        const badge = document.createElement('span');
        badge.className = 'name-badge';
        badge.textContent = 'J' + (i + 1);
        badge.style.background = PLAYER_COLORS[i % PLAYER_COLORS.length];

        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 14;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.placeholder = 'JOGADOR ' + (i + 1);
        input.value = previous[i] || this.humanNames[i] || '';
        input.setAttribute('aria-label', 'Nome do jogador ' + (i + 1));
        input.addEventListener('input', () => {
          this.humanNames[i] = input.value;
        });

        row.appendChild(badge);
        row.appendChild(input);
        container.appendChild(row);
      }
    },

    readHumanNames(humanCount) {
      const container = this.ui.namesInputs;
      const names = [];
      if (container) {
        const inputs = container.querySelectorAll('input');
        for (let i = 0; i < humanCount; i++) {
          const raw = inputs[i] ? inputs[i].value.trim() : '';
          names.push(raw || ('JOGADOR ' + (i + 1)));
        }
      } else {
        for (let i = 0; i < humanCount; i++) names.push('JOGADOR ' + (i + 1));
      }
      return names;
    },

    /* ---------------- Eventos do motor ---------------- */
    bindEngineEvents() {
      const self = this;
      this.engine.on('play', function () { self.audio.play('place'); self.vibrate(18); });
      this.engine.on('draw', function () { self.audio.play('draw'); self.vibrate(12); });
      this.engine.on('pass', function () { self.audio.play('pass'); self.vibrate([10, 40, 10]); });
      this.engine.on('roundOver', function (result) { self.handleRoundOver(result); });
    },

    /* ---------------- Vínculo de UI ---------------- */
    bindUI() {
      const self = this;

      document.addEventListener('click', function (ev) {
        const btn = ev.target.closest('[data-action]');
        if (!btn) return;
        self.handleAction(btn.dataset.action, btn, ev);
      });

      [['setupMode', 'mode'], ['setupPlayers', 'players'], ['setupHumans', 'humans'],
       ['setupDifficulty', 'difficulty'], ['setupTarget', 'target'],
       ['setTheme', 'theme'], ['setLang', 'lang'], ['setSound', 'sound'],
       ['setVibration', 'vibration'], ['setSpeed', 'speed'],
       ['setTileSize', 'tileSize'], ['setContrast', 'contrast'],
       ['setFontScale', 'fontScale']].forEach(function (pair) {
        const container = document.getElementById(pair[0]);
        if (!container) return;
        container.addEventListener('click', function (ev) {
          const chip = ev.target.closest('.chip');
          if (!chip || chip.disabled) return;
          self.handleChip(container, pair[1], chip.dataset.value);
        });
      });

      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') {
          if (!self.ui.overlayPassDevice.hidden) return;
          if (!self.ui.overlayPause.hidden) { self.togglePause(false); }
          else if (!self.ui.historyPanel.hidden) { self.ui.historyPanel.hidden = true; }
          else if (self.ui.screens.find(s => s.id === 'screen-game' && s.classList.contains('active'))) {
            self.togglePause(true);
          }
        }
      });

      global.addEventListener('beforeunload', function () {
        if (self.engine.state && self.engine.state.phase === 'playing') {
          AP.StorageManager.saveGame(self.engine);
        }
      });

      setInterval(function () {
        if (self.engine.state && self.engine.state.phase === 'playing' && !self.gameOver) {
          AP.StorageManager.saveGame(self.engine);
        }
      }, 5000);
    },

    handleAction(action) {
      this.audio.ensure();
      switch (action) {
        case 'new-match':       this.audio.play('button'); this.openSetup('classic'); break;
        case 'quick-ai':        this.audio.play('button'); this.openSetup('ai'); break;
        case 'duo':             this.audio.play('button'); this.openSetup('duo'); break;
        case 'challenges':      this.audio.play('button'); this.renderChallenges(); this.showScreen('screen-challenges'); break;
        case 'stats':           this.audio.play('button'); this.renderStats(); this.showScreen('screen-stats'); break;
        case 'settings':        this.audio.play('button'); this.syncSettingsChips(); this.showScreen('screen-settings'); break;
        case 'howto':           this.audio.play('button'); this.showScreen('screen-howto'); break;
        case 'back-menu':       this.audio.play('button'); this.goToMenu(); break;
        case 'start-match':     this.audio.play('button'); this.startFromSetup(); break;
        case 'continue-match':  this.audio.play('button'); this.continueMatch(); break;
        case 'install':         this.installPWA(); break;
        case 'pause':           this.audio.play('button'); this.togglePause(true); break;
        case 'resume':          this.audio.play('button'); this.togglePause(false); break;
        case 'restart':         this.confirm('Reiniciar partida?', 'O progresso atual será perdido.', () => { this.togglePause(false); this.restartMatch(); }); break;
        case 'open-settings-ingame': this.audio.play('button'); this.syncSettingsChips(); this.showScreen('screen-settings'); this._returnToGame = true; break;
        case 'howto-ingame':    this.audio.play('button'); this.showScreen('screen-howto'); this._returnToGame = true; break;
        case 'quit':            this.confirm('Abandonar partida?', 'Deseja realmente abandonar esta partida?', () => { this.quitMatch(); }); break;
        case 'toggle-sound':    this.toggleSound(); break;
        case 'history':         this.ui.historyPanel.hidden = !this.ui.historyPanel.hidden; break;
        case 'draw':            this.humanDraw(); break;
        case 'pass':            this.humanPass(); break;
        case 'undo':            this.humanUndo(); break;
        case 'pass-device-ready': this.handlePassDeviceReady(); break;
        case 'reset-stats':     this.confirm('Zerar estatísticas?', 'Todas as estatísticas serão apagadas.', () => this.resetStats()); break;
        case 'play-again':      this.ui.overlayMatch.hidden = true; this.restartMatch(); break;
        case 'start-challenge': this.startChallenge(this._pendingChallengeId); break;
        default: break;
      }
    },

    handleChip(container, kind, value) {
      this.audio.play('button');
      Array.prototype.forEach.call(container.querySelectorAll('.chip'), function (c) {
        c.classList.toggle('active', c.dataset.value === value);
      });

      // Ajusta humanos conforme número de jogadores
      if (kind === 'players') {
        const n = parseInt(value, 10);
        const humansRow = this.ui.setupHumans;
        let selectedHuman = 1;
        Array.prototype.forEach.call(humansRow.querySelectorAll('.chip'), function (c) {
          const hv = parseInt(c.dataset.value, 10);
          c.disabled = (hv > n);
          if (c.disabled) c.classList.remove('active');
          if (c.classList.contains('active')) selectedHuman = hv;
        });
        if (!humansRow.querySelector('.chip.active')) {
          selectedHuman = Math.min(2, n);
          this.selectChip('setupHumans', String(selectedHuman));
        }
        this.renderNameInputs(selectedHuman);
      }

      if (kind === 'humans') {
        const hv = parseInt(value, 10);
        this.renderNameInputs(hv);
      }

      if (kind === 'mode') {
        // Em duplas, forçamos 4 jogadores
        if (value === 'duo') {
          this.selectChip('setupPlayers', '4');
          const playersRow = document.getElementById('setupPlayers');
          Array.prototype.forEach.call(playersRow.querySelectorAll('.chip'), function (c) {
            c.disabled = true;
          });
          // Em duplas com 4 jogadores aceitamos 1 ou 2 humanos
          const humansRow = this.ui.setupHumans;
          Array.prototype.forEach.call(humansRow.querySelectorAll('.chip'), function (c) {
            const hv = parseInt(c.dataset.value, 10);
            c.disabled = (hv > 2);
          });
        } else {
          const playersRow = document.getElementById('setupPlayers');
          Array.prototype.forEach.call(playersRow.querySelectorAll('.chip'), function (c) {
            c.disabled = false;
          });
        }
      }

      if (kind in { theme: 1, lang: 1, sound: 1, vibration: 1, speed: 1, tileSize: 1, contrast: 1, fontScale: 1 }) {
        this.applySettingFromChip(kind, value);
      }
    },

    /* ---------------- Telas ---------------- */
    showScreen(id) {
      this.ui.screens.forEach(function (s) {
        s.classList.toggle('active', s.id === id);
      });
      if (id === 'screen-game') {
        setTimeout(() => this.renderer.renderBoard(true), 40);
      }
    },

    goToMenu() {
      if (this._returnToGame && this.engine.state && this.engine.state.phase === 'playing') {
        this._returnToGame = false;
        this.showScreen('screen-game');
        return;
      }
      this.refreshMenuState();
      this.showScreen('screen-menu');
    },

    refreshMenuState() {
      this.ui.btnContinue.hidden = !AP.StorageManager.hasGame();
      this.ui.btnInstall.hidden = !AP.PWAManager.canInstall() || AP.PWAManager.isStandalone();
    },

    /* ---------------- Configurações de partida ---------------- */
    openSetup(mode) {
      this.showScreen('screen-setup');
      const modeMap = { classic: 'classic', ai: 'ai', duo: 'duo' };
      const playerCount = (mode === 'duo') ? 4 : 2;
      this.selectChip('setupMode', modeMap[mode] || 'ai');
      this.selectChip('setupPlayers', String(playerCount));
      this.selectChip('setupHumans', '1');
      this.selectChip('setupDifficulty', this.settings.lastDifficulty || 'medium');
      this.selectChip('setupTarget', String(this.settings.lastTarget || 100));

      const playersRow = document.getElementById('setupPlayers');
      Array.prototype.forEach.call(playersRow.querySelectorAll('.chip'), function (c) {
        c.disabled = (mode === 'duo');
      });

      const humansRow = this.ui.setupHumans;
      Array.prototype.forEach.call(humansRow.querySelectorAll('.chip'), function (c) {
        const hv = parseInt(c.dataset.value, 10);
        c.disabled = (hv > playerCount) || (mode === 'duo' && hv > 2);
      });

      this.renderNameInputs(1);
    },

    selectChip(containerId, value) {
      const container = document.getElementById(containerId);
      if (!container) return;
      Array.prototype.forEach.call(container.querySelectorAll('.chip'), function (c) {
        c.classList.toggle('active', c.dataset.value === String(value));
      });
    },

    readChip(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return null;
      const active = container.querySelector('.chip.active');
      return active ? active.dataset.value : null;
    },

    startFromSetup() {
      const mode = this.readChip('setupMode') || 'ai';
      const players = parseInt(this.readChip('setupPlayers') || '2', 10);
      const humans = parseInt(this.readChip('setupHumans') || '1', 10);
      const difficulty = this.readChip('setupDifficulty') || 'medium';
      const target = parseInt(this.readChip('setupTarget') || '100', 10);

      const safeHumans = Math.max(1, Math.min(humans, players));
      const names = this.readHumanNames(safeHumans);

      this.settings.lastDifficulty = difficulty;
      this.settings.lastTarget = target;
      AP.StorageManager.saveSettings(this.settings);

      this.currentChallenge = null;
      this.startMatch({
        mode: mode,
        playerCount: mode === 'duo' ? 4 : players,
        humanCount: safeHumans,
        humanNames: names,
        difficulty: difficulty,
        targetScore: target
      });
    },

    /* ---------------- Partida ---------------- */
    startMatch(config) {
      this.clearAITimer();
      AP.StorageManager.clearGame();
      this.gameOver = false;
      this.aiBusy = false;
      this.lastRoundHumanWon = false;
      this.selectedTileId = null;
      this.engine.newMatch(config);

      // Guarda nomes para uso futuro (restart/render dos inputs)
      this.humanNames = (config.humanNames || []).slice();

      this.humanIndices = this.engine.state.players
        .filter(function (p) { return !p.isAI; })
        .map(function (p) { return p.index; });
      this.viewingPlayer = this.humanIndices.length > 0 ? this.humanIndices[0] : 0;

      this.aiPlayers = this.engine.state.players.map(function (p) {
        return p.isAI ? new AP.AIPlayer(p.difficulty) : null;
      });

      this.renderer.resetBoard();
      this.renderer.clearSelection();

      this.audio.play('start');
      this.showScreen('screen-game');
      this.sync(true);
    },

    restartMatch() {
      if (!this.engine.state) { this.goToMenu(); return; }
      const cfg = Object.assign({}, this.engine.config);
      // Preserva nomes
      cfg.humanNames = this.humanNames.slice();
      this.startMatch(cfg);
    },

    continueMatch() {
      const saved = AP.StorageManager.loadGame();
      if (!saved) { this.toast('Nenhuma partida salva.'); return; }
      if (!this.engine.restore(saved)) { this.toast('Não foi possível restaurar a partida.'); return; }

      this.gameOver = false;
      this.aiBusy = false;
      this.selectedTileId = null;

      this.humanIndices = this.engine.state.players
        .filter(function (p) { return !p.isAI; })
        .map(function (p) { return p.index; });
      this.viewingPlayer = this.humanIndices.length > 0 ? this.humanIndices[0] : 0;

      this.aiPlayers = this.engine.state.players.map(function (p) {
        return p.isAI ? new AP.AIPlayer(p.difficulty) : null;
      });
      this.renderer.resetBoard();
      this.renderer.clearSelection();
      this.showScreen('screen-game');
      this.sync(true);
    },

    quitMatch() {
      this.clearAITimer();
      AP.StorageManager.saveGame(this.engine);
      this.ui.overlayPause.hidden = true;
      this.ui.overlayMatch.hidden = true;
      this.ui.overlayRound.hidden = true;
      this.ui.overlayPassDevice.hidden = true;
      this.gameOver = false;
      this.aiBusy = false;
      this.refreshMenuState();
      this.showScreen('screen-menu');
    },

    /* ---------------- Pass device ---------------- */
    handlePassDeviceReady() {
      const s = this.engine.state;
      if (!s || !this.isHuman(s.currentPlayer)) {
        this.ui.overlayPassDevice.hidden = true;
        return;
      }
      this.audio.play('button');
      this.viewingPlayer = s.currentPlayer;
      this.ui.overlayPassDevice.hidden = true;
      this.sync(false);
    },

    /* ---------------- Sincronização / render ---------------- */
    sync(scheduleAI) {
      const s = this.engine.state;
      if (!s) return;

      if (s.currentPlayer === PRIMARY_HUMAN) this.aiBusy = false;

      const currentIsHuman = this.isHuman(s.currentPlayer);
      const needsHandover = (s.phase === 'playing')
        && currentIsHuman
        && (this.viewingPlayer !== s.currentPlayer);

      // Caso 1: precisa passar o aparelho antes de mostrar a mão
      if (needsHandover) {
        this.ui.overlayPassDevice.hidden = false;
        this.ui.passDeviceText.innerHTML =
          'É a vez de <b>' + s.players[s.currentPlayer].name + '</b>.';
        this.renderer.renderBoard();
        this.renderer.clearHand('Aguardando...');
        this.renderer.renderScoreboard(s.currentPlayer);
        this.renderer.renderHUD();
        this.renderer.renderHistory();
        this.ui.btnDraw.disabled = true;
        this.ui.btnPass.disabled = true;
        this.ui.btnUndo.hidden = true;
        this.ui.gameMessage.textContent = '';
        return;
      }
      this.ui.overlayPassDevice.hidden = true;

      // Caso 2: render normal
      this.renderer.renderBoard();

      const viewIdx = this.viewingPlayer;
      const hideHandDuringAI = !currentIsHuman && (this.humanIndices.length >= 2);

      if (hideHandDuringAI) {
        this.renderer.clearHand('IA jogando...');
      } else {
        this.renderer.renderHand(viewIdx);
      }

      this.renderer.renderScoreboard(viewIdx);
      this.renderer.renderHUD();
      this.renderer.renderHistory();
      this.updateControls();

      if (scheduleAI !== false) this.scheduleAI();
    },

    updateControls() {
      const s = this.engine.state;
      const drawBtn = this.ui.btnDraw;
      const passBtn = this.ui.btnPass;
      const undoBtn = this.ui.btnUndo;
      const msg = this.ui.gameMessage;

      drawBtn.disabled = true;
      passBtn.disabled = true;
      msg.textContent = '';

      if (!s || s.phase !== 'playing') {
        undoBtn.hidden = true;
        return;
      }

      const isTraining = (s.mode === 'training');
      undoBtn.hidden = !isTraining;

      if (!this.isHuman(s.currentPlayer)) return;
      if (this.viewingPlayer !== s.currentPlayer) return;

      const canPlay = this.engine.canPlay(s.currentPlayer);
      if (canPlay) {
        msg.textContent = this.selectedTileId ? 'ESCOLHA A EXTREMIDADE' : 'TOQUE EM UMA PEÇA';
        return;
      }

      if (s.boneyard.length > 0) {
        drawBtn.disabled = false;
        msg.textContent = 'SEM JOGADA — COMPRE UMA PEÇA';
      } else {
        passBtn.disabled = false;
        msg.textContent = 'SEM PEÇAS NO MONTE — PASSE';
      }
    },

    /* ---------------- Interação do humano ---------------- */
    handleTileClick(tileId) {
      const s = this.engine.state;
      if (!s || s.phase !== 'playing') return;
      if (!this.isHuman(s.currentPlayer)) { this.toast('Aguarde sua vez.'); return; }
      if (this.viewingPlayer !== s.currentPlayer) return;

      if (this.selectedTileId === tileId) {
        this.selectedTileId = null;
        this.renderer.clearSelection();
        this.renderer.renderBoard();
        this.renderer.renderHand(this.viewingPlayer);
        this.updateControls();
        return;
      }

      const options = this.engine.getTileOptions(s.currentPlayer, tileId);
      if (options.length === 0) {
        this.audio.play('error');
        this.vibrate([30, 40, 30]);
        this.renderer.markTileInvalid(tileId);
        this.toast('Essa peça não encaixa.');
        return;
      }

      if (options.length === 1) {
        this.playHuman(tileId, options[0].side);
        return;
      }

      this.selectedTileId = tileId;
      this.renderer.selectedTileId = tileId;
      this.renderer.validSides = options.map(function (o) { return o.side; });
      this.renderer.renderBoard();
      this.renderer.renderHand(this.viewingPlayer);
      this.updateControls();
      this.audio.play('button');
    },

    handleSideClick(side) {
      if (!this.selectedTileId) return;
      this.playHuman(this.selectedTileId, side);
    },

    playHuman(tileId, side) {
      const s = this.engine.state;
      if (!s || !this.isHuman(s.currentPlayer)) return;
      if (this.viewingPlayer !== s.currentPlayer) return;

      const result = this.engine.playTile(s.currentPlayer, tileId, side);
      if (!result.ok) {
        this.audio.play('error');
        this.toast(this.errorMessage(result.error));
        this.sync();
        return;
      }
      this.selectedTileId = null;
      this.renderer.clearSelection();
      this.sync();
    },

    humanDraw() {
      const s = this.engine.state;
      if (!s || !this.isHuman(s.currentPlayer)) return;
      if (this.viewingPlayer !== s.currentPlayer) return;

      const result = this.engine.drawTile(s.currentPlayer);
      if (!result.ok) {
        this.audio.play('error');
        this.toast(this.errorMessage(result.error));
        return;
      }
      this.sync();
    },

    humanPass() {
      const s = this.engine.state;
      if (!s || !this.isHuman(s.currentPlayer)) return;
      if (this.viewingPlayer !== s.currentPlayer) return;

      const result = this.engine.pass(s.currentPlayer);
      if (!result.ok) {
        this.audio.play('error');
        this.toast(this.errorMessage(result.error));
        return;
      }
      this.sync();
    },

    humanUndo() {
      const result = this.engine.undo();
      if (!result.ok) { this.toast('Nada para desfazer.'); return; }
      this.selectedTileId = null;
      this.renderer.clearSelection();
      this.renderer.resetBoard();
      this.sync();
    },

    errorMessage(code) {
      const map = {
        FORA_DO_TURNO: 'Não é a sua vez.',
        PECA_INEXISTENTE: 'Peça não encontrada na sua mão.',
        JOGADA_INVALIDA: 'Jogada inválida.',
        LADO_INVALIDO: 'Essa peça não encaixa nesse lado.',
        MONTE_VAZIO: 'Sem peças no monte.',
        PODE_JOGAR: 'Você possui jogada válida.',
        MONTE_COM_PECAS: 'Ainda há peças no monte.',
        PARTIDA_ENCERRADA: 'A rodada já terminou.'
      };
      return map[code] || 'Ação não permitida.';
    },

    /* ---------------- Turno da IA ---------------- */
    scheduleAI() {
      const s = this.engine.state;
      if (!s || s.phase !== 'playing') return;
      if (this.gameOver) return;

      const current = s.players[s.currentPlayer];
      if (!current.isAI) { this.aiBusy = false; return; }

      this.aiBusy = true;
      const self = this;
      this.clearAITimer();
      this.aiTimer = setTimeout(function () { self.runAITurn(); }, this.settings.aiSpeed);
    },

    runAITurn() {
      try {
        const s = this.engine.state;
        if (!s || s.phase !== 'playing') return;

        const idx = s.currentPlayer;
        const player = s.players[idx];
        if (!player.isAI) return;

        const ai = this.aiPlayers[idx] || new AP.AIPlayer(player.difficulty);

        let decision = null;
        try { decision = ai.decide(this.engine, idx); } catch (e) { decision = null; }

        if (!decision) {
          const fb = this.engine.getMoveOptions(idx)[0];
          if (fb) decision = { action: 'play', tileId: fb.tileId, side: fb.side };
          else if (s.boneyard.length > 0) decision = { action: 'draw' };
          else decision = { action: 'pass' };
        }

        let result;
        if (decision.action === 'play') {
          result = this.engine.playTile(idx, decision.tileId, decision.side);
          if (!result || !result.ok) {
            const fb = this.engine.getMoveOptions(idx)[0];
            if (fb) this.engine.playTile(idx, fb.tileId, fb.side);
            else if (s.boneyard.length > 0) this.engine.drawTile(idx);
            else this.engine.pass(idx);
          }
        } else if (decision.action === 'draw') {
          result = this.engine.drawTile(idx);
          if (!result || !result.ok) { if (s.boneyard.length === 0) this.engine.pass(idx); }
        } else {
          result = this.engine.pass(idx);
          if (!result || !result.ok) { if (s.boneyard.length > 0) this.engine.drawTile(idx); }
        }
      } catch (e) {
        try {
          const s = this.engine.state;
          if (s && s.phase === 'playing') {
            const idx = s.currentPlayer;
            if (s.players[idx].isAI) {
              if (s.boneyard.length > 0) this.engine.drawTile(idx);
              else this.engine.pass(idx);
            }
          }
        } catch (e2) { /* desiste silenciosamente */ }
      } finally {
        this.aiBusy = false;
        const s = this.engine.state;
        if (!s) return;
        if (s.phase === 'playing') {
          this.sync();
        } else {
          this.renderer.renderBoard();
          this.renderer.renderScoreboard(this.viewingPlayer);
          this.renderer.renderHUD();
          this.updateControls();
        }
      }
    },

    clearAITimer() {
      if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
    },

    /* ---------------- Fim de rodada ---------------- */
    handleRoundOver(result) {
      const s = this.engine.state;
      this.clearAITimer();
      this.aiBusy = false;

      const winnerTeam = result.winner !== null ? s.players[result.winner].team : null;
      const humanWonRound = result.winner !== null && (
        this.isHuman(result.winner) ||
        (winnerTeam !== null && this.humanIndices.some(function (h) {
          return s.players[h].team === winnerTeam;
        }))
      );

      this.lastRoundHumanWon = humanWonRound;

      AP.StorageManager.addCounters({
        tilesPlayed: s.roundStats ? Object.keys(s.roundStats.plays).reduce((a, k) => a + s.roundStats.plays[k], 0) : 0,
        draws: s.roundStats ? Object.keys(s.roundStats.draws).reduce((a, k) => a + s.roundStats.draws[k], 0) : 0,
        passes: s.roundStats ? Object.keys(s.roundStats.passes).reduce((a, k) => a + s.roundStats.passes[k], 0) : 0
      });
      if (humanWonRound) AP.StorageManager.registerRoundWon();

      if (this.currentChallenge) {
        const ctx = {
          humanWonRound: humanWonRound,
          roundStats: s.roundStats,
          reason: result.reason,
          points: result.points
        };
        if (this.currentChallenge.check(ctx) && !this.challengeProgress[this.currentChallenge.id]) {
          AP.StorageManager.markChallengeDone(this.currentChallenge.id);
          this.challengeProgress = AP.StorageManager.loadChallengeProgress();
        }
      }

      this.audio.play(humanWonRound ? 'win' : (result.winner === null ? 'pass' : 'lose'));
      this.vibrate(humanWonRound ? [40, 60, 40, 60, 90] : [120]);

      if (this.engine.state.phase !== 'playing') AP.StorageManager.clearGame();

      this.showRoundOverlay(result, humanWonRound);
    },

    showRoundOverlay(result, humanWonRound) {
      const self = this;
      const s = this.engine.state;

      let title;
      if (result.reason === 'BLOCKED') title = '🔒 JOGO FECHADO';
      else if (humanWonRound) title = '🎉 ' + this.humanLabel() + (this.humanIndices.length > 1 ? ' VENCERAM!' : ' VENCEU!');
      else if (result.winner === null) title = '🤝 RODADA EMPATADA';
      else title = 'RODADA PERDIDA';

      this.ui.roundTitle.textContent = title;

      const body = this.ui.roundBody;
      body.innerHTML = '';

      if (result.reason === 'BLOCKED') {
        const sub = document.createElement('div');
        sub.className = 'round-sub';
        sub.textContent = 'Ninguém conseguiu jogar. Vence quem tem menos pontos na mão.';
        body.appendChild(sub);
      }

      const winnerName = result.winner !== null ? s.players[result.winner].name : '—';
      const head = document.createElement('div');
      head.className = 'round-sub';
      head.textContent = 'VENCEDOR DA RODADA: ' + winnerName;
      body.appendChild(head);

      const total = document.createElement('div');
      total.className = 'round-total';
      total.textContent = '+' + result.points + ' pts';
      body.appendChild(total);

      result.detail.forEach(function (d) {
        const line = document.createElement('div');
        line.className = 'round-line';
        if (result.winner === d.player) line.classList.add('winner');
        const nameSpan = document.createElement('span');
        nameSpan.className = 'rl-name';
        nameSpan.textContent = d.name;
        const valueSpan = document.createElement('span');
        valueSpan.textContent = d.pips + ' pts · ' + d.tiles.length + ' peça(s) [' +
          (d.tiles.length ? d.tiles.join('  ') : '—') + ']';
        line.appendChild(nameSpan);
        line.appendChild(valueSpan);
        body.appendChild(line);
      });

      const sep = document.createElement('div');
      sep.className = 'round-sub';
      sep.style.marginTop = '14px';
      sep.textContent = 'PLACAR ACUMULADO (até ' + s.targetScore + ')';
      body.appendChild(sep);

      const board = this.engine.getScoreboard();
      const hasTeams = board.some(function (b) { return b.team !== null; });
      const shown = new Set();
      board.forEach(function (b) {
        if (hasTeams) {
          if (shown.has(b.team)) return;
          shown.add(b.team);
          const line = document.createElement('div');
          line.className = 'round-line';
          const nm = document.createElement('span');
          nm.className = 'rl-name';
          nm.textContent = 'DUPLA ' + (b.team + 1);
          const vl = document.createElement('span');
          vl.textContent = b.teamScore + ' pts';
          line.appendChild(nm); line.appendChild(vl);
          body.appendChild(line);
        } else {
          const line = document.createElement('div');
          line.className = 'round-line';
          const nm = document.createElement('span');
          nm.className = 'rl-name';
          nm.textContent = b.name;
          const vl = document.createElement('span');
          vl.textContent = b.score + ' pts';
          line.appendChild(nm); line.appendChild(vl);
          body.appendChild(line);
        }
      });

      const actions = this.ui.roundActions;
      actions.innerHTML = '';

      const matchOver = this.engine.isMatchOver();

      const nextBtn = document.createElement('button');
      nextBtn.className = 'btn btn-primary';
      nextBtn.textContent = matchOver ? 'VER RESULTADO FINAL' : 'PRÓXIMA RODADA';
      nextBtn.addEventListener('click', function () {
        self.audio.play('button');
        self.ui.overlayRound.hidden = true;
        if (matchOver) {
          self.showMatchResult();
        } else {
          self.engine.nextRound();
          self.selectedTileId = null;
          self.renderer.clearSelection();
          self.renderer.resetBoard();
          self.viewingPlayer = self.humanIndices.length > 0 ? self.humanIndices[0] : 0;
          self.sync(true);
        }
      });
      actions.appendChild(nextBtn);

      const menuBtn = document.createElement('button');
      menuBtn.className = 'btn';
      menuBtn.textContent = 'VOLTAR AO MENU';
      menuBtn.addEventListener('click', function () {
        self.audio.play('button');
        self.ui.overlayRound.hidden = true;
        self.quitMatch();
      });
      actions.appendChild(menuBtn);

      this.ui.overlayRound.hidden = false;
    },

    /* ---------------- Fim de partida ---------------- */
    showMatchResult() {
      const s = this.engine.state;
      this.gameOver = true;
      AP.StorageManager.clearGame();

      const board = this.engine.getScoreboard();
      const hasTeams = board.some(function (b) { return b.team !== null; });

      // Determina "score do humano principal" para os registros
      const primary = board.find(function (b) { return b.index === PRIMARY_HUMAN; }) || board[0];
      const humanScore = hasTeams ? primary.teamScore : primary.score;

      // Determina vitória: qualquer humano (ou sua dupla) no topo
      let humanWon;
      if (hasTeams) {
        const best = Math.max.apply(null, board.map(function (b) { return b.teamScore; }));
        const anyHumanTeamAtTop = board.some(function (b) {
          return b.teamScore === best &&
                 b.teamScore >= s.targetScore &&
                 s.players[HUMAN_TEAM_CHECK(b)] && s.players[HUMAN_TEAM_CHECK(b)].team === b.team;
        });
        // fallback: cheque direto
        humanWon = (humanScore >= best && humanScore >= s.targetScore);
        if (!humanWon) {
          // Se alguma dupla com humano venceu
          humanWon = board.some(function (b) {
            return b.teamScore >= best && b.teamScore >= s.targetScore &&
              this.humanIndices.some(function (h) { return s.players[h].team === b.team; });
          }.bind(this));
        }
        void anyHumanTeamAtTop;
      } else {
        const best = Math.max.apply(null, board.map(function (b) { return b.score; }));
        humanWon = board.some(function (b) {
          return this.isHuman(b.index) && b.score >= best && b.score >= s.targetScore;
        }.bind(this));
      }

      if (humanWon) AP.StorageManager.registerMatchWon(humanScore);
      else AP.StorageManager.registerMatchLost(humanScore);
      this.stats = AP.StorageManager.loadStats();

      this.ui.matchTitle.textContent = humanWon
        ? (this.humanIndices.length > 1 ? '🏆 VOCÊS VENCERAM!' : '🏆 VOCÊ VENCEU!')
        : 'FIM DA PARTIDA';

      const body = this.ui.matchBody;
      body.innerHTML = '';

      const trophy = document.createElement('div');
      trophy.className = 'trophy';
      trophy.textContent = humanWon ? '🏆' : '🎯';
      body.appendChild(trophy);

      const tot = document.createElement('div');
      tot.className = 'round-total';
      tot.textContent = humanScore + ' pts';
      body.appendChild(tot);

      const sub = document.createElement('div');
      sub.className = 'round-sub';
      sub.textContent = humanWon
        ? 'PARABÉNS! A PONTUAÇÃO ALVO FOI ATINGIDA.'
        : 'A IA ATINGIU A PONTUAÇÃO ALVO PRIMEIRO.';
      body.appendChild(sub);

      const self = this;
      const shown = new Set();
      board.forEach(function (b) {
        if (hasTeams) {
          if (shown.has(b.team)) return;
          shown.add(b.team);
          const isHumanTeam = self.humanIndices.some(function (h) {
            return s.players[h].team === b.team;
          });
          const line = document.createElement('div');
          line.className = 'round-line';
          const nm = document.createElement('span');
          nm.className = 'rl-name';
          nm.textContent = 'DUPLA ' + (b.team + 1) + (isHumanTeam ? ' (VOCÊS)' : '');
          const vl = document.createElement('span');
          vl.textContent = b.teamScore + ' pts';
          line.appendChild(nm); line.appendChild(vl);
          body.appendChild(line);
        } else {
          const line = document.createElement('div');
          line.className = 'round-line';
          const nm = document.createElement('span');
          nm.className = 'rl-name';
          nm.textContent = b.name;
          const vl = document.createElement('span');
          vl.textContent = b.score + ' pts';
          line.appendChild(nm); line.appendChild(vl);
          body.appendChild(line);
        }
      });

      const info = document.createElement('div');
      info.className = 'round-sub';
      info.style.marginTop = '14px';
      info.textContent = 'PARTIDAS: ' + this.stats.matchesPlayed +
        ' · VITÓRIAS: ' + this.stats.matchesWon +
        ' · DERROTAS: ' + this.stats.matchesLost;
      body.appendChild(info);

      this.audio.play(humanWon ? 'win' : 'lose');
      this.vibrate(humanWon ? [50, 70, 50, 70, 120] : [150]);

      this.ui.overlayMatch.hidden = false;
    },

    /* ---------------- Pausa ---------------- */
    togglePause(show) {
      this.ui.overlayPause.hidden = !show;
      if (show) {
        this.clearAITimer();
      } else {
        this.scheduleAI();
      }
    },

    /* ---------------- Confirmação ---------------- */
    confirm(title, text, onYes) {
      const self = this;
      this.ui.confirmTitle.textContent = title;
      this.ui.confirmText.textContent = text;
      this.ui.overlayConfirm.hidden = false;

      const yes = function () {
        self.ui.overlayConfirm.hidden = true;
        self.ui.confirmYes.removeEventListener('click', yes);
        self.ui.confirmNo.removeEventListener('click', no);
        onYes();
      };
      const no = function () {
        self.ui.overlayConfirm.hidden = true;
        self.ui.confirmYes.removeEventListener('click', yes);
        self.ui.confirmNo.removeEventListener('click', no);
      };
      this.ui.confirmYes.addEventListener('click', yes);
      this.ui.confirmNo.addEventListener('click', no);
    },

    /* ---------------- Estatísticas ---------------- */
    renderStats() {
      const s = AP.StorageManager.loadStats();
      const body = this.ui.statsBody;
      body.innerHTML = '';

      const rate = s.matchesPlayed > 0
        ? ((s.matchesWon / s.matchesPlayed) * 100).toFixed(1).replace('.', ',')
        : '0,0';

      const rows = [
        ['PARTIDAS', s.matchesPlayed],
        ['VITÓRIAS', s.matchesWon],
        ['DERROTAS', s.matchesLost],
        ['APROVEITAMENTO', rate + '%'],
        ['RODADAS VENCIDAS', s.roundsWon],
        ['MELHOR PARTIDA', s.highestScore + ' pontos'],
        ['SEQUÊNCIA ATUAL', s.currentStreak + ' vitórias'],
        ['MELHOR SEQUÊNCIA', s.bestStreak + ' vitórias'],
        ['PEÇAS JOGADAS', s.tilesPlayed],
        ['COMPRAS', s.draws],
        ['PASSES', s.passes],
        ['PONTOS ACUMULADOS', s.totalPoints]
      ];

      rows.forEach(function (r) {
        const div = document.createElement('div');
        div.className = 'stat-row';
        const a = document.createElement('span');
        a.textContent = r[0];
        const b = document.createElement('span');
        b.textContent = r[1];
        div.appendChild(a);
        div.appendChild(b);
        body.appendChild(div);
      });
    },

    resetStats() {
      AP.StorageManager.resetStats();
      this.stats = AP.StorageManager.loadStats();
      this.renderStats();
      this.toast('Estatísticas zeradas.');
    },

    /* ---------------- Desafios ---------------- */
    renderChallenges() {
      const container = this.ui.challengeList;
      container.innerHTML = '';
      const self = this;
      const progress = this.challengeProgress;

      CHALLENGES.forEach(function (ch) {
        const card = document.createElement('div');
        card.className = 'challenge-card';
        if (progress[ch.id]) card.classList.add('done');

        const h = document.createElement('h3');
        h.textContent = ch.title + (progress[ch.id] ? ' ✔' : '');
        const p = document.createElement('p');
        p.textContent = ch.desc;

        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.textContent = progress[ch.id] ? 'JOGAR NOVAMENTE' : 'INICIAR DESAFIO';
        btn.addEventListener('click', function () {
          self.audio.play('button');
          self.startChallenge(ch.id);
        });

        card.appendChild(h);
        card.appendChild(p);
        card.appendChild(btn);
        container.appendChild(card);
      });
    },

    startChallenge(id) {
      const ch = CHALLENGES.find(function (c) { return c.id === id; });
      if (!ch) return;
      this.currentChallenge = ch;
      this.startMatch(Object.assign({}, ch.config));
      this.toast(ch.title);
    },

    /* ---------------- Configurações ---------------- */
    applySettingFromChip(kind, value) {
      const s = this.settings;
      switch (kind) {
        case 'theme': s.theme = value; break;
        case 'lang': s.lang = value; break;
        case 'sound': s.sound = (value === 'on'); break;
        case 'vibration': s.vibration = (value === 'on'); break;
        case 'speed': s.speed = value; break;
        case 'tileSize': s.tileSize = value; break;
        case 'contrast': s.contrast = (value === 'on'); break;
        case 'fontScale': s.fontScale = parseFloat(value); break;
        default: break;
      }
      AP.StorageManager.saveSettings(s);
      this.applySettings();
    },

    applySettings() {
      const s = this.settings;
      const body = document.body;

      body.classList.toggle('theme-dark', s.theme === 'dark');
      body.classList.toggle('theme-light', s.theme === 'light');
      body.classList.toggle('contrast-high', !!s.contrast);

      const speedMap = { fast: 140, normal: 260, slow: 460 };
      document.documentElement.style.setProperty('--anim', (speedMap[s.speed] || 260) + 'ms');

      const aiSpeedMap = { fast: 450, normal: 850, slow: 1400 };
      s.aiSpeed = aiSpeedMap[s.speed] || 850;

      document.documentElement.style.setProperty('--font-scale', String(s.fontScale));
      document.documentElement.dataset.tileSize = s.tileSize || 'normal';

      this.audio.setEnabled(s.sound);
      if (this.ui.btnSound) this.ui.btnSound.textContent = s.sound ? '🔊' : '🔇';
      document.documentElement.lang = s.lang === 'pt' ? 'pt-BR' : (s.lang === 'es' ? 'es' : 'en');
    },

    syncSettingsChips() {
      const s = this.settings;
      this.selectChip('setTheme', s.theme);
      this.selectChip('setLang', s.lang);
      this.selectChip('setSound', s.sound ? 'on' : 'off');
      this.selectChip('setVibration', s.vibration ? 'on' : 'off');
      this.selectChip('setSpeed', s.speed);
      this.selectChip('setTileSize', s.tileSize);
      this.selectChip('setContrast', s.contrast ? 'on' : 'off');
      this.selectChip('setFontScale', String(s.fontScale));
    },

    toggleSound() {
      this.settings.sound = !this.settings.sound;
      AP.StorageManager.saveSettings(this.settings);
      this.audio.setEnabled(this.settings.sound);
      this.ui.btnSound.textContent = this.settings.sound ? '🔊' : '🔇';
      this.selectChip('setSound', this.settings.sound ? 'on' : 'off');
      if (this.settings.sound) this.audio.play('button');
    },

    /* ---------------- Vibração ---------------- */
    vibrate(pattern) {
      if (!this.settings.vibration) return;
      if (global.navigator && typeof global.navigator.vibrate === 'function') {
        try { global.navigator.vibrate(pattern); } catch (e) { /* ignorado */ }
      }
    },

    /* ---------------- PWA ---------------- */
    handleInstallAvailability(available) {
      this.ui.btnInstall.hidden = !available || AP.PWAManager.isStandalone();
    },

    installPWA() {
      const self = this;
      if (AP.PWAManager.canInstall()) {
        AP.PWAManager.promptInstall().then(function (accepted) {
          if (accepted) self.toast('AP DOMINÓ instalado!');
        });
        return;
      }
      if (AP.PWAManager.isIOS()) {
        this.toast('No iPhone: toque em Compartilhar → Adicionar à Tela de Início.');
      } else {
        this.toast('Use o menu do navegador → "Instalar aplicativo".');
      }
    },

    /* ---------------- Toast ---------------- */
    toast(text) {
      const el = this.ui.toast;
      el.textContent = text;
      el.hidden = false;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(function () { el.hidden = true; }, 2400);
    }
  };

  /* Helper para evitar ReferenceError no cálculo de dupla */
  function HUMAN_TEAM_CHECK(b) { return b.index; }

  AP.App = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { App.init(); });
  } else {
    App.init();
  }

})(window);