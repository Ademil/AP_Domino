/* ===================================================================
   AP DOMINÓ — game-engine.js
   Núcleo de regras. Toda alteração de estado passa por aqui.
   A interface NUNCA altera pontuação, turno ou propriedade de peças.
   =================================================================== */
(function (global) {
  'use strict';

  const AP = (global.AP = global.AP || {});

  const DEFAULT_CONFIG = {
    mode: 'ai',              // classic | ai | duo | training | challenge
    playerCount: 2,
    humanCount: 1,           // 1, 2 ou 3
    humanNames: [],          // nomes personalizados dos humanos (strings)
    difficulty: 'medium',
    targetScore: 100,
    tilesPerPlayer: 7
  };

  class GameEngine {
    constructor() {
      this.listeners = {};
      this.state = null;
      this.config = Object.assign({}, DEFAULT_CONFIG);
    }

    /* ------------------ Eventos ------------------ */
    on(event, handler) {
      (this.listeners[event] = this.listeners[event] || []).push(handler);
      return this;
    }
    off(event, handler) {
      const list = this.listeners[event];
      if (!list) return this;
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
      return this;
    }
    emit(event, payload) {
      (this.listeners[event] || []).forEach(function (h) {
        try { h(payload); } catch (e) { /* isolamento */ }
      });
    }

    /* ------------------ Criação da partida ------------------ */
    newMatch(config) {
      this.config = Object.assign({}, DEFAULT_CONFIG, config || {});

      const n = this.config.playerCount;
      const humanCount = Math.max(1, Math.min(this.config.humanCount || 1, n));
      this.config.humanCount = humanCount;

      const rawNames = Array.isArray(this.config.humanNames) ? this.config.humanNames : [];

      const isDuo = this.config.mode === 'duo' && n === 4;
      const players = [];

      // --- Nomes dos jogadores ---
      const names = [];
      if (humanCount === 1) {
        const nm1 = (rawNames[0] || '').trim();
        names.push(nm1 || 'VOCÊ');
        for (let i = 1; i < n; i++) names.push('IA ' + i);
      } else {
        for (let i = 0; i < humanCount; i++) {
          const nm = (rawNames[i] || '').trim();
          names.push(nm || ('JOGADOR ' + (i + 1)));
        }
        for (let i = 0; i < n - humanCount; i++) names.push('IA ' + (i + 1));
      }

      // --- Times (apenas em duplas) ---
      function teamFor(i) {
        if (!isDuo) return null;
        // 2 humanos em duplas: humanos formam a dupla 0
        if (humanCount === 2 && n === 4) return (i < 2) ? 0 : 1;
        // 3 humanos: sem duplas (o modo é desativado na UI)
        return i % 2;
      }

      for (let i = 0; i < n; i++) {
        players.push(new AP.Player(i, names[i], {
          isAI: i >= humanCount,
          difficulty: this.config.difficulty,
          team: teamFor(i)
        }));
      }

      this.state = {
        phase: 'idle',
        mode: this.config.mode,
        humanCount: humanCount,
        players: players,
        boneyard: [],
        chain: [],
        leftEnd: null,
        rightEnd: null,
        currentPlayer: 0,
        roundNumber: 1,
        roundStarter: 0,
        targetScore: this.config.targetScore,
        scores: new Array(n).fill(0),
        consecutivePasses: 0,
        turnCount: 0,
        history: [],
        lastMove: null,
        lastRoundResult: null,
        stats: { tilesPlayed: 0, draws: 0, passes: 0 },
        roundStats: null,
        startedAt: Date.now(),
        undoStack: []
      };

      this.startRound();
      return this.state;
    }

    /* ------------------ Início de rodada ------------------ */
    startRound() {
      const s = this.state;
      if (!s) return null;

      const tiles = AP.DominoSet.createFullSet();
      AP.DominoSet.shuffle(tiles);

      const n = s.players.length;
      const perPlayer = this.config.tilesPerPlayer || AP.DominoSet.TILES_PER_HAND;

      s.players.forEach(function (p) { p.hand = []; p.passedLast = false; });
      s.boneyard = [];
      s.chain = [];
      s.leftEnd = null;
      s.rightEnd = null;
      s.consecutivePasses = 0;
      s.turnCount = 0;
      s.history = [];
      s.lastMove = null;
      s.undoStack = [];
      s.phase = 'playing';
      s.roundStats = { plays: {}, draws: {}, passes: {}, startedAt: Date.now() };
      s.players.forEach(function (p) {
        s.roundStats.plays[p.index] = 0;
        s.roundStats.draws[p.index] = 0;
        s.roundStats.passes[p.index] = 0;
      });

      const dealt = AP.DominoSet.deal(tiles, n, perPlayer);
      dealt.hands.forEach(function (hand, idx) {
        hand.forEach(function (t) { s.players[idx].addTile(t); });
      });
      s.boneyard = dealt.boneyard;

      s.players.forEach(function (p) { p.sortHand(); });

      let starter = 0;
      let bestValue = -1;
      s.players.forEach(function (p) {
        p.hand.forEach(function (t) {
          const isDouble = t.left === t.right;
          const value = isDouble ? (100 + t.left) : (t.left + t.right);
          if (value > bestValue) { bestValue = value; starter = p.index; }
        });
      });

      s.currentPlayer = starter;
      s.roundStarter = starter;

      this.emit('roundStart', { round: s.roundNumber, starter: starter });
      return s;
    }

    nextRound() {
      if (!this.state) return false;
      if (this.isMatchOver()) return false;
      this.state.roundNumber++;
      this.startRound();
      return true;
    }

    /* ------------------ Consultas ------------------ */
    getMoveOptions(playerIndex) {
      const s = this.state;
      if (!s || s.phase !== 'playing') return [];
      const player = s.players[playerIndex];
      if (!player) return [];

      const options = [];

      if (s.chain.length === 0) {
        player.hand.forEach(function (t) {
          options.push({ tileId: t.id, side: 'first' });
        });
        return options;
      }

      const L = s.leftEnd;
      const R = s.rightEnd;
      player.hand.forEach(function (t) {
        if (t.left === L || t.right === L) options.push({ tileId: t.id, side: 'left' });
        if (t.left === R || t.right === R) options.push({ tileId: t.id, side: 'right' });
      });
      return options;
    }

    getTileOptions(playerIndex, tileId) {
      return this.getMoveOptions(playerIndex).filter(function (o) {
        return o.tileId === tileId;
      });
    }

    canPlay(playerIndex) {
      return this.getMoveOptions(playerIndex).length > 0;
    }

    isBlocked() {
      const s = this.state;
      if (!s || s.phase !== 'playing') return false;
      if (s.boneyard.length > 0) return false;
      const self = this;
      return s.players.every(function (p) { return self.getMoveOptions(p.index).length === 0; });
    }

    isMatchOver() {
      const s = this.state;
      if (!s) return false;
      const target = s.targetScore;

      const hasTeams = s.players.some(function (p) { return p.team !== null; });
      if (hasTeams) {
        const teamTotals = {};
        s.players.forEach(function (p) {
          teamTotals[p.team] = (teamTotals[p.team] || 0) + s.scores[p.index];
        });
        return Object.keys(teamTotals).some(function (k) { return teamTotals[k] >= target; });
      }
      return s.scores.some(function (v) { return v >= target; });
    }

    getScoreboard() {
      const s = this.state;
      const hasTeams = s.players.some(function (p) { return p.team !== null; });
      const teamTotals = {};
      if (hasTeams) {
        s.players.forEach(function (p) {
          teamTotals[p.team] = (teamTotals[p.team] || 0) + s.scores[p.index];
        });
      }
      return s.players.map(function (p) {
        return {
          index: p.index,
          name: p.name,
          score: s.scores[p.index],
          teamScore: hasTeams ? teamTotals[p.team] : null,
          team: p.team,
          tiles: p.hand.length,
          isAI: p.isAI
        };
      });
    }

    /* ------------------ Ações ------------------ */
    playTile(playerIndex, tileId, side) {
      const s = this.state;
      if (!s || s.phase !== 'playing') return { ok: false, error: 'PARTIDA_ENCERRADA' };
      if (playerIndex !== s.currentPlayer) return { ok: false, error: 'FORA_DO_TURNO' };

      const player = s.players[playerIndex];
      const tile = player.getTile(tileId);
      if (!tile) return { ok: false, error: 'PECA_INEXISTENTE' };

      const options = this.getTileOptions(playerIndex, tileId);
      if (options.length === 0) return { ok: false, error: 'JOGADA_INVALIDA' };

      let chosen = options[0];
      if (side) {
        const match = options.find(function (o) { return o.side === side; });
        if (!match) return { ok: false, error: 'LADO_INVALIDO' };
        chosen = match;
      }

      s.undoStack.push(this.snapshot());
      if (s.undoStack.length > 30) s.undoStack.shift();

      player.removeTile(tileId);
      tile.played = true;

      if (s.chain.length === 0) {
        s.chain.push({ tileId: tile.id, left: tile.left, right: tile.right, owner: playerIndex });
        s.leftEnd = tile.left;
        s.rightEnd = tile.right;
      } else if (chosen.side === 'left') {
        const endValue = s.leftEnd;
        const outward = (tile.left === endValue) ? tile.right : tile.left;
        s.chain.unshift({ tileId: tile.id, left: outward, right: endValue, owner: playerIndex });
        s.leftEnd = outward;
      } else {
        const endValue = s.rightEnd;
        const outward = (tile.left === endValue) ? tile.right : tile.left;
        s.chain.push({ tileId: tile.id, left: endValue, right: outward, owner: playerIndex });
        s.rightEnd = outward;
      }

      s.consecutivePasses = 0;
      s.turnCount++;
      s.stats.tilesPlayed++;
      s.roundStats.plays[playerIndex]++;
      s.lastMove = {
        playerIndex: playerIndex,
        tileId: tile.id,
        side: chosen.side,
        values: [tile.left, tile.right]
      };
      s.history.push({
        type: 'play',
        player: playerIndex,
        playerName: player.name,
        tileId: tile.id,
        side: chosen.side
      });

      this.emit('play', s.lastMove);

      if (player.hand.length === 0) {
        this.endRound({ reason: 'EMPTY_HAND', winner: playerIndex });
        return { ok: true, roundEnded: true };
      }

      if (this.isBlocked()) {
        this.endRound({ reason: 'BLOCKED' });
        return { ok: true, roundEnded: true };
      }

      this.advanceTurn();
      return { ok: true };
    }

    drawTile(playerIndex) {
      const s = this.state;
      if (!s || s.phase !== 'playing') return { ok: false, error: 'PARTIDA_ENCERRADA' };
      if (playerIndex !== s.currentPlayer) return { ok: false, error: 'FORA_DO_TURNO' };
      if (this.canPlay(playerIndex)) return { ok: false, error: 'PODE_JOGAR' };
      if (s.boneyard.length === 0) return { ok: false, error: 'MONTE_VAZIO' };

      const tile = s.boneyard.shift();
      s.players[playerIndex].addTile(tile);
      s.players[playerIndex].sortHand();
      s.stats.draws++;
      s.roundStats.draws[playerIndex]++;
      s.history.push({ type: 'draw', player: playerIndex, playerName: s.players[playerIndex].name });

      this.emit('draw', { playerIndex: playerIndex, tileId: tile.id, remaining: s.boneyard.length });
      return { ok: true, tileId: tile.id, remaining: s.boneyard.length };
    }

    pass(playerIndex) {
      const s = this.state;
      if (!s || s.phase !== 'playing') return { ok: false, error: 'PARTIDA_ENCERRADA' };
      if (playerIndex !== s.currentPlayer) return { ok: false, error: 'FORA_DO_TURNO' };
      if (this.canPlay(playerIndex)) return { ok: false, error: 'PODE_JOGAR' };
      if (s.boneyard.length > 0) return { ok: false, error: 'MONTE_COM_PECAS' };

      s.consecutivePasses++;
      s.stats.passes++;
      s.roundStats.passes[playerIndex]++;
      s.players[playerIndex].passedLast = true;
      s.history.push({ type: 'pass', player: playerIndex, playerName: s.players[playerIndex].name });

      this.emit('pass', { playerIndex: playerIndex });

      if (s.consecutivePasses >= s.players.length) {
        this.endRound({ reason: 'BLOCKED' });
        return { ok: true, roundEnded: true };
      }

      this.advanceTurn();
      return { ok: true };
    }

    advanceTurn() {
      const s = this.state;
      if (!s) return;
      s.currentPlayer = (s.currentPlayer + 1) % s.players.length;
    }

    /* ------------------ Fim de rodada ------------------ */
    endRound(result) {
      const s = this.state;
      if (!s || s.phase !== 'playing') return;
      s.phase = 'roundOver';

      let winnerIndex = (typeof result.winner === 'number') ? result.winner : null;
      const reason = result.reason;

      if (reason === 'BLOCKED') {
        let minPips = Infinity;
        s.players.forEach(function (p) {
          const v = p.totalPips();
          if (v < minPips) minPips = v;
        });
        const tied = s.players.filter(function (p) { return p.totalPips() === minPips; });

        if (tied.length === 1) {
          winnerIndex = tied[0].index;
        } else {
          const teams = new Set(tied.map(function (p) { return p.team; }));
          if (tied[0].team !== null && teams.size === 1) winnerIndex = tied[0].index;
          else winnerIndex = null;
        }
      }

      const detail = [];
      let points = 0;

      if (winnerIndex !== null) {
        const winnerTeam = s.players[winnerIndex].team;
        s.players.forEach(function (p) {
          if (p.index === winnerIndex) return;
          if (winnerTeam !== null && p.team === winnerTeam) return;
          const pips = p.totalPips();
          points += pips;
          detail.push({
            player: p.index, name: p.name, pips: pips,
            tiles: p.hand.map(function (t) { return t.id; })
          });
        });
        s.scores[winnerIndex] += points;
      } else {
        s.players.forEach(function (p) {
          detail.push({
            player: p.index, name: p.name, pips: p.totalPips(),
            tiles: p.hand.map(function (t) { return t.id; })
          });
        });
      }

      const roundResult = {
        round: s.roundNumber,
        reason: reason,
        winner: winnerIndex,
        points: points,
        detail: detail,
        scores: s.scores.slice(),
        scoreboard: this.getScoreboard(),
        roundStats: s.roundStats,
        hands: s.players.map(function (p) {
          return { index: p.index, name: p.name, tiles: p.hand.map(function (t) { return t.id; }) };
        })
      };

      s.lastRoundResult = roundResult;
      s.phase = 'roundOver';
      this.emit('roundOver', roundResult);
    }

    /* ------------------ Desfazer ------------------ */
    snapshot() {
      const s = this.state;
      return {
        chain: s.chain.map(function (c) { return Object.assign({}, c); }),
        leftEnd: s.leftEnd,
        rightEnd: s.rightEnd,
        currentPlayer: s.currentPlayer,
        consecutivePasses: s.consecutivePasses,
        turnCount: s.turnCount,
        historyLength: s.history.length,
        boneyard: s.boneyard.map(function (t) { return t.id; }),
        players: s.players.map(function (p) {
          return { index: p.index, hand: p.hand.map(function (t) { return t.id; }) };
        })
      };
    }

    undo() {
      const s = this.state;
      if (!s || !s.undoStack || s.undoStack.length === 0) return { ok: false, error: 'SEM_HISTORICO' };
      const snap = s.undoStack.pop();

      const allTiles = {};
      AP.DominoSet.createFullSet().forEach(function (t) { allTiles[t.id] = t; });

      s.chain = snap.chain.map(function (c) { return Object.assign({}, c); });
      s.leftEnd = snap.leftEnd;
      s.rightEnd = snap.rightEnd;
      s.currentPlayer = snap.currentPlayer;
      s.consecutivePasses = snap.consecutivePasses;
      s.turnCount = snap.turnCount;
      s.history = s.history.slice(0, snap.historyLength);
      s.phase = 'playing';

      s.players.forEach(function (p, i) {
        p.hand = snap.players[i].hand.map(function (id) {
          const t = allTiles[id];
          return { id: t.id, left: t.left, right: t.right, played: false, owner: i };
        });
      });

      s.boneyard = snap.boneyard.map(function (id) {
        const t = allTiles[id];
        return { id: t.id, left: t.left, right: t.right, played: false, owner: null };
      });

      this.emit('undo', {});
      return { ok: true };
    }

    /* ------------------ Serialização ------------------ */
    serialize() {
      const s = this.state;
      if (!s) return null;
      return {
        version: 1,
        config: Object.assign({}, this.config),
        savedAt: Date.now(),
        state: {
          phase: s.phase,
          mode: s.mode,
          humanCount: s.humanCount,
          roundNumber: s.roundNumber,
          roundStarter: s.roundStarter,
          targetScore: s.targetScore,
          currentPlayer: s.currentPlayer,
          consecutivePasses: s.consecutivePasses,
          turnCount: s.turnCount,
          leftEnd: s.leftEnd,
          rightEnd: s.rightEnd,
          scores: s.scores.slice(),
          stats: Object.assign({}, s.stats),
          roundStats: s.roundStats,
          history: s.history.slice(),
          chain: s.chain.map(function (c) { return Object.assign({}, c); }),
          boneyard: s.boneyard.map(function (t) {
            return { id: t.id, left: t.left, right: t.right };
          }),
          players: s.players.map(function (p) { return p.toJSON(); }),
          lastMove: s.lastMove
        }
      };
    }

    restore(payload) {
      if (!payload || !payload.state) return false;
      const d = payload.state;
      this.config = Object.assign({}, DEFAULT_CONFIG, payload.config || {});

      const players = d.players.map(function (p) { return AP.Player.fromJSON(p); });

      this.state = {
        phase: 'playing',
        mode: d.mode,
        humanCount: d.humanCount || 1,
        players: players,
        boneyard: (d.boneyard || []).map(function (t) {
          return { id: t.id, left: t.left, right: t.right, played: false, owner: null };
        }),
        chain: (d.chain || []).map(function (c) { return Object.assign({}, c); }),
        leftEnd: d.leftEnd,
        rightEnd: d.rightEnd,
        currentPlayer: d.currentPlayer,
        roundNumber: d.roundNumber,
        roundStarter: d.roundStarter,
        targetScore: d.targetScore,
        scores: (d.scores || []).slice(),
        consecutivePasses: d.consecutivePasses || 0,
        turnCount: d.turnCount || 0,
        history: d.history || [],
        lastMove: d.lastMove || null,
        lastRoundResult: null,
        stats: d.stats || { tilesPlayed: 0, draws: 0, passes: 0 },
        roundStats: d.roundStats || null,
        startedAt: Date.now(),
        undoStack: []
      };
      return true;
    }
  }

  AP.GameEngine = GameEngine;

})(window);