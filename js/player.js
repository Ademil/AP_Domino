/* ===================================================================
   AP DOMINÓ — player.js
   Representa um jogador (humano ou IA) e sua mão.
   =================================================================== */
(function (global) {
  'use strict';

  const AP = (global.AP = global.AP || {});

  class Player {
    /**
     * @param {number} index  posição na mesa
     * @param {string} name   nome exibido
     * @param {{isAI?:boolean,difficulty?:string,team?:(number|null)}} [options]
     */
    constructor(index, name, options) {
      const opts = options || {};
      this.index = index;
      this.name = name;
      this.isAI = !!opts.isAI;
      this.difficulty = opts.difficulty || 'medium';
      this.team = (typeof opts.team === 'number') ? opts.team : null;
      this.hand = [];
      this.passedLast = false;
    }

    addTile(tile) {
      tile.owner = this.index;
      tile.played = false;
      this.hand.push(tile);
      return tile;
    }

    removeTile(tileId) {
      for (let i = 0; i < this.hand.length; i++) {
        if (this.hand[i].id === tileId) return this.hand.splice(i, 1)[0];
      }
      return null;
    }

    getTile(tileId) {
      for (let i = 0; i < this.hand.length; i++) {
        if (this.hand[i].id === tileId) return this.hand[i];
      }
      return null;
    }

    hasTile(tileId) { return this.getTile(tileId) !== null; }

    count() { return this.hand.length; }

    totalPips() {
      let sum = 0;
      for (let i = 0; i < this.hand.length; i++) sum += this.hand[i].left + this.hand[i].right;
      return sum;
    }

    /** Ordena a mão da maior para a menor pontuação. */
    sortHand() {
      this.hand.sort(function (a, b) {
        const pa = a.left + a.right;
        const pb = b.left + b.right;
        if (pb !== pa) return pb - pa;
        return b.left - a.left;
      });
      return this.hand;
    }

    /** Peças da mão que combinam com pelo menos uma extremidade. */
    playableTiles(leftEnd, rightEnd) {
      return this.hand.filter(function (t) {
        return t.left === leftEnd || t.right === leftEnd ||
               t.left === rightEnd || t.right === rightEnd;
      });
    }

    toJSON() {
      return {
        index: this.index,
        name: this.name,
        isAI: this.isAI,
        difficulty: this.difficulty,
        team: this.team,
        hand: this.hand.map(function (t) {
          return { id: t.id, left: t.left, right: t.right };
        })
      };
    }

    static fromJSON(data) {
      const p = new Player(data.index, data.name, {
        isAI: data.isAI, difficulty: data.difficulty, team: data.team
      });
      (data.hand || []).forEach(function (t) {
        p.hand.push({ id: t.id, left: t.left, right: t.right, played: false, owner: data.index });
      });
      return p;
    }
  }

  AP.Player = Player;

})(window);