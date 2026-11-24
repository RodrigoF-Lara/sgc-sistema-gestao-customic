(function (root) {
  const ETAPAS = [
    { id: "pesquisa", nome: "Pesquisa", cor: "#78909c" },
    { id: "faca", nome: "Faca / estrutural", cor: "#fb8c00" },
    { id: "modelagem", nome: "Modelagem 3D", cor: "#8e24aa" },
    { id: "arte", nome: "Criação de arte", cor: "#43a047" },
    { id: "ajuste", nome: "Ajuste / fechamento", cor: "#1e88e5" },
    { id: "grafica", nome: "Gráfica / orçamento", cor: "#00897b" },
    { id: "outro", nome: "Outra", cor: "#607d8b" },
  ];
  const POR_ID = Object.fromEntries(ETAPAS.map((e) => [e.id, e]));
  const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const LETRA = ["D", "S", "T", "Q", "Q", "S", "S"];

  function partes(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }

  function utc(iso) {
    const p = partes(iso);
    if (!p) return null;
    return new Date(Date.UTC(p.y, p.m - 1, p.d));
  }

  function isoDe(dt) {
    const z = (n) => String(n).padStart(2, "0");
    return `${dt.getUTCFullYear()}-${z(dt.getUTCMonth() + 1)}-${z(dt.getUTCDate())}`;
  }

  function somaDias(iso, n) {
    return isoDe(new Date(utc(iso).getTime() + n * 86400000));
  }

  function diffDias(a, b) {
    const da = utc(a);
    const db = utc(b);
    if (!da || !db) return null;
    return Math.round((db - da) / 86400000);
  }

  function pascoa(ano) {
    const a = ano % 19;
    const b = Math.floor(ano / 100);
    const c = ano % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }

  function feriadosDoAno(ano) {
    const fixos = {
      [`${ano}-01-01`]: "Ano Novo",
      [`${ano}-04-21`]: "Tiradentes",
      [`${ano}-05-01`]: "Dia do Trabalho",
      [`${ano}-09-07`]: "Independência",
      [`${ano}-10-12`]: "Nossa Senhora Aparecida",
      [`${ano}-11-02`]: "Finados",
      [`${ano}-11-15`]: "Proclamação da República",
      [`${ano}-12-25`]: "Natal",
    };
    const domingo = pascoa(ano);
    fixos[somaDias(domingo, -48)] = "Carnaval";
    fixos[somaDias(domingo, -47)] = "Carnaval";
    fixos[somaDias(domingo, -2)] = "Sexta-feira Santa";
    fixos[somaDias(domingo, 60)] = "Corpus Christi";
    return fixos;
  }

  function mapaFeriados(de, ate) {
    const mapa = {};
    const anos = new Set();
    if (de) anos.add(partes(de).y);
    if (ate) anos.add(partes(ate).y);
    anos.forEach((ano) => Object.assign(mapa, feriadosDoAno(ano)));
    return mapa;
  }

  function diasUteis(a, b) {
    const n = diffDias(a, b);
    if (n === null || n <= 0) return 0;
    const feriados = mapaFeriados(a, b);
    let count = 0;
    for (let i = 0; i < n; i++) {
      const dt = new Date(utc(a).getTime() + i * 86400000);
      const wd = dt.getUTCDay();
      if (wd === 0 || wd === 6) continue;
      if (feriados[isoDe(dt)]) continue;
      count += 1;
    }
    return count;
  }

  function fmtDia(iso) {
    const p = partes(iso);
    if (!p) return "";
    return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}`;
  }

  function intervalo(a, b) {
    const corridos = diffDias(a, b);
    if (corridos === null || corridos < 0) return null;
    const uteis = diasUteis(a, b);
    if (corridos === 0) {
      return { corridos: 0, uteis: 0, curto: "mesmo dia", medio: "mesmo dia", longo: `Mesmo dia (${fmtDia(a)})` };
    }
    const dc = corridos === 1 ? "1 dia" : `${corridos} dias`;
    const du = uteis === 1 ? "1 útil" : `${uteis} úteis`;
    return {
      corridos,
      uteis,
      curto: `${corridos} d`,
      medio: dc,
      util: du,
      longo: `${dc} (${du})`,
      corridoLongo: corridos === 1 ? "1 dia corrido" : `${corridos} dias corridos`,
    };
  }

  function etapaDe(reg) {
    return POR_ID[reg.etapa] || POR_ID.outro;
  }

  function nomeEtapa(reg) {
    if (reg.etapa === "outro") return String(reg.rotulo || "").trim() || "Outra";
    return etapaDe(reg).nome;
  }

  function corEtapa(reg) {
    const cor = String(reg.cor || "").toLowerCase();
    if (reg.etapa === "outro" && /^#[0-9a-f]{6}$/.test(cor)) return cor;
    return etapaDe(reg).cor;
  }

  function ordenar(regs) {
    return [...(regs || [])].sort((a, b) => {
      if (a.data !== b.data) return a.data < b.data ? -1 : 1;
      return (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0);
    });
  }

  function primeiro(regs, etapa, desde) {
    return regs.find((r) => r.etapa === etapa && (!desde || r.data >= desde)) || null;
  }

  function ultimo(regs, etapa, desde) {
    const lista = regs.filter((r) => r.etapa === etapa && (!desde || r.data >= desde));
    return lista.length ? lista[lista.length - 1] : null;
  }

  function celulaPar(ini, fim, falta) {
    if (!ini) return "—";
    if (!fim) return falta(ini);
    const info = intervalo(ini.data, fim.data);
    return info ? info.longo : "—";
  }

  function resumoDe(regs) {
    const faca = primeiro(regs, "faca");
    const arte = primeiro(regs, "arte", faca ? faca.data : "");
    const modelagem = primeiro(regs, "modelagem");
    const arte3d = modelagem ? primeiro(regs, "arte", modelagem.data) : null;
    const pesquisa = primeiro(regs, "pesquisa");
    const facaPos = pesquisa ? primeiro(regs, "faca", pesquisa.data) : null;
    const arte0 = primeiro(regs, "arte");
    const fechamento = arte0 ? ultimo(regs, "ajuste", arte0.data) : null;
    const orcamento = fechamento ? ultimo(regs, "grafica", fechamento.data) : null;
    return [
      {
        id: "faca-arte",
        titulo: "Faca enviada/entregue até arte recebida",
        texto: celulaPar(faca, arte, (r) => `Faca em ${fmtDia(r.data)}; arte ainda não registrada`),
        chamada: faca && arte ? intervalo(faca.data, arte.data) : null,
        chamadaTexto: "Faca enviada até arte recebida",
      },
      {
        id: "3d-arte",
        titulo: "3D entregue até arte recebida",
        texto: celulaPar(modelagem, arte3d, (r) => `3D em ${fmtDia(r.data)}; arte ainda não registrada`),
        chamada: modelagem && arte3d ? intervalo(modelagem.data, arte3d.data) : null,
        chamadaTexto: "3D entregue até arte recebida",
      },
      {
        id: "pesquisa-faca",
        titulo: "Pesquisa até faca registrada",
        texto: celulaPar(pesquisa, facaPos, (r) => `Pesquisa em ${fmtDia(r.data)}; faca ainda não registrada`),
      },
      {
        id: "arte-fecha",
        titulo: "Arte recebida até fechamento interno",
        texto: celulaPar(arte0, fechamento, (r) => `Arte recebida em ${fmtDia(r.data)}; fechamento ainda não registrado`),
      },
      {
        id: "fecha-orc",
        titulo: "Fechamento interno até orçamento recebido",
        texto: celulaPar(fechamento, orcamento, (r) => `Fechamento em ${fmtDia(r.data)}; orçamento ainda não registrado`),
      },
    ];
  }

  function diasNoMes(ym) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function tituloMes(ym) {
    const [y, m] = ym.split("-").map(Number);
    const nome = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
    const bonito = nome.charAt(0).toUpperCase() + nome.slice(1);
    return `${bonito}/${y}`;
  }

  function montarRelatorio(projetos, ym) {
    if (!/^\d{4}-\d{2}$/.test(String(ym || ""))) return null;
    const feriados = feriadosDoAno(Number(ym.slice(0, 4)));
    const dias = diasNoMes(ym);
    const linhas = [];
    for (const p of projetos || []) {
      const regs = ordenar(p.registros).filter((r) => String(r.data || "").slice(0, 7) === ym);
      if (!regs.length) continue;
      const total = regs.length > 1 ? intervalo(regs[0].data, regs[regs.length - 1].data) : null;
      linhas.push({
        id: p.id,
        nome: p.nome || "Projeto",
        registros: regs,
        total,
        resumo: resumoDe(regs),
      });
    }
    linhas.sort((a, b) => (a.registros[0].data < b.registros[0].data ? -1 : a.registros[0].data > b.registros[0].data ? 1 : a.nome.localeCompare(b.nome, "pt-BR")));
    return { ym, titulo: tituloMes(ym), dias, feriados, linhas };
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function htmlLegenda() {
    const itens = ETAPAS.filter((e) => e.id !== "outro");
    return itens.map((e) => `<span><i style="background:${e.cor}"></i> ${escapeHtml(e.nome)}</span>`).join("");
  }

  function htmlGantt(rel) {
    const head = [];
    const letras = [];
    for (let dia = 1; dia <= rel.dias; dia++) {
      const iso = `${rel.ym}-${String(dia).padStart(2, "0")}`;
      const dt = utc(iso);
      const wd = dt.getUTCDay();
      const feriado = rel.feriados[iso];
      const cls = feriado ? "fer" : (wd === 0 || wd === 6 ? "fds" : "");
      const title = feriado ? ` title="${escapeHtml(feriado)}"` : "";
      head.push(`<span class="gantt-dia ${cls}"${title}>${String(dia).padStart(2, "0")}${feriado ? `<em>feriado</em>` : ""}</span>`);
      letras.push(`<span class="gantt-letra ${cls}">${LETRA[wd]}</span>`);
    }
    const rows = rel.linhas.map((linha) => {
      const fundos = [];
      for (let dia = 1; dia <= rel.dias; dia++) {
        const iso = `${rel.ym}-${String(dia).padStart(2, "0")}`;
        const wd = utc(iso).getUTCDay();
        const feriado = rel.feriados[iso];
        fundos.push(`<i class="${feriado ? "fer" : (wd === 0 || wd === 6 ? "fds" : "")}"></i>`);
      }
      const barras = [];
      const pontos = [];
      linha.registros.forEach((r, i) => {
        const dia = partes(r.data).d;
        const mesmo = linha.registros.filter((x) => x.data === r.data);
        const idx = mesmo.indexOf(r);
        const desloc = (idx - (mesmo.length - 1) / 2) * 0.32;
        const left = ((dia - 0.5 + desloc) / rel.dias) * 100;
        const mostrarData = i === 0 || i === linha.registros.length - 1 || diffDias(linha.registros[i - 1].data, r.data) >= 2;
        pontos.push(`
          <span class="gantt-ponto" style="left:${left}%; background:${corEtapa(r)}" title="${escapeHtml(fmtDia(r.data) + " " + r.titulo)}"></span>
          ${mostrarData ? `<span class="gantt-quando" style="left:${left}%">${fmtDia(r.data)}</span>` : ""}
        `);
        if (i === 0) return;
        const prev = linha.registros[i - 1];
        const d0 = partes(prev.data).d;
        if (dia <= d0) return;
        const info = intervalo(prev.data, r.data);
        const x = ((d0 - 0.5) / rel.dias) * 100;
        const w = ((dia - d0) / rel.dias) * 100;
        barras.push(`<span class="gantt-barra" style="left:${x}%; width:${w}%; background:${corEtapa(r)}">${info && info.corridos >= 2 ? escapeHtml(info.curto) : ""}</span>`);
      });
      return `
        <div class="gantt-row">
          <div class="gantt-nome">${escapeHtml(linha.nome)}</div>
          <div class="gantt-faixa">
            <div class="gantt-fundos">${fundos.join("")}</div>
            ${barras.join("")}
            ${pontos.join("")}
          </div>
        </div>`;
    }).join("");
    return `
      <div class="gantt" style="--dias:${rel.dias}">
        <div class="gantt-head"><span></span><div class="gantt-numeros">${head.join("")}</div></div>
        ${rows}
        <div class="gantt-head"><span></span><div class="gantt-letras">${letras.join("")}</div></div>
      </div>`;
  }

  function htmlProduto(linha) {
    if (linha.registros.length === 1) {
      const r = linha.registros[0];
      return `
        <section class="crono-prod">
          <h3>${escapeHtml(linha.nome)}</h3>
          <p class="crono-total">Registro único em ${fmtDia(r.data)}.</p>
          ${htmlPasso(r, true)}
        </section>`;
    }
    const chamadas = linha.resumo
      .filter((item) => item.chamada)
      .map((item) => {
        const fala = item.chamada.corridos === 0
          ? item.chamada.longo
          : `${item.chamada.corridoLongo} (${item.chamada.util})`;
        return `<p class="crono-destaque">${escapeHtml(item.chamadaTexto)}: ${escapeHtml(fala)}</p>`;
      })
      .join("");
    const passos = [];
    linha.registros.forEach((r, i) => {
      if (i > 0) {
        const prev = linha.registros[i - 1];
        const info = intervalo(prev.data, r.data);
        const cor = info && info.corridos === 0 ? "#90a4ae" : corEtapa(r);
        passos.push(`<div class="crono-meio" style="border-color:${cor}; color:${cor}"><b>${escapeHtml(info.medio)}</b>${info.corridos ? `<small>${escapeHtml(info.util)}</small>` : ""}</div>`);
      }
      passos.push(htmlPasso(r));
    });
    const ini = linha.registros[0];
    const fim = linha.registros[linha.registros.length - 1];
    const totalTxt = linha.total.corridos === 0
      ? `Registros no mesmo dia, ${fmtDia(ini.data)}.`
      : `De ${fmtDia(ini.data)} a ${fmtDia(fim.data)}: ${linha.total.corridoLongo} (${linha.total.util}) entre o primeiro e o último registro.`;
    return `
      <section class="crono-prod">
        <h3>${escapeHtml(linha.nome)}</h3>
        <p class="crono-total">${escapeHtml(totalTxt)}</p>
        ${chamadas}
        <div class="crono-linha">${passos.join("")}</div>
      </section>`;
  }

  function htmlPasso(r, sozinho) {
    const quando = `${fmtDia(r.data)} (${SEMANA[utc(r.data).getUTCDay()]})`;
    return `
      <div class="crono-ev${sozinho ? " sozinho" : ""}">
        <div class="crono-quando">${quando}</div>
        <span class="crono-dot" style="background:${corEtapa(r)}"></span>
        <span class="crono-pill" style="background:${corEtapa(r)}">${escapeHtml(nomeEtapa(r))}</span>
        <strong>${escapeHtml(r.titulo)}</strong>
        ${r.texto ? `<p>${escapeHtml(r.texto)}</p>` : ""}
      </div>`;
  }

  function htmlResumo(rel) {
    if (!rel.linhas.length) return "";
    const cab = rel.linhas.map((l) => `<th>${escapeHtml(l.nome)}</th>`).join("");
    const corpo = rel.linhas[0].resumo.map((_, i) => {
      const celulas = rel.linhas.map((l) => `<td>${escapeHtml(l.resumo[i].texto)}</td>`).join("");
      return `<tr><th>${escapeHtml(rel.linhas[0].resumo[i].titulo)}</th>${celulas}</tr>`;
    }).join("");
    return `
      <h2>Resumo dos intervalos por etapa</h2>
      <div class="crono-tabela">
        <table>
          <thead><tr><th>Intervalo registrado</th>${cab}</tr></thead>
          <tbody>${corpo}</tbody>
        </table>
      </div>`;
  }

  function htmlRelatorio(projetos, ym) {
    const rel = montarRelatorio(projetos, ym);
    if (!rel) return `<p class="empty">Escolha o mês da cronologia.</p>`;
    if (!rel.linhas.length) {
      return `<p class="empty">Nenhum registro em ${escapeHtml(rel.titulo)}. Abra um projeto e lance a etapa com a data.</p>`;
    }
    return `
      <article class="crono-folha">
        <header class="crono-top">
          <strong>CUSTOMIC | Projetos</strong>
          <span>Linha do tempo · ${escapeHtml(rel.titulo)}</span>
        </header>
        <h2>Visão geral: projetos em escala de calendário</h2>
        <p class="crono-lead">Cada barra mostra o tempo entre dois registros consecutivos e leva a cor da etapa em que termina. Fins de semana em cinza e feriado em destaque.</p>
        <div class="crono-legenda">${htmlLegenda()}</div>
        ${htmlGantt(rel)}
        <h2>Linha do tempo por projeto</h2>
        <p class="crono-lead">O intervalo entre as etapas conta dias corridos e dias úteis. Em vermelho, o tempo da faca até a arte e, quando houver, do 3D até a arte.</p>
        <div class="crono-legenda">${htmlLegenda()}</div>
        ${rel.linhas.map(htmlProduto).join("")}
        ${htmlResumo(rel)}
        <footer class="crono-fonte">Fonte: registros do Kanban de projetos, ${escapeHtml(rel.titulo)}. Dias úteis desconsideram sábados, domingos, feriados nacionais, carnaval, sexta-feira santa e Corpus Christi.</footer>
      </article>`;
  }

  root.SGCCronologia = {
    ETAPAS,
    diffDias,
    diasUteis,
    intervalo,
    pascoa,
    feriadosDoAno,
    montarRelatorio,
    htmlRelatorio,
  };
})(typeof window !== "undefined" ? window : globalThis);
