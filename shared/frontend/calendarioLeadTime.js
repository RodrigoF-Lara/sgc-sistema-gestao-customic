/**
 * Lead time em janela produtiva (dias/horas do calendário).
 * Usado em Status de NF e alinhado ao cálculo das requisições.
 */
window.SGCCalendarioLeadTime = (() => {
  const PADRAO = {
    horaInicio: "08:00",
    horaFim: "18:00",
    diasAtivos: {
      seg: true,
      ter: true,
      qua: true,
      qui: true,
      sex: true,
      sab: false,
      dom: false,
    },
  };

  let config = clonarConfig(PADRAO);

  function clonarConfig(src) {
    const dias = src && src.diasAtivos ? src.diasAtivos : {};
    return {
      horaInicio: src && src.horaInicio ? src.horaInicio : PADRAO.horaInicio,
      horaFim: src && src.horaFim ? src.horaFim : PADRAO.horaFim,
      diasAtivos: {
        seg: dias.seg !== false,
        ter: dias.ter !== false,
        qua: dias.qua !== false,
        qui: dias.qui !== false,
        sex: dias.sex !== false,
        sab: dias.sab === true,
        dom: dias.dom === true,
      },
    };
  }

  function setConfig(cfg) {
    config = clonarConfig(cfg || PADRAO);
    return config;
  }

  function getConfig() {
    return config;
  }

  async function carregar(headers) {
    try {
      const res = await fetch("/api/shared/config?tipo=calendarioProdutivo&action=get", {
        headers: headers || {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.config) setConfig(data.config);
      }
    } catch (_) {
      /* mantém o padrão se a API falhar */
    }
    return config;
  }

  function diaProdutivo(dateObj, cfg) {
    const diaSemana = dateObj.getDay();
    const diasAtivos = (cfg || config).diasAtivos || {};
    if (diaSemana === 1) return diasAtivos.seg !== false;
    if (diaSemana === 2) return diasAtivos.ter !== false;
    if (diaSemana === 3) return diasAtivos.qua !== false;
    if (diaSemana === 4) return diasAtivos.qui !== false;
    if (diaSemana === 5) return diasAtivos.sex !== false;
    if (diaSemana === 6) return diasAtivos.sab === true;
    return diasAtivos.dom === true;
  }

  function parseHoraParaMinutos(hora) {
    const partes = String(hora || "").split(":");
    if (partes.length < 2) return null;
    const hh = Number(partes[0]);
    const mm = Number(partes[1]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  }

  function construirDiaComMinutos(baseDate, minutosDia) {
    const data = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, 0, 0, 0);
    data.setMinutes(minutosDia);
    return data;
  }

  function msEntre(inicio, fim, cfgOverride) {
    if (!inicio || !fim) return null;
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return null;
    if (fim <= inicio) return 0;

    const cfg = cfgOverride || config;
    const inicioMin = parseHoraParaMinutos(cfg.horaInicio);
    const fimMin = parseHoraParaMinutos(cfg.horaFim);
    if (inicioMin === null || fimMin === null || inicioMin >= fimMin) {
      return Math.max(0, fim.getTime() - inicio.getTime());
    }

    let totalMs = 0;
    const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), 0, 0, 0, 0);
    const ultimoDia = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 0, 0, 0, 0);

    while (cursor <= ultimoDia) {
      if (diaProdutivo(cursor, cfg)) {
        const janelaInicio = construirDiaComMinutos(cursor, inicioMin);
        const janelaFim = construirDiaComMinutos(cursor, fimMin);
        const inicioEfetivo = inicio > janelaInicio ? inicio : janelaInicio;
        const fimEfetivo = fim < janelaFim ? fim : janelaFim;
        if (fimEfetivo > inicioEfetivo) {
          totalMs += fimEfetivo.getTime() - inicioEfetivo.getTime();
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return totalMs;
  }

  function minutosEntre(inicio, fim, cfgOverride) {
    const ms = msEntre(inicio, fim, cfgOverride);
    if (ms === null) return null;
    return Math.round(ms / (1000 * 60));
  }

  return {
    PADRAO,
    carregar,
    setConfig,
    getConfig,
    msEntre,
    minutosEntre,
  };
})();
