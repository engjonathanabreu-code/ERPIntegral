/* ERP Integral — disposição, ordenação e redimensionamento dos cards na aba Metas.
   Cards podem ocupar meia largura ou largura inteira. Cards de meia largura
   são compactados em pares. A ordem e a largura escolhidas pelo usuário são
   persistidas em metas.ordem_coluna e metas.largura_card. */
(() => {
  'use strict';

  const LONG_TITLE_MIN = 34;
  const EDGE_SIZE = 10;
  const RESIZE_THRESHOLD = 26;
  const COL_SELECTOR = '.metas2-board .metas-board-col';
  const CARD_SELECTOR = '.metas2-card[data-meta-card]';
  let scheduled = false;
  let dragging = null;
  let resizing = null;
  let dragJustEndedUntil = 0;
  const initializedSignature = new WeakMap();
  const savedWidths = new Map();

  const sb = () => window.ERPIntegralBridge?.sb || null;
  const cardsOf = col => Array.from(col.querySelectorAll(CARD_SELECTOR));

  function autoWidth(card) {
    const title = (card.querySelector('.metas2-card-top strong')?.textContent || '').trim();
    return title.length >= LONG_TITLE_MIN ? 'full' : 'half';
  }

  function setCardWidth(card, width) {
    const full = width === 'full';
    card.classList.toggle('metas2-card-wide', full);
    card.classList.toggle('metas2-card-half', !full);
    card.dataset.metaCardWidth = full ? 'full' : 'half';
  }

  function classifyCard(card) {
    const saved = savedWidths.get(card.dataset.metaCard);
    setCardWidth(card, saved || autoWidth(card));
    card.setAttribute('draggable', 'true');
    card.title = 'Arraste para reorganizar. Puxe a borda lateral para redimensionar.';
    installResize(card);
  }

  function normalizeCards(root = document) {
    root.querySelectorAll(`${COL_SELECTOR} ${CARD_SELECTOR}`).forEach(classifyCard);
  }

  async function restoreSavedOrder(col) {
    const cards = cardsOf(col);
    if (!cards.length) return;
    const ids = cards.map(c => c.dataset.metaCard).filter(Boolean);
    const signature = ids.slice().sort().join('|');
    if (initializedSignature.get(col) === signature) return;
    initializedSignature.set(col, signature);

    const client = sb();
    if (!client) return;
    const { data, error } = await client.from('metas').select('id,ordem_coluna,largura_card').in('id', ids);
    if (error || !data) {
      if (error) console.warn('Metas: não foi possível carregar a organização dos cards.', error);
      return;
    }

    data.forEach(row => {
      if (row.largura_card === 'half' || row.largura_card === 'full') {
        savedWidths.set(String(row.id), row.largura_card);
      }
    });

    const currentIndex = new Map(cards.map((card, i) => [card.dataset.metaCard, i]));
    const order = new Map(data.map(row => [String(row.id), Number.isFinite(row.ordem_coluna) ? row.ordem_coluna : null]));
    cards.sort((a, b) => {
      const av = order.get(a.dataset.metaCard);
      const bv = order.get(b.dataset.metaCard);
      if (av == null && bv == null) return currentIndex.get(a.dataset.metaCard) - currentIndex.get(b.dataset.metaCard);
      if (av == null) return 1;
      if (bv == null) return -1;
      return av - bv || currentIndex.get(a.dataset.metaCard) - currentIndex.get(b.dataset.metaCard);
    });
    cards.forEach(card => col.appendChild(card));
    cards.forEach(classifyCard);
  }

  async function persistColumnOrder(col) {
    const client = sb();
    if (!client) return;
    const cards = cardsOf(col);
    const results = await Promise.all(cards.map((card, index) =>
      client.from('metas').update({ ordem_coluna: (index + 1) * 10 }).eq('id', card.dataset.metaCard)
    ));
    const failed = results.find(r => r.error);
    if (failed?.error) console.warn('Metas: não foi possível salvar a ordem dos cards.', failed.error);
  }

  async function persistCardWidth(card) {
    const client = sb();
    if (!client) return;
    const width = card.classList.contains('metas2-card-wide') ? 'full' : 'half';
    savedWidths.set(card.dataset.metaCard, width);
    const { error } = await client.from('metas').update({ largura_card: width }).eq('id', card.dataset.metaCard);
    if (error) console.warn('Metas: não foi possível salvar a largura do card.', error);
  }

  function edgeAt(card, clientX) {
    const box = card.getBoundingClientRect();
    if (Math.abs(clientX - box.left) <= EDGE_SIZE) return 'left';
    if (Math.abs(clientX - box.right) <= EDGE_SIZE) return 'right';
    return null;
  }

  function widthFromDrag(state, clientX) {
    const delta = clientX - state.startX;
    if (Math.abs(delta) < RESIZE_THRESHOLD) return state.startWidth;
    if (state.edge === 'right') {
      return state.startWidth === 'half'
        ? (delta > 0 ? 'full' : 'half')
        : (delta < 0 ? 'half' : 'full');
    }
    return state.startWidth === 'half'
      ? (delta < 0 ? 'full' : 'half')
      : (delta > 0 ? 'half' : 'full');
  }

  function finishResize(event) {
    if (!resizing) return;
    const state = resizing;
    resizing = null;
    state.card.classList.remove('metas2-card-resizing');
    state.card.setAttribute('draggable', 'true');
    state.card.style.cursor = '';
    try { state.card.releasePointerCapture?.(event.pointerId); } catch (_) {}
    persistCardWidth(state.card);
    dragJustEndedUntil = Date.now() + 350;
  }

  function installResize(card) {
    if (card.dataset.metaResizeReady === '1') return;
    card.dataset.metaResizeReady = '1';

    card.addEventListener('mousemove', event => {
      if (resizing?.card === card) return;
      card.style.cursor = edgeAt(card, event.clientX) ? 'ew-resize' : '';
    });
    card.addEventListener('mouseleave', () => {
      if (!resizing) card.style.cursor = '';
    });

    card.addEventListener('pointerdown', event => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      const edge = edgeAt(card, event.clientX);
      if (!edge) return;
      event.preventDefault();
      event.stopPropagation();
      const startWidth = card.classList.contains('metas2-card-wide') ? 'full' : 'half';
      resizing = { card, edge, startX: event.clientX, startWidth };
      card.setAttribute('draggable', 'false');
      card.classList.add('metas2-card-resizing');
      card.style.cursor = 'ew-resize';
      card.setPointerCapture?.(event.pointerId);
    }, true);

    card.addEventListener('pointermove', event => {
      if (!resizing || resizing.card !== card) return;
      event.preventDefault();
      event.stopPropagation();
      setCardWidth(card, widthFromDrag(resizing, event.clientX));
    }, true);

    card.addEventListener('pointerup', finishResize, true);
    card.addEventListener('pointercancel', finishResize, true);
  }

  function insertionTarget(col, x, y, draggedCard) {
    const candidates = cardsOf(col).filter(card => card !== draggedCard);
    for (const card of candidates) {
      const box = card.getBoundingClientRect();
      const centerX = box.left + box.width / 2;
      const centerY = box.top + box.height / 2;
      const sameRow = y >= box.top && y <= box.bottom;
      if (y < centerY || (sameRow && x < centerX)) return card;
    }
    return null;
  }

  function installDnD(col) {
    if (col.dataset.metaDnDReady === '1') return;
    col.dataset.metaDnDReady = '1';

    col.addEventListener('dragstart', event => {
      if (resizing) {
        event.preventDefault();
        return;
      }
      const card = event.target.closest?.(CARD_SELECTOR);
      if (!card || card.closest(COL_SELECTOR) !== col) return;
      dragging = card;
      card.classList.add('metas2-card-dragging');
      col.classList.add('metas-board-col-dragging');
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', card.dataset.metaCard || '');
      }
    });

    col.addEventListener('dragover', event => {
      if (!dragging || dragging.closest(COL_SELECTOR) !== col) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      const before = insertionTarget(col, event.clientX, event.clientY, dragging);
      if (before) col.insertBefore(dragging, before);
      else col.appendChild(dragging);
    });

    col.addEventListener('drop', event => {
      if (!dragging || dragging.closest(COL_SELECTOR) !== col) return;
      event.preventDefault();
      persistColumnOrder(col);
    });

    col.addEventListener('dragend', () => {
      if (!dragging) return;
      const activeCol = dragging.closest(COL_SELECTOR);
      dragging.classList.remove('metas2-card-dragging');
      activeCol?.classList.remove('metas-board-col-dragging');
      if (activeCol) persistColumnOrder(activeCol);
      dragging = null;
      dragJustEndedUntil = Date.now() + 350;
    });
  }

  async function initializeBoard(root = document) {
    normalizeCards(root);
    const columns = Array.from(root.querySelectorAll(COL_SELECTOR));
    columns.forEach(installDnD);
    await Promise.all(columns.map(restoreSavedOrder));
    normalizeCards(root);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      initializeBoard().catch(err => console.warn('Metas: falha ao preparar organização dos cards.', err));
    });
  }

  document.addEventListener('click', event => {
    if (Date.now() < dragJustEndedUntil && event.target.closest?.(CARD_SELECTOR)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    setTimeout(schedule, 0);
  }, true);

  window.addEventListener('load', schedule, { once: true });
  const app = document.querySelector('#app');
  if (app) new MutationObserver(schedule).observe(app, { childList: true, subtree: true });
  schedule();
})();
