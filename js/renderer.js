/* ===================================================================
   AP DOMINÓ — renderer.js
   Desenho da mesa, das peças, dos marcadores e da mão do jogador.

   Regras:
   - Peças horizontais: 64 × 32 · verticais (só carretas): 32 × 64
   - Sem "turnos" arbitrários
   - Linhas pares (0, 2, 4...) vão da esquerda para a direita
   - Linhas ímpares (1, 3, 5...) voltam da direita para a esquerda
     e têm as metades ESPELHADAS para manter o encaixe visual
   - Sem etiquetas de jogador sobre as peças
   =================================================================== */
(function (global) {
  'use strict';

  const AP = (global.AP = global.AP || {});

  /* Mapa de pontos para peças VERTICAIS (2 colunas × 3 linhas). */
  const PIP_MAP_V = {
    0: [],
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };

  /* Mapa de pontos para peças HORIZONTAIS (3 colunas × 2 linhas).
     Só o 6 muda — os outros são simétricos. */
  const PIP_MAP_H = {
    0: [],
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 1, 2, 6, 7, 8]
  };

  const NATURAL = {
    TILE_W: 64,   // largura da peça horizontal (== .tile-h)
    TILE_H: 32,   // altura  da peça horizontal
    V_W: 32,      // largura da peça vertical = altura da horizontal
    V_H: 64,      // altura  da peça vertical = largura da horizontal
    GAP: 1,       // espaço entre peças
    PAD: 26       // margem interna (reserva para a moldura)
  };

  /**
   * Constrói o bloco de 9 células (3x3) com os pontos correspondentes.
   * @param {number} value - valor da metade (0 a 6)
   * @param {string} orientation - 'h' ou 'v'
   */
  function buildPips(value, orientation) {
    const wrap = document.createElement('div');
    wrap.className = 'pips';
    const map = (orientation === 'h') ? PIP_MAP_H : PIP_MAP_V;
    const positions = map[value] || [];

    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('span');
      cell.className = 'pip-cell';
      if (positions.indexOf(i) !== -1) {
        const dot = document.createElement('i');
        dot.className = 'pip';
        cell.appendChild(dot);
      }
      wrap.appendChild(cell);
    }
    return wrap;
  }

  /**
   * Constrói a "cara" da peça (metade A + divisor + metade B) dentro de
   * um wrapper `.tile-face` que ocupa toda a área do elemento `.tile`.
   * @param {Array<number>} values - [valorEsquerda, valorDireita]
   * @param {string} orientation - 'h' ou 'v'
   */
  function buildTileFace(values, orientation) {
    const face = document.createElement('div');
    face.className = 'tile-face';

    const halfA = document.createElement('div');
    halfA.className = 'tile-half';
    halfA.appendChild(buildPips(values[0], orientation));

    const divider = document.createElement('div');
    divider.className = 'tile-divider';

    const halfB = document.createElement('div');
    halfB.className = 'tile-half';
    halfB.appendChild(buildPips(values[1], orientation));

    face.appendChild(halfA);
    face.appendChild(divider);
    face.appendChild(halfB);
    return face;
  }

  class Renderer {
    constructor(engine, elements) {
      this.engine = engine;
      this.els = elements;

      this.boardTiles = new Map();   // tileId → elemento
      this.endMarkers = { left: null, right: null, first: null };
      this.selectedTileId = null;
      this.validSides = [];
      this.onTileClick = null;
      this.onSideClick = null;
      this.layoutCache = null;

      const self = this;
      this._onResize = function () { self.renderBoard(true); };
      window.addEventListener('resize', this._onResize);
      window.addEventListener('orientationchange', this._onResize);
    }

    destroy() {
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('orientationchange', this._onResize);
    }

    /* ==================== MÃO DO JOGADOR ==================== */
    renderHand(playerIndex) {
      const container = this.els.playerHand;
      container.innerHTML = '';
      const s = this.engine.state;
      if (!s) return;

      const player = s.players[playerIndex];
      if (!player || player.hand.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'hand-empty';
        empty.textContent = 'Mão vazia.';
        container.appendChild(empty);
        return;
      }

      const isMyTurn = (s.currentPlayer === playerIndex && s.phase === 'playing');
      const options = isMyTurn ? this.engine.getMoveOptions(playerIndex) : [];
      const playableIds = new Set(options.map(function (o) { return o.tileId; }));

      const self = this;
      player.hand.forEach(function (tile) {
        const el = document.createElement('div');
        el.className = 'tile tile-v';
        el.dataset.tileId = tile.id;
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-label', 'Peça ' + tile.left + ' por ' + tile.right +
          (playableIds.has(tile.id) ? ' — jogável' : ' — sem jogada'));

        if (self.selectedTileId === tile.id) el.classList.add('selected');
        if (isMyTurn && !playableIds.has(tile.id)) el.classList.add('unplayable');

        el.appendChild(buildTileFace([tile.left, tile.right], 'v'));

        el.addEventListener('click', function () {
          if (self.onTileClick) self.onTileClick(tile.id);
        });
        el.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            if (self.onTileClick) self.onTileClick(tile.id);
          }
        });

        container.appendChild(el);
      });
    }

    /** Substitui a mão por uma mensagem (usado no overlay "passe o aparelho"). */
    clearHand(message) {
      const container = this.els.playerHand;
      if (!container) return;
      container.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'hand-empty';
      empty.textContent = message || 'Aguardando...';
      container.appendChild(empty);
    }

    markTileInvalid(tileId) {
      const el = this.els.playerHand.querySelector('[data-tile-id="' + tileId + '"]');
      if (!el) return;
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
      setTimeout(function () { el.classList.remove('shake'); }, 380);
    }

    /* ==================== LAYOUT DA MESA ==================== */
    computeLayout(tileCount, availW, availH, chain) {
      const TILE_W = NATURAL.TILE_W;
      const TILE_H = NATURAL.TILE_H;
      const V_W    = NATURAL.V_W;
      const V_H    = NATURAL.V_H;
      const GAP    = NATURAL.GAP;
      const PAD    = NATURAL.PAD;

      const usableW = Math.max(180, availW - PAD * 2);
      const usableH = Math.max(120, availH - PAD * 2);

      if (tileCount === 0) {
        return {
          positions: [],
          totalW: TILE_W,
          totalH: TILE_H,
          scale: 1,
          offsetX: (availW - TILE_W) / 2,
          offsetY: (availH - TILE_H) / 2,
          TILE_W: TILE_W,
          TILE_H: TILE_H,
          perRow: 1,
          rows: 0
        };
      }

      // 1) Orientação: SOMENTE carretas são verticais
      const isVertical = [];
      const widths = [];
      for (let i = 0; i < tileCount; i++) {
        const c = chain[i];
        const isDouble = !!(c && c.left === c.right);
        isVertical.push(isDouble);
        widths.push(isDouble ? V_W : TILE_W);
      }

      // 2) Quebra de linhas (greedy, respeitando largura real)
      const rowsIdx = [];
      let currentRow = [];
      let currentRowWidth = 0;
      for (let i = 0; i < tileCount; i++) {
        const w = widths[i];
        const candidate = (currentRow.length === 0) ? w : (currentRowWidth + GAP + w);
        if (currentRow.length > 0 && candidate > usableW) {
          rowsIdx.push(currentRow);
          currentRow = [i];
          currentRowWidth = w;
        } else {
          currentRow.push(i);
          currentRowWidth = candidate;
        }
      }
      if (currentRow.length > 0) rowsIdx.push(currentRow);

      // 3) Dimensões reais de cada linha
      const rowWidths = rowsIdx.map(function (arr) {
        let w = 0;
        for (let k = 0; k < arr.length; k++) {
          w += widths[arr[k]];
          if (k < arr.length - 1) w += GAP;
        }
        return w;
      });

      const rowHeights = rowsIdx.map(function (arr) {
        let h = TILE_H;
        for (let k = 0; k < arr.length; k++) {
          if (isVertical[arr[k]]) h = Math.max(h, V_H);
        }
        return h;
      });

      const totalW = Math.max.apply(null, rowWidths);
      const totalH = rowHeights.reduce(function (a, b) { return a + b; }, 0) +
                     (rowsIdx.length - 1) * GAP;

      const scale = Math.min(1, usableW / totalW, usableH / totalH);
      const offsetX = (availW - totalW * scale) / 2;
      const offsetY = (availH - totalH * scale) / 2;

      // 4) Posições finais (serpentina)
      const positions = [];
      let yCursor = 0;

      for (let r = 0; r < rowsIdx.length; r++) {
        const rh = rowHeights[r];
        const rw = rowWidths[r];
        const goingRight = (r % 2 === 0);
        const arr = rowsIdx[r];

        let xCursor = 0;
        for (let k = 0; k < arr.length; k++) {
          const idx = arr[k];
          const w = widths[idx];
          const v = isVertical[idx];
          const tileH = v ? V_H : TILE_H;
          const yPos = yCursor + (rh - tileH) / 2;
          const xPos = goingRight ? xCursor : (rw - xCursor - w);

          positions[idx] = {
            x: xPos,
            y: yPos,
            isVertical: v,
            flipped: !goingRight   // ← espelha as metades nas linhas de retorno
          };

          xCursor += w + GAP;
        }
        yCursor += rh + GAP;
      }

      return {
        positions: positions,
        totalW: totalW,
        totalH: totalH,
        scale: scale,
        offsetX: offsetX,
        offsetY: offsetY,
        TILE_W: TILE_W,
        TILE_H: TILE_H,
        perRow: rowsIdx.length > 0 ? rowsIdx[0].length : 1,
        rows: rowsIdx.length
      };
    }

    /* ==================== TABULEIRO ==================== */
    renderBoard(forceRelayout) {
      const inner = this.els.boardInner;
      const viewport = this.els.boardViewport;
      const s = this.engine.state;
      if (!s) return;

      const chain = s.chain;
      const availW = viewport.clientWidth || 320;
      const availH = viewport.clientHeight || 240;

      const layout = this.computeLayout(Math.max(1, chain.length), availW, availH, chain);
      this.layoutCache = layout;

      inner.style.width = layout.totalW + 'px';
      inner.style.height = layout.totalH + 'px';
      inner.style.transform =
        'translate(' + layout.offsetX + 'px,' + layout.offsetY + 'px) scale(' + layout.scale + ')';

      if (forceRelayout) {
        this.boardTiles.forEach(function (el) {
          el.style.transition = 'none';
          void el.offsetWidth;
          el.style.transition = '';
        });
      }

      const seen = new Set();
      const self = this;

      chain.forEach(function (entry, i) {
        seen.add(entry.tileId);
        const pos = layout.positions[i];
        if (!pos) return;

        const isVertical = pos.isVertical;
        const flipped = pos.flipped;

        let el = self.boardTiles.get(entry.tileId);

        // Recria se a orientação mudou
        if (el) {
          const hasV = el.classList.contains('tile-v');
          if (hasV !== isVertical) {
            el.remove();
            self.boardTiles.delete(entry.tileId);
            el = null;
          }
        }

        if (!el) {
          el = document.createElement('div');
          el.className = 'tile ' + (isVertical ? 'tile-v' : 'tile-h') + ' tile-enter';
          el.dataset.tileId = entry.tileId;
          el.setAttribute('aria-label',
            'Peça na mesa ' + entry.left + ' por ' + entry.right +
            (entry.left === entry.right ? ' (carreta)' : ''));
          inner.appendChild(el);
          self.boardTiles.set(entry.tileId, el);
          setTimeout(function () { el.classList.remove('tile-enter'); }, 300);
        }

        // Reconstrói a "cara" se valores, orientação ou flip mudaram
        const faceKey = entry.left + '|' + entry.right + '|' +
                        (flipped ? 'F' : 'N') + '|' +
                        (isVertical ? 'V' : 'H');
        if (el.dataset.faceKey !== faceKey) {
          const oldFace = el.querySelector('.tile-face');
          if (oldFace) oldFace.remove();

          const faceValues = flipped
            ? [entry.right, entry.left]
            : [entry.left, entry.right];

          el.appendChild(buildTileFace(faceValues, isVertical ? 'v' : 'h'));
          el.dataset.faceKey = faceKey;
        }

        el.style.transform = 'translate(' + pos.x + 'px,' + pos.y + 'px)';
      });

      this.boardTiles.forEach(function (el, id) {
        if (!seen.has(id)) {
          el.remove();
          self.boardTiles.delete(id);
        }
      });

      this.renderEndMarkers(layout);
    }

    /* ==================== MARCADORES DE EXTREMIDADE ==================== */
    renderEndMarkers(layout) {
      const inner = this.els.boardInner;
      const s = this.engine.state;
      const self = this;

      Object.keys(this.endMarkers).forEach(function (key) {
        const m = self.endMarkers[key];
        if (m && m.parentNode) m.parentNode.removeChild(m);
        self.endMarkers[key] = null;
      });

      if (!s || s.phase !== 'playing') return;
      if (this.selectedTileId === null) return;
      if (this.validSides.length === 0) return;

      const TILE_W = layout.TILE_W;

      // Primeira peça: marcador único
      if (s.chain.length === 0) {
        if (this.validSides.indexOf('first') === -1) return;
        const marker = document.createElement('div');
        marker.className = 'end-marker';
        marker.textContent = '▶';
        marker.style.transform = 'translate(0px, 0px)';
        marker.setAttribute('role', 'button');
        marker.setAttribute('tabindex', '0');
        marker.setAttribute('aria-label', 'Colocar peça na mesa');
        marker.addEventListener('click', function () {
          if (self.onSideClick) self.onSideClick('first');
        });
        marker.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            if (self.onSideClick) self.onSideClick('first');
          }
        });
        inner.appendChild(marker);
        this.endMarkers.first = marker;
        return;
      }

      const firstPos = layout.positions[0];
      const lastPos = layout.positions[layout.positions.length - 1];
      if (!firstPos || !lastPos) return;

      if (this.validSides.indexOf('left') !== -1) {
        const m = document.createElement('div');
        m.className = 'end-marker';
        m.textContent = '◀';
        // Sempre à esquerda visual da primeira peça da cadeia
        m.style.transform = 'translate(' + (firstPos.x - TILE_W - 8) + 'px,' + firstPos.y + 'px)';
        m.setAttribute('role', 'button');
        m.setAttribute('tabindex', '0');
        m.setAttribute('aria-label', 'Jogar na extremidade esquerda');
        m.addEventListener('click', function () {
          if (self.onSideClick) self.onSideClick('left');
        });
        m.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            if (self.onSideClick) self.onSideClick('left');
          }
        });
        inner.appendChild(m);
        this.endMarkers.left = m;
      }

      if (this.validSides.indexOf('right') !== -1) {
        const m = document.createElement('div');
        m.className = 'end-marker';
        m.textContent = '▶';
        m.style.transform = 'translate(' + (lastPos.x + TILE_W + 8) + 'px,' + lastPos.y + 'px)';
        m.setAttribute('role', 'button');
        m.setAttribute('tabindex', '0');
        m.setAttribute('aria-label', 'Jogar na extremidade direita');
        m.addEventListener('click', function () {
          if (self.onSideClick) self.onSideClick('right');
        });
        m.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            if (self.onSideClick) self.onSideClick('right');
          }
        });
        inner.appendChild(m);
        this.endMarkers.right = m;
      }
    }

    clearSelection() {
      this.selectedTileId = null;
      this.validSides = [];
    }

    /* ==================== TABELA DE PONTUAÇÃO ==================== */
    renderScoreboard(humanIndex) {
      const container = this.els.scoreboard;
      const s = this.engine.state;
      if (!s) return;

      const board = this.engine.getScoreboard();
      const hasTeams = s.players.some(function (p) { return p.team !== null; });

      container.innerHTML = '';

      const table = document.createElement('table');
      table.className = 'score-table';

      const thead = document.createElement('thead');
      const trh = document.createElement('tr');

      const thName = document.createElement('th');
      thName.textContent = 'JOGADOR';

      const thPts = document.createElement('th');
      thPts.textContent = 'PONTOS';
      thPts.className = 'col-pts';

      const thTiles = document.createElement('th');
      thTiles.textContent = 'PEÇAS';
      thTiles.className = 'col-tiles';

      trh.appendChild(thName);
      trh.appendChild(thPts);
      trh.appendChild(thTiles);
      thead.appendChild(trh);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');

      if (hasTeams) {
        const teamMap = {};
        board.forEach(function (item) {
          if (!teamMap[item.team]) {
            teamMap[item.team] = { score: 0, tiles: 0, members: [] };
          }
          teamMap[item.team].score = item.teamScore;
          teamMap[item.team].tiles += item.tiles;
          teamMap[item.team].members.push(item.name);
        });

        Object.keys(teamMap).forEach(function (teamKey) {
          const team = parseInt(teamKey, 10);
          const info = teamMap[teamKey];
          const isMine = (s.players[humanIndex] && s.players[humanIndex].team === team);

          const tr = document.createElement('tr');
          if (isMine) tr.classList.add('me');

          const tdName = document.createElement('td');
          tdName.innerHTML = 'DUPLA ' + (team + 1) +
            '<span class="sc-team-tag">' + info.members.join(' + ') + '</span>';

          const tdPts = document.createElement('td');
          tdPts.className = 'col-pts sc-score';
          tdPts.textContent = info.score;

          const tdTiles = document.createElement('td');
          tdTiles.className = 'col-tiles sc-tiles';
          tdTiles.textContent = info.tiles;

          tr.appendChild(tdName);
          tr.appendChild(tdPts);
          tr.appendChild(tdTiles);
          tbody.appendChild(tr);
        });
      } else {
        board.forEach(function (item) {
          const tr = document.createElement('tr');
          if (item.index === s.currentPlayer && s.phase === 'playing') tr.classList.add('active');
          if (item.index === humanIndex) tr.classList.add('me');

          const tdName = document.createElement('td');
          tdName.textContent = item.name;

          const tdPts = document.createElement('td');
          tdPts.className = 'col-pts sc-score';
          tdPts.textContent = item.score;

          const tdTiles = document.createElement('td');
          tdTiles.className = 'col-tiles sc-tiles';
          tdTiles.textContent = item.tiles;

          tr.appendChild(tdName);
          tr.appendChild(tdPts);
          tr.appendChild(tdTiles);
          tbody.appendChild(tr);
        });
      }

      table.appendChild(tbody);
      container.appendChild(table);
    }

    renderHUD() {
      const s = this.engine.state;
      if (!s) return;
      const els = this.els;

      if (els.hudRound) {
        els.hudRound.textContent = 'RODADA ' + String(s.roundNumber).padStart(2, '0');
      }
      if (els.boneyardCount) {
        els.boneyardCount.textContent = String(s.boneyard.length);
      }
      if (!els.hudTurn) return;

      if (s.phase !== 'playing') {
        els.hudTurn.textContent = 'FIM DA RODADA';
        els.hudTurn.className = 'hud-turn';
        return;
      }

      const current = s.players[s.currentPlayer];
      if (s.currentPlayer === 0) {
        els.hudTurn.textContent = 'SUA VEZ';
        els.hudTurn.className = 'hud-turn you';
      } else {
        els.hudTurn.textContent = current.name + ' JOGANDO...';
        els.hudTurn.className = 'hud-turn ai';
      }
    }

    /* ==================== HISTÓRICO ==================== */
    renderHistory() {
      const list = this.els.historyList;
      const s = this.engine.state;
      if (!s || !list) return;
      list.innerHTML = '';
      s.history.forEach(function (h) {
        const li = document.createElement('li');
        if (h.type === 'play') {
          li.innerHTML = '<b>' + h.playerName + '</b> → ' + h.tileId.replace('-', '|');
        } else if (h.type === 'draw') {
          li.innerHTML = '<b>' + h.playerName + '</b> → comprou peça';
        } else if (h.type === 'pass') {
          li.innerHTML = '<b>' + h.playerName + '</b> → passou';
        }
        list.appendChild(li);
      });
    }

    /* ==================== RENDER COMPLETO ==================== */
    renderAll() {
      this.renderBoard();
      this.renderHand(0);
      this.renderScoreboard(0);
      this.renderHUD();
      this.renderHistory();
    }

    resetBoard() {
      this.boardTiles.forEach(function (el) { el.remove(); });
      this.boardTiles.clear();
      const self = this;
      Object.keys(this.endMarkers).forEach(function (k) {
        if (self.endMarkers[k] && self.endMarkers[k].parentNode) {
          self.endMarkers[k].parentNode.removeChild(self.endMarkers[k]);
        }
        self.endMarkers[k] = null;
      });
      this.clearSelection();
    }
  }

  AP.Renderer = Renderer;
  AP.buildPips = buildPips;
  AP.buildTileFace = buildTileFace;

})(window);