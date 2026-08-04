/**
 * Admin — Matriz de permissões (link_id × nível)
 * Protegido: apenas nível 1 (Administrador)
 */
(function () {
  const ADMIN_CODIGOS = new Set(["adm", "1", "administrador", "admin"]);
  function isAdminCodigo(codigo) {
    return ADMIN_CODIGOS.has(String(codigo || "").trim().toLowerCase());
  }

  let niveis = [];
  let links = [];
  let acoes = [];
  let matriz = {}; // link_id -> { nivel: bool }
  let dirty = false;

  function authHeaders() {
    if (window.SGCPermissoes) return window.SGCPermissoes.authHeaders();
    const h = { "Content-Type": "application/json" };
    const nivel = localStorage.getItem("userLevel");
    const code = localStorage.getItem("userCode");
    if (nivel) h["x-user-level"] = nivel;
    if (code) h["x-user-code"] = code;
    return h;
  }

  function verificarAdmin() {
    const nivel = String(localStorage.getItem("userLevel") || "").trim();
    if (!localStorage.getItem("userName")) {
      window.location.href = "/index.html";
      return false;
    }
    const n = nivel.toLowerCase();
    if (n !== "adm" && n !== "1" && n !== "administrador" && n !== "admin") {
      alert("Acesso negado. Apenas ADM podem editar permissões.");
      window.location.href = "/menu.html";
      return false;
    }
    return true;
  }

  function msg(texto, tipo) {
    const el = document.getElementById("status-msg");
    el.textContent = texto;
    el.className = "status-msg " + (tipo || "info");
    if (tipo === "success" || tipo === "error") {
      setTimeout(() => {
        if (el.textContent === texto) {
          el.className = "status-msg";
          el.textContent = "";
        }
      }, 6000);
    }
  }

  function setDirty(v) {
    dirty = !!v;
    document.getElementById("btnSalvar").disabled = !dirty;
    document.getElementById("dirtyDot").classList.toggle("show", dirty);
  }

  async function carregarTudo() {
    const body = document.getElementById("matrixBody");
    body.innerHTML = `<tr><td style="padding:24px;color:#888">Carregando matriz…</td></tr>`;

    try {
      const [rNiveis, rCatalogo, rMatriz] = await Promise.all([
        fetch("/api/shared/niveis", { headers: authHeaders() }),
        fetch("/api/shared/permissoes?action=catalogo", { headers: authHeaders() }),
        fetch("/api/shared/permissoes?action=matriz", { headers: authHeaders() }),
      ]);

      const dNiveis = await rNiveis.json();
      const dCatalogo = await rCatalogo.json();
      const dMatriz = await rMatriz.json();

      if (!dNiveis.success) throw new Error(dNiveis.error || "Erro ao carregar níveis");
      if (!dCatalogo.success) throw new Error(dCatalogo.error || "Erro ao carregar catálogo");
      if (!dMatriz.success) throw new Error(dMatriz.error || "Erro ao carregar matriz");

      niveis = dNiveis.data || [];
      links = (dCatalogo.data && dCatalogo.data.links) || [];
      acoes = (dCatalogo.data && dCatalogo.data.acoes_especiais) || [];
      matriz = dMatriz.data || {};

      if (dNiveis.warning || dMatriz.warning) {
        msg(dNiveis.warning || dMatriz.warning, "info");
      }

      render();
      setDirty(false);
    } catch (err) {
      console.error(err);
      body.innerHTML = `<tr><td style="padding:24px;color:#c00">${err.message}</td></tr>`;
    }
  }

  function getChecked(linkId, nivel) {
    if (isAdminCodigo(nivel)) return true;
    return !!(matriz[linkId] && matriz[linkId][nivel]);
  }

  function setChecked(linkId, nivel, val) {
    if (isAdminCodigo(nivel)) return;
    if (!matriz[linkId]) matriz[linkId] = {};
    matriz[linkId][nivel] = !!val;
    setDirty(true);
  }

  function render() {
    const head = document.getElementById("matrixHead");
    const body = document.getElementById("matrixBody");

    // Colunas: níveis não-admin primeiro na UI, admin no fim (disabled)
    const cols = niveis.slice().sort((a, b) => {
      if (isAdminCodigo(a.codigo)) return 1;
      if (isAdminCodigo(b.codigo)) return -1;
      return (a.ordem || 0) - (b.ordem || 0);
    });

    head.innerHTML = `
      <tr>
        <th class="col-link">Módulo / Ação</th>
        ${cols
          .map((n) => {
            const isAdm = isAdminCodigo(n.codigo);
            const tools = isAdm
              ? ""
              : `<div style="margin-top:6px;display:flex;gap:4px;justify-content:center;flex-wrap:wrap">
                  <span class="chip" data-all="${escapeAttr(n.codigo)}" title="Liberar tudo">✓ tudo</span>
                  <span class="chip danger" data-none="${escapeAttr(n.codigo)}" title="Bloquear tudo">✗ tudo</span>
                </div>`;
            const setorHint = n.setor
              ? `<div style="font-weight:400;text-transform:none;letter-spacing:0;color:#64748b;margin-top:2px;font-size:.9em">${escapeHtml(n.setor)}</div>`
              : "";
            return `<th>
              ${escapeHtml(n.label)}
              ${setorHint}
              <div style="font-weight:400;text-transform:none;letter-spacing:0;color:#999;margin-top:2px">
                <code>${escapeHtml(n.codigo)}</code>
              </div>
              ${tools}
            </th>`;
          })
          .join("")}
      </tr>`;

    // Agrupa links por section
    const bySection = {};
    const sectionOrder = [];
    for (const link of links) {
      if (link.id === "home") continue; // home sempre livre — não precisa na matriz
      const sec = link.section_label || link.section || "Outros";
      if (!bySection[sec]) {
        bySection[sec] = [];
        sectionOrder.push(sec);
      }
      bySection[sec].push(link);
    }

    let html = "";

    for (const sec of sectionOrder) {
      html += `<tr class="section-row"><td colspan="${cols.length + 1}"><i class="fa fa-folder-open"></i> ${escapeHtml(sec)}</td></tr>`;
      for (const link of bySection[sec]) {
        html += rowHtml(link, cols);
      }
    }

    if (acoes.length) {
      html += `<tr class="section-row"><td colspan="${cols.length + 1}"><i class="fa fa-bolt"></i> Ações especiais</td></tr>`;
      for (const ac of acoes) {
        html += rowHtml(
          {
            id: ac.id,
            label: ac.label,
            icon: ac.icon || "fa-bolt",
            desc: ac.desc,
          },
          cols
        );
      }
    }

    body.innerHTML = html || `<tr><td style="padding:24px;color:#888">Catálogo vazio</td></tr>`;

    // eventos checkbox
    body.querySelectorAll('input[type="checkbox"][data-link]').forEach((cb) => {
      cb.addEventListener("change", () => {
        setChecked(cb.getAttribute("data-link"), cb.getAttribute("data-nivel"), cb.checked);
      });
    });

    // chips liberar/bloquear tudo
    head.querySelectorAll("[data-all]").forEach((chip) => {
      chip.addEventListener("click", () => bulk(chip.getAttribute("data-all"), true));
    });
    head.querySelectorAll("[data-none]").forEach((chip) => {
      chip.addEventListener("click", () => bulk(chip.getAttribute("data-none"), false));
    });
  }

  function rowHtml(link, cols) {
    const icon = link.icon ? `<i class="fa ${link.icon}"></i>` : "";
    const desc = link.desc
      ? `<span class="link-id">${escapeHtml(link.desc)}</span>`
      : `<span class="link-id">${escapeHtml(link.id)}</span>`;

    const cells = cols
      .map((n) => {
        const isAdm = isAdminCodigo(n.codigo);
        const checked = getChecked(link.id, n.codigo);
        if (isAdm) {
          return `<td><input type="checkbox" checked disabled title="ADM sempre tem acesso"></td>`;
        }
        return `<td>
          <input type="checkbox"
            data-link="${escapeAttr(link.id)}"
            data-nivel="${escapeAttr(n.codigo)}"
            ${checked ? "checked" : ""}>
        </td>`;
      })
      .join("");

    return `<tr>
      <td class="col-link">
        <span class="link-label">${icon}${escapeHtml(link.label)}</span>
        ${desc}
      </td>
      ${cells}
    </tr>`;
  }

  function bulk(nivel, value) {
    const allIds = [
      ...links.filter((l) => l.id !== "home").map((l) => l.id),
      ...acoes.map((a) => a.id),
    ];
    for (const id of allIds) {
      setChecked(id, nivel, value);
    }
    // atualiza checkboxes no DOM
    document.querySelectorAll(`input[data-nivel="${cssEscape(nivel)}"]`).forEach((cb) => {
      cb.checked = value;
    });
    setDirty(true);
  }

  async function salvar() {
    // Monta payload com todos os checkboxes (não-admin)
    const permissoes = [];
    const allIds = [
      ...links.filter((l) => l.id !== "home").map((l) => l.id),
      ...acoes.map((a) => a.id),
    ];
    for (const linkId of allIds) {
      for (const n of niveis) {
        if (isAdminCodigo(n.codigo)) continue;
        permissoes.push({
          link_id: linkId,
          nivel: n.codigo,
          permitido: getChecked(linkId, n.codigo),
        });
      }
    }

    const btn = document.getElementById("btnSalvar");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Salvando…';

    try {
      const res = await fetch("/api/shared/permissoes", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ permissoes }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        msg(`Permissões salvas (${data.gravados} registros).`, "success");
        setDirty(false);
        if (window.SGCPermissoes) window.SGCPermissoes.invalidarCache();
      } else {
        msg(data.error || "Erro ao salvar", "error");
        setDirty(true);
      }
    } catch (err) {
      msg(err.message, "error");
      setDirty(true);
    } finally {
      btn.innerHTML = '<i class="fa fa-save"></i> Salvar alterações';
      btn.disabled = !dirty;
    }
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }
  function escapeAttr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }
  function cssEscape(s) {
    // suficiente para códigos numéricos/underscore
    return String(s).replace(/"/g, '\\"');
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!verificarAdmin()) return;

    document.getElementById("btnSalvar").addEventListener("click", salvar);
    document.getElementById("btnRecarregar").addEventListener("click", () => {
      if (dirty && !confirm("Há alterações não salvas. Recarregar mesmo assim?")) return;
      carregarTudo();
    });

    window.addEventListener("beforeunload", (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    });

    carregarTudo();
  });
})();
