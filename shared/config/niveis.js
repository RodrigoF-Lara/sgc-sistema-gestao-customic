/**
 * Admin — CRUD de cargos (cargo + setor)
 * Protegido: apenas ADM
 */
(function () {
  function authHeaders() {
    if (window.SGCPermissoes) return window.SGCPermissoes.authHeaders();
    const h = { "Content-Type": "application/json" };
    const nivel = localStorage.getItem("userLevel");
    const code = localStorage.getItem("userCode");
    if (nivel) h["x-user-level"] = nivel;
    if (code) h["x-user-code"] = code;
    return h;
  }

  function isAdm(nivel) {
    const n = String(nivel || "").trim().toLowerCase();
    return n === "adm" || n === "1" || n === "administrador" || n === "admin";
  }

  function verificarAdmin() {
    const nivel = String(localStorage.getItem("userLevel") || "").trim();
    if (!localStorage.getItem("userName")) {
      window.location.href = "/index.html";
      return false;
    }
    if (!isAdm(nivel)) {
      alert("Acesso negado. Apenas ADM podem gerenciar cargos.");
      window.location.href = "/menu.html";
      return false;
    }
    return true;
  }

  function msg(texto, tipo) {
    const el = document.getElementById("status-msg");
    el.textContent = texto;
    el.className = "status-msg " + tipo;
    setTimeout(() => {
      el.className = "status-msg";
      el.textContent = "";
    }, 5000);
  }

  async function carregar() {
    const tbody = document.getElementById("niveisBody");
    try {
      const res = await fetch("/api/shared/niveis", { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) {
        tbody.innerHTML = `<tr><td colspan="6" style="color:#c00">${data.error || "Erro ao carregar"}</td></tr>`;
        return;
      }
      if (data.warning) msg(data.warning, "error");
      render(data.data || []);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="color:#c00">${err.message}</td></tr>`;
    }
  }

  function render(lista) {
    const tbody = document.getElementById("niveisBody");
    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="color:#888">Nenhum cargo cadastrado</td></tr>`;
      return;
    }
    tbody.innerHTML = lista
      .map((n) => {
        const flags = n.protegido
          ? `<span class="badge protegido">protegido</span>`
          : `<span class="badge">editável</span>`;
        const setorBadge = n.setor
          ? `<span class="badge setor">${escapeHtml(n.setor)}</span>`
          : `<span style="color:#bbb">—</span>`;
        const delBtn = n.protegido
          ? ""
          : `<button type="button" class="btn-icon delete" title="Excluir" data-del="${n.id}" data-label="${escapeAttr(n.label)}"><i class="fa fa-trash"></i></button>`;
        return `
          <tr>
            <td><code>${escapeHtml(n.codigo)}</code></td>
            <td>${escapeHtml(n.label)}</td>
            <td>${setorBadge}</td>
            <td>${n.ordem}</td>
            <td>${flags}</td>
            <td class="acoes">
              <button type="button" class="btn-icon" title="Editar"
                data-edit="${n.id}"
                data-codigo="${escapeAttr(n.codigo)}"
                data-label="${escapeAttr(n.label)}"
                data-setor="${escapeAttr(n.setor || "")}"
                data-ordem="${n.ordem}">
                <i class="fa fa-edit"></i>
              </button>
              ${delBtn}
            </td>
          </tr>`;
      })
      .join("");

    tbody.querySelectorAll("[data-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById("nivelId").value = btn.getAttribute("data-edit");
        document.getElementById("codigo").value = btn.getAttribute("data-codigo");
        document.getElementById("codigo").disabled = true;
        document.getElementById("label").value = btn.getAttribute("data-label");
        document.getElementById("setor").value = btn.getAttribute("data-setor") || "";
        document.getElementById("ordem").value = btn.getAttribute("data-ordem");
        document.getElementById("form-title").textContent = "Editar cargo";
        document.getElementById("editActions").style.display = "flex";
      });
    });

    tbody.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => excluir(btn.getAttribute("data-del"), btn.getAttribute("data-label")));
    });
  }

  function limparForm() {
    document.getElementById("nivelForm").reset();
    document.getElementById("nivelId").value = "";
    document.getElementById("codigo").disabled = false;
    document.getElementById("ordem").value = "100";
    document.getElementById("form-title").textContent = "Novo cargo";
    document.getElementById("editActions").style.display = "none";
  }

  /** Sugere código a partir do label: "GERENTE (estoque)" → gerente_estoque */
  function sugerirCodigoDoLabel(label) {
    const m = String(label || "").match(/^(.+?)\s*\((.+)\)\s*$/);
    if (m) {
      const cargo = m[1].trim();
      const setor = m[2].trim();
      return (cargo + "_" + setor)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
    }
    return String(label || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
  }

  function extrairSetorDoLabel(label) {
    const m = String(label || "").match(/\((.+)\)\s*$/);
    return m ? m[1].trim().toUpperCase() : "";
  }

  async function salvar(e) {
    e.preventDefault();
    const id = document.getElementById("nivelId").value;
    let codigo = document.getElementById("codigo").value;
    const label = document.getElementById("label").value;
    let setor = document.getElementById("setor").value;
    const ordem = document.getElementById("ordem").value;

    if (!id && !codigo && label) {
      codigo = sugerirCodigoDoLabel(label);
      document.getElementById("codigo").value = codigo;
    }
    if (!setor && label) {
      setor = extrairSetorDoLabel(label);
      if (setor) document.getElementById("setor").value = setor;
    }

    const body = id
      ? { action: "update", id: parseInt(id, 10), label, setor, ordem: parseInt(ordem, 10) }
      : { action: "create", codigo, label, setor, ordem: parseInt(ordem, 10) };

    try {
      const res = await fetch("/api/shared/niveis", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        msg(id ? "Cargo atualizado." : "Cargo criado.", "success");
        limparForm();
        carregar();
      } else {
        msg(data.error || "Erro ao salvar", "error");
      }
    } catch (err) {
      msg(err.message, "error");
    }
  }

  async function excluir(id, label) {
    if (!confirm(`Excluir o cargo "${label}"?\n\nSó é possível se não houver usuários com esse cargo.\nAs permissões também serão removidas.`)) {
      return;
    }
    try {
      const res = await fetch("/api/shared/niveis", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ action: "delete", id: parseInt(id, 10) }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        msg("Cargo excluído.", "success");
        carregar();
      } else {
        msg(data.error || "Erro ao excluir", "error");
      }
    } catch (err) {
      msg(err.message, "error");
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

  document.addEventListener("DOMContentLoaded", () => {
    if (!verificarAdmin()) return;

    // Uppercase no setor
    document.getElementById("setor").addEventListener("input", (e) => {
      e.target.value = e.target.value.toUpperCase();
    });

    // Ao digitar label, sugere código e setor (só em criação)
    document.getElementById("label").addEventListener("blur", () => {
      if (document.getElementById("nivelId").value) return;
      const label = document.getElementById("label").value;
      const codEl = document.getElementById("codigo");
      if (!codEl.value && label) codEl.value = sugerirCodigoDoLabel(label);
      const setEl = document.getElementById("setor");
      if (!setEl.value && label) {
        const s = extrairSetorDoLabel(label);
        if (s) setEl.value = s;
      }
    });

    document.getElementById("nivelForm").addEventListener("submit", salvar);
    document.getElementById("btnCancelar").addEventListener("click", limparForm);
    carregar();
  });
})();
