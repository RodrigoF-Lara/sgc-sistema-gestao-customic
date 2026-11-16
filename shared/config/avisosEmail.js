document.addEventListener("DOMContentLoaded", async () => {
  if (window.SGCPermissoes) {
    const ok = await window.SGCPermissoes.protegerPagina("avisos-email");
    if (!ok) return;
  }

  const body = document.getElementById("matrixBody");
  const btnSalvar = document.getElementById("btnSalvar");
  const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let fluxos = [];
  let dirty = false;

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

  function msg(texto, tipo) {
    const el = document.getElementById("status-msg");
    el.textContent = texto || "";
    el.className = "status-msg" + (texto ? " " + (tipo || "info") : "");
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
    btnSalvar.disabled = !dirty;
    document.getElementById("dirtyDot").classList.toggle("show", dirty);
  }

  function escapar(valor) {
    return String(valor ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function linhaHtml(fluxo, indice) {
    const chips = fluxo.emails.map((email, pos) => (
      `<li>${escapar(email)}<button type="button" data-remover="${indice}" data-pos="${pos}" aria-label="Remover ${escapar(email)}">&times;</button></li>`
    )).join("");
    return `<tr>
      <td class="col-link">
        <span class="link-label"><i class="fa-solid fa-envelope"></i>${escapar(fluxo.label)}</span>
        <span class="link-id">${escapar(fluxo.descricao)}</span>
      </td>
      <td>
        <input type="checkbox" data-ativo="${indice}" ${fluxo.ativo ? "checked" : ""} aria-label="Aviso ligado" />
      </td>
      <td class="col-emails">
        ${chips ? `<ul class="emails">${chips}</ul>` : `<p class="vazio">Nenhum e-mail. O processo segue e o aviso não sai.</p>`}
        <div class="linha-email">
          <input type="email" data-novo="${indice}" placeholder="nome@customic.com.br" aria-label="E-mail de ${escapar(fluxo.label)}" />
          <button type="button" class="btn-add" data-adicionar="${indice}">Adicionar</button>
        </div>
      </td>
    </tr>`;
  }

  function desenhar(focar) {
    const secoes = [];
    const porSecao = new Map();
    fluxos.forEach((fluxo, indice) => {
      const secao = fluxo.secao || "Orçamentos";
      if (!porSecao.has(secao)) {
        porSecao.set(secao, []);
        secoes.push(secao);
      }
      porSecao.get(secao).push({ fluxo, indice });
    });
    let html = "";
    for (const secao of secoes) {
      html += `<tr class="section-row"><td colspan="3"><i class="fa fa-folder-open"></i> ${escapar(secao)}</td></tr>`;
      for (const item of porSecao.get(secao)) html += linhaHtml(item.fluxo, item.indice);
    }
    body.innerHTML = html || `<tr><td colspan="3" style="padding:24px;color:#888">Nenhum processo cadastrado.</td></tr>`;
    if (focar != null) {
      const campo = body.querySelector(`[data-novo="${focar}"]`);
      if (campo) campo.focus();
    }
  }

  function adicionar(indice) {
    const campo = body.querySelector(`[data-novo="${indice}"]`);
    const email = String(campo && campo.value || "").trim().toLowerCase();
    if (!email) return false;
    if (!EMAIL_OK.test(email) || email.length > 200) {
      msg("E-mail inválido.", "error");
      return false;
    }
    if (fluxos[indice].emails.includes(email)) {
      campo.value = "";
      return true;
    }
    if (fluxos[indice].emails.length >= 15) {
      msg("Use no máximo 15 e-mails por aviso.", "error");
      return false;
    }
    fluxos[indice].emails.push(email);
    msg("");
    setDirty(true);
    desenhar(indice);
    return true;
  }

  function recolherPendentes() {
    const novos = [];
    let erro = "";
    body.querySelectorAll("[data-novo]").forEach((campo) => {
      const indice = Number(campo.getAttribute("data-novo"));
      const email = String(campo.value || "").trim().toLowerCase();
      if (!email || erro) return;
      if (!EMAIL_OK.test(email) || email.length > 200) {
        erro = "E-mail inválido.";
        return;
      }
      const jaTem = fluxos[indice].emails.includes(email) || novos.some((item) => item.indice === indice && item.email === email);
      const total = fluxos[indice].emails.length + novos.filter((item) => item.indice === indice).length;
      if (!jaTem && total >= 15) {
        erro = "Use no máximo 15 e-mails por aviso.";
        return;
      }
      if (!jaTem) novos.push({ indice, email });
    });
    if (erro) return erro;
    if (novos.length) setDirty(true);
    novos.forEach((item) => fluxos[item.indice].emails.push(item.email));
    return "";
  }

  function aplicarLista(data) {
    fluxos = (data || []).map((item) => ({
      codigo: item.codigo,
      secao: item.secao || "Orçamentos",
      label: item.label,
      descricao: item.descricao,
      ativo: item.ativo !== false,
      emails: Array.isArray(item.emails) ? item.emails.slice() : [],
    }));
    desenhar();
    setDirty(false);
  }

  body.addEventListener("click", (ev) => {
    const remover = ev.target.closest("[data-remover]");
    if (remover) {
      const indice = Number(remover.getAttribute("data-remover"));
      const pos = Number(remover.getAttribute("data-pos"));
      fluxos[indice].emails.splice(pos, 1);
      setDirty(true);
      desenhar(indice);
      return;
    }
    const add = ev.target.closest("[data-adicionar]");
    if (add) adicionar(Number(add.getAttribute("data-adicionar")));
  });

  body.addEventListener("change", (ev) => {
    const caixa = ev.target.closest("[data-ativo]");
    if (!caixa) return;
    fluxos[Number(caixa.getAttribute("data-ativo"))].ativo = caixa.checked;
    setDirty(true);
  });

  body.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    const campo = ev.target.closest("[data-novo]");
    if (!campo) return;
    ev.preventDefault();
    adicionar(Number(campo.getAttribute("data-novo")));
  });

  async function carregar() {
    body.innerHTML = `<tr><td colspan="3" style="padding:24px;color:#888">Carregando avisos…</td></tr>`;
    const nivel = localStorage.getItem("userLevel");
    const q = new URLSearchParams({ tipo: "avisos" });
    if (nivel) q.set("userLevel", nivel);
    const res = await fetch(`/api/shared/config?${q}`, { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || data.message || "Não foi possível carregar os avisos.");
    aplicarLista(data.data);
  }

  document.getElementById("btnRecarregar").addEventListener("click", async () => {
    if (dirty && !window.confirm("Descartar as alterações não salvas?")) return;
    msg("");
    try {
      await carregar();
    } catch (err) {
      body.innerHTML = `<tr><td colspan="3" style="padding:24px;color:#c00">${escapar(err.message)}</td></tr>`;
    }
  });

  btnSalvar.addEventListener("click", async () => {
    const pendente = recolherPendentes();
    if (pendente) {
      msg(pendente, "error");
      return;
    }
    btnSalvar.disabled = true;
    btnSalvar.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Salvando…';
    msg("");
    try {
      const nivel = localStorage.getItem("userLevel");
      const q = new URLSearchParams({ tipo: "avisos" });
      if (nivel) q.set("userLevel", nivel);
      const res = await fetch(`/api/shared/config?${q}`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          usuario: localStorage.getItem("userName") || "SGC",
          fluxos: fluxos.map((item) => ({
            codigo: item.codigo,
            ativo: item.ativo,
            emails: item.emails,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.error || data.message || "Não foi possível salvar.");
      aplicarLista(data.data);
      msg("Avisos salvos.", "success");
    } catch (err) {
      msg(err.message, "error");
      btnSalvar.disabled = !dirty;
    } finally {
      btnSalvar.innerHTML = '<i class="fa fa-save"></i> Salvar alterações';
    }
  });

  try {
    await carregar();
  } catch (err) {
    body.innerHTML = `<tr><td colspan="3" style="padding:24px;color:#c00">${escapar(err.message)}</td></tr>`;
  }
});
