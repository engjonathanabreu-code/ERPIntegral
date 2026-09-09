(() => {
  'use strict';
  const bridge = window.ERPIntegralBridge;
  const sb = bridge?.sb;
  if (!sb || sb.__erpCalendarAccessPatched) return;

  const originalFrom = sb.from.bind(sb);
  const isManager = () => {
    const type = window.ERPCoreNavigation?.currentUser?.type || bridge.currentUser?.type || '';
    return ['Administrador', 'Diretor de Projetos', 'Diretor de Projeto', 'Jurídico', 'Juridico'].includes(type);
  };
  const currentUserId = () => window.ERPCoreNavigation?.currentUser?.id || bridge.currentUser?.id || null;

  const eventTime = event => {
    const value = event?.inicio || event?.data_inicio || event?.start || event?.created_at || '';
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
  };

  const sortAssetEventsChronologically = events => {
    if (!Array.isArray(events) || events.length < 2) return events;

    return events
      .map((event, index) => ({ event, index }))
      .sort((a, b) => {
        const aIsAsset = Boolean(a.event?.agenda_id);
        const bIsAsset = Boolean(b.event?.agenda_id);

        // O calendário deve exibir reservas/eventos de ativos pela data/hora do evento,
        // nunca pela ordem em que foram cadastrados. Para os demais itens, preservamos
        // o comportamento atual quando não há necessidade de reordenação.
        if (aIsAsset && bIsAsset) {
          const byStart = eventTime(a.event) - eventTime(b.event);
          if (byStart !== 0) return byStart;

          const aEnd = Date.parse(a.event?.fim || '') || Number.MAX_SAFE_INTEGER;
          const bEnd = Date.parse(b.event?.fim || '') || Number.MAX_SAFE_INTEGER;
          const byEnd = aEnd - bEnd;
          if (byEnd !== 0) return byEnd;
        }

        return a.index - b.index;
      })
      .map(item => item.event);
  };

  sb.from = function(relation) {
    const query = originalFrom(relation);
    if (relation !== 'erp_eventos' || !query?.select) return query;

    const originalSelect = query.select.bind(query);
    query.select = function(...selectArgs) {
      const builder = originalSelect(...selectArgs);
      if (!builder?.range) return builder;

      const originalRange = builder.range.bind(builder);
      builder.range = function(...rangeArgs) {
        const result = originalRange(...rangeArgs);
        if (!result?.then) return result;

        const originalThen = result.then.bind(result);
        result.then = function(onFulfilled, onRejected) {
          return originalThen(response => {
            const uid = currentUserId();
            if (Array.isArray(response?.data)) {
              let events = response.data;

              if (!isManager() && uid) {
                events = events.map(event => {
                  if (!event?.agenda_id || (event.participantes || []).includes(uid)) return event;
                  return { ...event, participantes: [...(event.participantes || []), uid] };
                });
              }

              response = {
                ...response,
                data: sortAssetEventsChronologically(events)
              };
            }
            return onFulfilled ? onFulfilled(response) : response;
          }, onRejected);
        };
        return result;
      };
      return builder;
    };
    return query;
  };

  sb.__erpCalendarAccessPatched = true;
})();
