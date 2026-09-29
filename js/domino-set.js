/* ===================================================================
   AP DOMINÓ — domino-set.js
   Criação, embaralhamento e distribuição das 28 peças.
   =================================================================== */
(function (global) {
  'use strict';

  const AP = (global.AP = global.AP || {});

  const MAX_PIP = 6;
  const TILES_PER_HAND = 7;

  /**
   * Cria uma peça canônica (left <= right).
   * @returns {{id:string,left:number,right:number,played:boolean,owner:(number|null)}}
   */
  function createTile(a, b) {
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    return {
      id: low + '-' + high,
      left: low,
      right: high,
      played: false,
      owner: null
    };
  }

  const DominoSet = {
    MAX_PIP: MAX_PIP,
    TILES_PER_HAND: TILES_PER_HAND,

    /** Gera as 28 peças do conjunto 0-0 até 6-6. */
    createFullSet() {
      const tiles = [];
      for (let a = 0; a <= MAX_PIP; a++) {
        for (let b = a; b <= MAX_PIP; b++) {
          tiles.push(createTile(a, b));
        }
      }
      return tiles;
    },

    /** Embaralhamento Fisher-Yates (in-place). */
    shuffle(tiles) {
      for (let i = tiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = tiles[i];
        tiles[i] = tiles[j];
        tiles[j] = tmp;
      }
      return tiles;
    },

    /**
     * Distribui as peças.
     * @returns {{hands: Array<Array>, boneyard: Array}}
     */
    deal(tiles, playerCount, tilesPerPlayer) {
      const perPlayer = tilesPerPlayer || TILES_PER_HAND;
      const hands = [];
      for (let i = 0; i < playerCount; i++) hands.push([]);

      let cursor = 0;
      for (let round = 0; round < perPlayer; round++) {
        for (let p = 0; p < playerCount; p++) {
          if (cursor < tiles.length) hands[p].push(tiles[cursor++]);
        }
      }
      const boneyard = tiles.slice(cursor);
      return { hands, boneyard };
    },

    /**
     * Valida o conjunto: conta peças e detecta duplicatas.
     * Usado pelos testes automáticos.
     */
    validateSet(tiles) {
      const ids = new Set();
      let duplicates = 0;
      tiles.forEach(function (t) { if (ids.has(t.id)) duplicates++; else ids.add(t.id); });
      return { count: tiles.length, unique: ids.size, duplicates: duplicates };
    },

    /** Soma dos pontos de um conjunto de peças. */
    countPips(tiles) {
      return tiles.reduce(function (sum, t) { return sum + t.left + t.right; }, 0);
    }
  };

  AP.DominoSet = DominoSet;
  AP.createTile = createTile;

})(window);