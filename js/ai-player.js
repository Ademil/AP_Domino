/* ===================================================================
   AP DOMINÓ — ai-player.js
   Inteligência artificial com 4 níveis: easy, medium, hard, expert.
   A IA NUNCA acessa a mão de outros jogadores — apenas peças já
   jogadas, sua própria mão e o tamanho das mãos alheias.
   =================================================================== */
(function (global) {
  'use strict';

  const AP = (global.AP = global.AP || {});

  const WEIGHTS = {
    easy:   { selfFlex: 0,   pips: 0,   openness: 0,   doubleEarly: 0,   endgame: 0 },
    medium: { selfFlex: 2.0, pips: 0.6, openness: 0.3, doubleEarly: 0.5, endgame: 0.3 },
    hard:   { selfFlex: 3.2, pips: 0.9, openness: 0.7, doubleEarly: 1.0, endgame: 1.2 },
    expert: { selfFlex: 3.5, pips: 1.0, openness: 0.9, doubleEarly: 1.1, endgame: 1.5 }
  };

  /** Embaralha uma cópia do array. */
  function shuffledCopy(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = copy[i]; copy[i] = copy[j]; copy[j] = t;
    }
    return copy;
  }

  /**
   * Calcula as extremidades resultantes se `tile` for jogada no lado `side`.
   * @returns {{left:number,right:number}}
   */
  function resultEnds(state, tile, side) {
    if (state.chain.length === 0) {
      return { left: tile.left, right: tile.right };
    }
    if (side === 'left') {
      const endValue = state.leftEnd;
      const outward = (tile.left === endValue) ? tile.right : tile.left;
      return { left: outward, right: state.rightEnd };
    }
    const endValue = state.rightEnd;
    const outward = (tile.left === endValue) ? tile.right : tile.left;
    return { left: state.leftEnd, right: outward };
  }

  /** Quantas peças da mão encaixam nas extremidades informadas. */
  function flexCount(hand, ends, ignoreTileId) {
    let n = 0;
    for (let i = 0; i < hand.length; i++) {
      const t = hand[i];
      if (t.id === ignoreTileId) continue;
      if (t.left === ends.left || t.right === ends.left ||
          t.left === ends.right || t.right === ends.right) n++;
    }
    return n;
  }

  /** Peças ainda não vistas pelo jogador (fora da mão e fora da mesa). */
  function unseenTiles(engine, playerIndex) {
    const state = engine.state;
    const myIds = new Set();
    state.players[playerIndex].hand.forEach(function (t) { myIds.add(t.id); });
    const playedIds = new Set();
    state.chain.forEach(function (c) { playedIds.add(c.tileId); });
    return AP.DominoSet.createFullSet().filter(function (t) {
      return !myIds.has(t.id) && !playedIds.has(t.id);
    });
  }

  /** Contagem de ocorrências de cada valor nas peças não vistas. */
  function unseenValueCounts(engine, playerIndex) {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    unseenTiles(engine, playerIndex).forEach(function (t) {
      counts[t.left]++; counts[t.right]++;
    });
    return counts;
  }

  class AIPlayer {
    constructor(difficulty) {
      this.difficulty = difficulty || 'medium';
    }

    /**
     * Decide a ação da IA para o jogador informado.
     * @returns {{action:'play'|'draw'|'pass', tileId?:string, side?:string}}
     */
    decide(engine, playerIndex) {
      const options = engine.getMoveOptions(playerIndex);

      if (options.length === 0) {
        if (engine.state.boneyard.length > 0) return { action: 'draw' };
        return { action: 'pass' };
      }

      let chosen;
      switch (this.difficulty) {
        case 'easy':   chosen = this.pickEasy(options); break;
        case 'medium': chosen = this.pickScored(engine, playerIndex, options, WEIGHTS.medium, 0.9); break;
        case 'hard':   chosen = this.pickScored(engine, playerIndex, options, WEIGHTS.hard, 0.15); break;
        case 'expert': chosen = this.pickExpert(engine, playerIndex, options); break;
        default:       chosen = options[0];
      }

      return { action: 'play', tileId: chosen.tileId, side: chosen.side };
    }

    /* ------------------- FÁCIL ------------------- */
    pickEasy(options) {
      return options[Math.floor(Math.random() * options.length)];
    }

    /* ------------- MÉDIO / DIFÍCIL ------------- */
    pickScored(engine, playerIndex, options, weights, jitter) {
      let best = null;
      let bestScore = -Infinity;
      for (let i = 0; i < options.length; i++) {
        let score = this.scoreOption(engine, playerIndex, options[i], weights);
        if (jitter > 0) score += (Math.random() - 0.5) * 2 * jitter * Math.abs(score || 1);
        if (score > bestScore) { bestScore = score; best = options[i]; }
      }
      return best || options[0];
    }

    /* ------------- HEURÍSTICA BASE ------------- */
    scoreOption(engine, playerIndex, option, weights) {
      const state = engine.state;
      const player = state.players[playerIndex];
      const tile = player.getTile(option.tileId);
      if (!tile) return -Infinity;

      const ends = resultEnds(state, tile, option.side);
      const selfFlex = flexCount(player.hand, ends, tile.id);
      const counts = unseenValueCounts(engine, playerIndex);
      const openness = counts[ends.left] + counts[ends.right];
      const pips = tile.left + tile.right;
      const isDouble = tile.left === tile.right;
      const handSize = player.hand.length;

      let score = 0;
      score += weights.selfFlex * selfFlex;
      score += weights.pips * pips;
      score -= weights.openness * openness;
      score += weights.doubleEarly * (isDouble ? 1 : 0);

      // No fim do jogo, bloquear o adversário vale mais.
      if (handSize <= 3) score -= weights.endgame * openness;

      // Evita deixar o parceiro sem jogada nas duplas.
      if (player.team !== null) {
        const partner = state.players.find(function (p) {
          return p.team === player.team && p.index !== playerIndex;
        });
        if (partner && partner.hand.length <= 2) {
          const partnerLikely = counts[ends.left] + counts[ends.right];
          score += 0.25 * partnerLikely;
        }
      }

      return score;
    }

    /* ---------------- EXPERT ----------------
       Combina a heurística "hard" com amostragem Monte Carlo:
       são geradas mãos hipotéticas para os adversários a partir das
       peças não vistas e mede-se quantos conseguem responder.        */
    pickExpert(engine, playerIndex, options) {
      const SAMPLES = 12;
      const state = engine.state;
      const pool = unseenTiles(engine, playerIndex);
      let best = null;
      let bestScore = -Infinity;

      for (let i = 0; i < options.length; i++) {
        const option = options[i];
        let total = this.scoreOption(engine, playerIndex, option, WEIGHTS.expert);

        for (let s = 0; s < SAMPLES; s++) {
          const shuffled = shuffledCopy(pool);
          total += this.sampleResponse(state, playerIndex, option, shuffled);
        }

        const avg = total / (SAMPLES + 1);
        if (avg > bestScore) { bestScore = avg; best = option; }
      }
      return best || options[0];
    }

    /** Avalia quantos adversários conseguem responder (amostra hipotética). */
    sampleResponse(state, playerIndex, option, samplePool) {
      const player = state.players[playerIndex];
      const tile = player.getTile(option.tileId);
      if (!tile) return 0;

      const ends = resultEnds(state, tile, option.side);
      const myTeam = player.team;

      let cursor = 0;
      let opponentsPlayable = 0;
      let opponentsCounted = 0;

      for (let i = 0; i < state.players.length; i++) {
        const p = state.players[i];
        if (p.index === playerIndex) continue;
        if (myTeam !== null && p.team === myTeam) continue; // parceiro não conta

        opponentsCounted++;
        const size = p.hand.length;
        let canPlay = false;
        for (let k = 0; k < size && cursor < samplePool.length; k++, cursor++) {
          const t = samplePool[cursor];
          if (t.left === ends.left || t.right === ends.left ||
              t.left === ends.right || t.right === ends.right) {
            canPlay = true;
          }
        }
        if (canPlay) opponentsPlayable++;
      }

      if (opponentsCounted === 0) return 0;
      // Penaliza quando os adversários têm resposta; recompensa o bloqueio.
      return -2.4 * (opponentsPlayable / opponentsCounted);
    }
  }

  AP.AIPlayer = AIPlayer;

})(window);