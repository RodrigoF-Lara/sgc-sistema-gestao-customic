/**
 * Lead time do mockup no Photoshop.
 * O relógio conta só o tempo em EM ANDAMENTO e para em FINALIZADA.
 * GETDATE() no Azure SQL é UTC; o calendário produtivo é o horário de São Paulo.
 */
(function () {
  const ANDAMENTO = "EM ANDAMENTO";
  const FEITO = "FINALIZADA";

  function canon(status) {
    const v = String(status || "").trim().toUpperCase();
    return v === "UPADO" ? FEITO : v;
  }

  function dataDe(valor) {
    if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
    if (valor == null || valor === "") return null;
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
  }

  function ordenar(eventos) {
    return (eventos || [])
      .map((e, i) => ({
        id: e && e.id,
        status: canon(e && e.status),
        usuario: (e && e.usuario) || "",
        anterior: e && e.anterior,
        em: dataDe(e && e.em),
        ordem: i,
      }))
      .filter((e) => e.em)
      .sort((a, b) => a.em - b.em || (Number(a.id) || 0) - (Number(b.id) || 0) || a.ordem - b.ordem);
  }

  function minutosPadrao(inicio, fim) {
    if (!inicio || !fim) return null;
    return Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / 60000));
  }

  function relogioSaoPaulo(valor) {
    const data = dataDe(valor);
    if (!data) return null;
    const texto = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(data);
    const match = String(texto).match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!match) return null;
    const hora = match[4] === "24" ? 0 : Number(match[4]);
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), hora, Number(match[5]), Number(match[6]));
  }

  function minutosProdutivos(inicio, fim) {
    const a = relogioSaoPaulo(inicio);
    const b = relogioSaoPaulo(fim || new Date());
    if (!a || !b) return null;
    const api = window.SGCCalendarioLeadTime;
    if (api && typeof api.minutosEntre === "function") return api.minutosEntre(a, b);
    return minutosPadrao(a, b);
  }

  function somarTrecho(minutos, trecho) {
    if (Number.isFinite(trecho) && trecho >= 0) return minutos + trecho;
    return minutos;
  }

  function calcular(eventos, agora, minutosEntre) {
    const entre = typeof minutosEntre === "function" ? minutosEntre : minutosPadrao;
    const lista = ordenar(eventos);
    const fimRelogio = dataDe(agora) || new Date();
    let minutos = 0;
    let inicio = null;
    let fim = null;
    let emAberto = false;

    for (let i = 0; i < lista.length; i++) {
      if (lista[i].status !== ANDAMENTO) continue;
      if (!inicio) inicio = lista[i].em;
      const proximo = lista[i + 1];
      if (proximo) {
        minutos = somarTrecho(minutos, entre(lista[i].em, proximo.em));
        fim = proximo.status === FEITO ? proximo.em : null;
      } else {
        minutos = somarTrecho(minutos, entre(lista[i].em, fimRelogio));
        emAberto = true;
        fim = null;
      }
    }

    return {
      minutos: inicio ? minutos : null,
      emAberto,
      inicio,
      fim,
      semInicio: !inicio,
    };
  }

  function formatarDuracao(totalMinutos) {
    const minutos = Number(totalMinutos);
    if (!Number.isFinite(minutos) || minutos < 0) return "N/A";
    const dias = Math.floor(minutos / (60 * 24));
    const horas = Math.floor((minutos % (60 * 24)) / 60);
    const mins = minutos % 60;
    if (dias > 0) return `${dias}d ${horas}h ${mins}min`;
    if (horas > 0) return `${horas}h ${mins}min`;
    return `${mins}min`;
  }

  function rotulo(calc) {
    if (!calc || calc.semInicio) {
      return { texto: "—", aberto: false, titulo: "Ainda não entrou em andamento" };
    }
    const dur = formatarDuracao(calc.minutos);
    if (calc.emAberto) {
      return {
        texto: `Em aberto: ${dur}`,
        aberto: true,
        titulo: "Tempo no Photoshop ainda em andamento. Clique para ver o histórico.",
      };
    }
    return {
      texto: dur,
      aberto: false,
      titulo: "Tempo no Photoshop, de Em andamento até Finalizada. Clique para ver o histórico.",
    };
  }

  function historico(eventos, agora, minutosEntre) {
    const entre = typeof minutosEntre === "function" ? minutosEntre : minutosPadrao;
    const lista = ordenar(eventos);
    const fimRelogio = dataDe(agora) || new Date();
    const ultimo = lista[lista.length - 1];
    const fechado = !!ultimo && ultimo.status === FEITO;
    const linhas = lista.map((e, i) => {
      const prox = lista[i + 1];
      if (prox) return { ...e, tempo: entre(e.em, prox.em), emAberto: false };
      if (!fechado) return { ...e, tempo: entre(e.em, fimRelogio), emAberto: true };
      return { ...e, tempo: null, emAberto: false };
    });
    return { linhas, resumo: calcular(eventos, fimRelogio, entre) };
  }

  function formatarData(valor) {
    const data = dataDe(valor);
    if (!data) return "—";
    return data.toLocaleDateString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function formatarHora(valor) {
    const data = dataDe(valor);
    if (!data) return "—";
    return data.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function formatarDataHora(valor) {
    const data = dataDe(valor);
    if (!data) return "—";
    return data.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  window.SGCMockupLeadTime = {
    canon,
    calcular,
    historico,
    formatarDuracao,
    rotulo,
    minutosProdutivos,
    formatarData,
    formatarHora,
    formatarDataHora,
    relogioSaoPaulo,
  };
})();
