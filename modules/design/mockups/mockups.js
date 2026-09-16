document.addEventListener("DOMContentLoaded", async () => {
  if (window.SGCPermissoes) {
    try {
      await window.SGCPermissoes.carregar();
      if (!window.SGCPermissoes.podeAcessar("design-mockups")) {
        alert("Acesso negado.");
        window.location.href = "/menu.html";
        return;
      }
    } catch (e) {
      console.warn(e);
    }
  }

  const API = "/api/design/mockups";
  const tbody = document.getElementById("tbody");
  const busca = document.getElementById("busca");
  const filtroStatus = document.getElementById("filtroStatus");
  const filtroLote = document.getElementById("filtroLote");
  const csvStatus = document.getElementById("csvStatus");
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");

  let itens = [];
  let lotes = [];

  function authHeaders() {
    const h = { "Content-Type": "application/json" };
    if (window.SGCPermissoes) Object.assign(h, window.SGCPermissoes.authHeaders());
    const nivel = localStorage.getItem("userLevel");
    const nome = localStorage.getItem("userName");
    const code = localStorage.getItem("userCode");
    if (nivel) h["x-user-level"] = nivel;
    if (nome) h["x-user-name"] = nome;
    if (code) h["x-user-code"] = code;
    return h;
  }

  function usuario() {
    return localStorage.getItem("userName") || localStorage.getItem("userCode") || "SGC";
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function stClass(st) {
    return "st-" + String(st || "").replace(/\s+/g, "-");
  }

  document.querySelectorAll(".req-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".req-tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".req-panel").forEach((p) => {
        p.classList.toggle("active", p.id === "panel" + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1));
      });
    });
  });

  document.getElementById("tabControle").addEventListener("click", () => {
    document.getElementById("panelControle").classList.add("active");
    document.getElementById("panelNova").classList.remove("active");
  });
  document.getElementById("tabNova").addEventListener("click", () => {
    document.getElementById("panelNova").classList.add("active");
    document.getElementById("panelControle").classList.remove("active");
  });

  async function api(method, acao, opts) {
    const q = new URLSearchParams({ acao, ...((opts && opts.query) || {}) });
    const nivel = localStorage.getItem("userLevel");
    if (nivel) q.set("userLevel", nivel);
    const res = await fetch(`${API}?${q}`, {
      method,
      headers: authHeaders(),
      body: method === "GET" ? undefined : JSON.stringify({
        acao,
        usuario: usuario(),
        userLevel: localStorage.getItem("userLevel") || undefined,
        ...(opts && opts.body),
      }),
    });
    if (acao === "foto" && method === "GET") return res;
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    return data;
  }

  async function carregarLotes() {
    const data = await api("GET", "lotes");
    lotes = data.data || [];
    const cur = filtroLote.value;
    filtroLote.innerHTML =
      `<option value="">Todas as listas</option>` +
      lotes.map((l) => `<option value="${l.id}">#${l.id} ${escapeHtml(l.nome)} (${l.feitas}/${l.total})</option>`).join("");
    if (cur) filtroLote.value = cur;
  }

  async function carregarItens() {
    tbody.innerHTML = `<tr><td class="empty" colspan="7"><i class="fa fa-spinner fa-spin"></i> Carregando...</td></tr>`;
    const query = {};
    if (filtroLote.value) query.loteId = filtroLote.value;
    if (filtroStatus.value) query.status = filtroStatus.value;
    if (busca.value.trim()) query.q = busca.value.trim();
    const data = await api("GET", "itens", { query });
    itens = data.itens || [];
    const t = data.totais || { total: 0, feitas: 0, aFazer: 0, andamento: 0 };
    document.getElementById("kpiFeitas").textContent = t.feitas;
    document.getElementById("kpiTotal").textContent = t.total;
    document.getElementById("kpiFazer").textContent = t.aFazer;
    document.getElementById("kpiAnd").textContent = t.andamento;
    renderTabela();
  }

  function renderTabela() {
    if (!itens.length) {
      tbody.innerHTML = `<tr><td class="empty" colspan="7">Nenhum SKU. Envie um CSV na aba Nova lista.</td></tr>`;
      return;
    }
    tbody.innerHTML = itens
      .map((it) => {
        const opts = ["A FAZER", "EM ANDAMENTO", "UPADO"]
          .map((s) => `<option value="${s}" ${it.status === s ? "selected" : ""}>${s}</option>`)
          .join("");
        const slots = [1, 2, 3, 4]
          .map((slot) => {
            const has = it.fotos && it.fotos[slot];
            if (has) {
              return `<div class="foto-slot has" data-view="${it.id}:${slot}" title="Clique para ver · duplo clique para trocar">
                <i class="fa-solid fa-check"></i>
                <input type="file" accept="image/*" data-foto="${it.id}:${slot}" />
              </div>`;
            }
            return `<label class="foto-slot" title="Enviar foto ${slot}">
              ${slot}
              <input type="file" accept="image/*" data-foto="${it.id}:${slot}" />
            </label>`;
          })
          .join("");
        return `<tr data-id="${it.id}">
          <td><input type="checkbox" class="chk-item" data-id="${it.id}" /></td>
          <td class="cod">${escapeHtml(it.codigo)}</td>
          <td>${escapeHtml(it.descricao)}</td>
          <td>${escapeHtml(it.linha)}</td>
          <td>
            <select class="status-sel ${stClass(it.status)}" data-id="${it.id}">${opts}</select>
          </td>
          <td><div class="fotos">${slots}</div></td>
          <td>${escapeHtml(it.loteNome)}</td>
        </tr>`;
      })
      .join("");
  }

  tbody.addEventListener("change", async (e) => {
    const sel = e.target.closest(".status-sel");
    if (sel) {
      try {
        await api("POST", "status", { body: { itemId: Number(sel.dataset.id), status: sel.value } });
        await carregarItens();
        await carregarLotes();
      } catch (err) {
        alert(err.message);
      }
      return;
    }
    const fileInp = e.target.matches("input[type=file][data-foto]") ? e.target : null;
    if (fileInp && fileInp.files[0]) {
      const [itemId, slot] = fileInp.dataset.foto.split(":");
      try {
        const packed = await compactarImagem(fileInp.files[0]);
        await api("POST", "foto", {
          body: { itemId: Number(itemId), slot: Number(slot), nome: fileInp.files[0].name, mime: packed.mime, data: packed.data },
        });
        await carregarItens();
      } catch (err) {
        alert(err.message);
      }
    }
  });

  tbody.addEventListener("click", async (e) => {
    const view = e.target.closest("[data-view]");
    if (!view || e.target.closest("input")) return;
    e.preventDefault();
    const [itemId, slot] = view.getAttribute("data-view").split(":");
    try {
      const res = await fetch(`${API}?acao=foto&itemId=${itemId}&slot=${slot}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Foto não encontrada.");
      const blob = await res.blob();
      lightboxImg.src = URL.createObjectURL(blob);
      lightbox.classList.add("open");
    } catch (err) {
      alert(err.message);
    }
  });
  tbody.addEventListener("dblclick", (e) => {
    const view = e.target.closest("[data-view]");
    if (!view) return;
    e.preventDefault();
    const inp = view.querySelector("input[type=file]");
    if (inp) inp.click();
  });
  lightbox.addEventListener("click", () => lightbox.classList.remove("open"));

  document.getElementById("chkAll").addEventListener("change", (e) => {
    tbody.querySelectorAll(".chk-item").forEach((c) => {
      c.checked = e.target.checked;
    });
  });

  document.getElementById("btnBulk").addEventListener("click", async () => {
    const st = document.getElementById("bulkStatus").value;
    const ids = [...tbody.querySelectorAll(".chk-item:checked")].map((c) => Number(c.dataset.id));
    if (!st || !ids.length) {
      alert("Selecione SKUs e o novo status.");
      return;
    }
    try {
      await api("POST", "status-lote", { body: { itemIds: ids, status: st } });
      await carregarItens();
      await carregarLotes();
    } catch (err) {
      alert(err.message);
    }
  });

  document.getElementById("btnReload").addEventListener("click", () => carregarItens().catch((e) => alert(e.message)));
  filtroStatus.addEventListener("change", () => carregarItens().catch((e) => alert(e.message)));
  filtroLote.addEventListener("change", () => carregarItens().catch((e) => alert(e.message)));
  let tBusca;
  busca.addEventListener("input", () => {
    clearTimeout(tBusca);
    tBusca = setTimeout(() => carregarItens().catch((e) => alert(e.message)), 300);
  });

  const dropzone = document.getElementById("fileDropzone");
  const csvFile = document.getElementById("csvFile");
  const dropTitle = document.getElementById("fileDropzoneTitle");
  csvFile.addEventListener("change", () => {
    dropTitle.textContent = csvFile.files[0] ? csvFile.files[0].name : "Clique ou arraste o .csv";
    dropzone.classList.toggle("has-file", !!csvFile.files[0]);
  });
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && /\.csv$/i.test(f.name)) {
      const dt = new DataTransfer();
      dt.items.add(f);
      csvFile.files = dt.files;
      csvFile.dispatchEvent(new Event("change"));
    }
  });

  function baixarModeloCsv(e) {
    if (e) e.preventDefault();
    const linhas = [
      "codigo;descricao;linha",
      "309174;CAPA OVVI APPLE IPHONE 18 PRO MAX SILICONE MAGSAFE AZUL CLARO;liquid",
      "309359;CAPA CUSTOMIC IPHONE 17/18 PRO IMPACTOR SPACE MAGSAFE DARK PURPLE;space",
    ];
    const blob = new Blob(["\uFEFF" + linhas.join("\r\n") + "\r\n"], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "modelo-mockups.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const btnModelo = document.getElementById("btnModeloCsv");
  const btnModelo2 = document.getElementById("btnModeloCsv2");
  if (btnModelo) btnModelo.addEventListener("click", baixarModeloCsv);
  if (btnModelo2) btnModelo2.addEventListener("click", baixarModeloCsv);

  document.getElementById("csvForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const file = csvFile.files[0];
    const nome = document.getElementById("nomeLista").value.trim();
    if (!file || !nome) return;
    csvStatus.style.color = "#333";
    csvStatus.textContent = "Lendo CSV…";
    try {
      const texto = await file.text();
      const itensCsv = parseCsv(texto);
      if (!itensCsv.length) throw new Error("Nenhum item. Use colunas codigo e descricao.");
      csvStatus.textContent = `Enviando ${itensCsv.length} SKU(s)…`;
      const data = await api("POST", "criar-csv", { body: { nome, itens: itensCsv } });
      csvStatus.style.color = "#2e7d32";
      csvStatus.textContent = data.message;
      csvFile.value = "";
      dropTitle.textContent = "Clique ou arraste o .csv";
      dropzone.classList.remove("has-file");
      await carregarLotes();
      await carregarItens();
      document.getElementById("tabControle").click();
    } catch (err) {
      csvStatus.style.color = "#c62828";
      csvStatus.textContent = err.message;
    }
  });

  function parseCsv(texto) {
    const raw = String(texto || "").replace(/^\uFEFF/, "");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return [];
    const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
    const split = (line) => {
      const out = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (q && line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else q = !q;
        } else if (ch === sep && !q) {
          out.push(cur);
          cur = "";
        } else cur += ch;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };
    const header = split(lines[0]).map((h) =>
      h
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
    );
    const idx = (aliases) => {
      for (const a of aliases) {
        const i = header.indexOf(a);
        if (i >= 0) return i;
      }
      return -1;
    };
    const iCod = idx(["CODIGO", "COD", "CODE", "SKU", "PRODUTO"]);
    const iDesc = idx(["DESCRICAO", "DESC", "NOME"]);
    const iLinha = idx(["LINHA", "COLECAO", "COLLECTION"]);
    if (iCod < 0) return [];
    const itensOut = [];
    const seen = new Set();
    for (let r = 1; r < lines.length; r++) {
      const cols = split(lines[r]);
      const codigo = (cols[iCod] || "").trim();
      if (!codigo) continue;
      const key = codigo.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      itensOut.push({
        codigo,
        descricao: iDesc >= 0 ? cols[iDesc] || "" : "",
        linha: iLinha >= 0 ? cols[iLinha] || "" : "",
      });
    }
    return itensOut;
  }

  function compactarImagem(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("Envie uma imagem."));
        return;
      }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1600;
        let w = img.width;
        let h = img.height;
        if (w > max || h > max) {
          const s = Math.min(max / w, max / h);
          w = Math.round(w * s);
          h = Math.round(h * s);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        resolve({ mime: "image/jpeg", data: dataUrl.split(",")[1] });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Não foi possível ler a imagem."));
      };
      img.src = url;
    });
  }

  try {
    await carregarLotes();
    await carregarItens();
  } catch (err) {
    tbody.innerHTML = `<tr><td class="empty" colspan="7" style="color:#c62828;">${escapeHtml(err.message)}</td></tr>`;
  }
});
