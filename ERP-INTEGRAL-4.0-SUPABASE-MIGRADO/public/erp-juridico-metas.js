(() => {
  'use strict';

  const bridge = window.ERPIntegralBridge;
  if (!bridge || window.__erpJuridicoMetasLoaded) return;
  window.__erpJuridicoMetasLoaded = true;

  const norm = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const isJuridico = user => {
    const type = norm(user?.type);
    const sector = norm(user?.sector);
    return type.includes('juridico') || sector.includes('juridico');
  };

  const mondayForDate = value => {
    if (!value) return '';
    const d = new Date(`${value}T12:00:00`);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  let enhancing = false;

  async function enhanceMetaForm() {
    if (enhancing) return;
    const form = document.querySelector('#metaV2Form');
    if (!form) return;

    const responsavel = form.querySelector('input[name="responsavel"]');
    const grid = responsavel?.closest('.check-grid');
    if (!grid) return;

    const juridicos = (bridge.db?.users || []).filter(user => user?.active && isJuridico(user));
    if (!juridicos.length) return;

    enhancing = true;
    try {
      juridicos.forEach(user => {
        if (grid.querySelector(`input[name="responsavel"][value="${CSS.escape(String(user.id))}"]`)) return;
        const label = document.createElement('label');
        label.className = 'check-item';
        label.innerHTML = `<input type="checkbox" name="responsavel" value="${bridge.esc(user.id)}">${bridge.esc(user.name)} <span class="muted">(${bridge.esc(user.type || 'Jurídico')})</span>`;
        grid.appendChild(label);
      });

      // Em edição, preserva Jurídico marcado caso ele já seja responsável pela meta.
      const title = String(form.elements?.titulo?.value || '').trim();
      const week = mondayForDate(form.elements?.semana?.value || '');
      if (!title || !week || !bridge.sb) return;

      const metas = await bridge.sb.from('metas')
        .select('id')
        .eq('titulo', title)
        .eq('semana_inicio', week)
        .limit(2);

      if (metas.error || metas.data?.length !== 1) return;

      const resp = await bridge.sb.from('meta_responsaveis')
        .select('usuario_id')
        .eq('meta_id', metas.data[0].id);

      if (resp.error) return;
      const ids = new Set((resp.data || []).map(row => String(row.usuario_id)));
      juridicos.forEach(user => {
        const input = grid.querySelector(`input[name="responsavel"][value="${CSS.escape(String(user.id))}"]`);
        if (input && ids.has(String(user.id))) input.checked = true;
      });
    } catch (error) {
      console.warn('Metas: não foi possível complementar responsáveis do Jurídico.', error);
    } finally {
      enhancing = false;
    }
  }

  new MutationObserver(() => {
    if (document.querySelector('#metaV2Form')) enhanceMetaForm();
  }).observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('erp-bridge-ready', enhanceMetaForm);
  enhanceMetaForm();
})();
