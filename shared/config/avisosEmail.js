document.addEventListener("DOMContentLoaded", async () => {
  if (window.SGCPermissoes) {
    const ok = await window.SGCPermissoes.protegerPagina("avisos-email");
    if (!ok) return;
  }

  const lista = document.getElementById("lista");
  const rodape = document.getElementById("rodape");
  const avisoEl = document.getElementById("aviso");
  const btnSalvar = document.getElementById("btnSalvar");
  let fluxos = [];

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

  function aviso(msg, tipo) {
    if (!msg) {
      avisoEl.hidden = true;
      avisoEl.textContent = "";
      return;
    }
    avisoEl.hidden = false;
    avisoEl.className = "aviso " + (tipo || "erro");
    avisoEl.textContent = msg;
  }

  function escapar(valor) {
    return String(valor ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function desenhar() {
    lista.innerHTML = fluxos.map((fluxo, indice) => {
      const chips = fluxo.emails.map((email, pos) => (
        `<li>${escapar(email)}<button type="button" data-remover="${indice}" data-pos="${pos}" aria-label="Remover ${escapar(email)}">&times;</button></li>`
      )).join("");
      return `<article class="card">
        <h2>${escapar(fluxo.label)}</h2>
        <p>${escapar(fluxo.descricao)}</p>
        <label class="liga"><input type="checkbox" data-ativo="${indice}" ${fluxo.ativo ? "checked" : ""} /> Aviso ligado</label>
        ${chips ? `<ul class="emails">${chips}</ul>` : `<p class="vazio">Nenhum destinatário. O processo segue, e o aviso não sai.</p>`}
        <div class="linha">
          <input type="email" data-novo="${indice}" placeholder="nome@customic.com.br" />
          <button type="button" class="btn" data-adicionar="${indice}">Adicionar</button>
        </div>
      </article>`;
    }).join("");
    rodape.hidden = fluxos.length === 0;
  }

  function adicionar(indice) {
    const campo = lista.querySelector(`[data-novo="${indice}"]`);
    const email = String(campo.value || "").trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      aviso("E-mail inválido.");
      return;
    }
    if (fluxos[indice].emails.includes(email)) {
      campo.value = "";
      return;
    }
    if (fluxos[indice].emails.length >= 15) {
      aviso("Use no máximo 15 e-mails por aviso.");
      return;
    }
    fluxos[indice].emails.push(email);
    campo.value = "";
    aviso("");
    desenhar();
  }

  lista.addEventListener("click", (ev) => {
    const remover = ev.target.closest("[data-remover]");
    if (remover) {
      const indice = Number(remover.getAttribute("data-remover"));
      const pos = Number(remover.getAttribute("data-pos"));
      fluxos[indice].emails.splice(pos, 1);
      desenhar();
      return;
    }
    const add = ev.target.closest("[data-adicionar]");
    if (add) adicionar(Number(add.getAttribute("data-adicionar")));
  });

  lista.addEventListener("change", (ev) => {
    const caixa = ev.target.closest("[data-ativo]");
    if (!caixa) return;
    fluxos[Number(caixa.getAttribute("data-ativo"))].ativo = caixa.checked;
  });

  lista.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    const campo = ev.target.closest("[data-novo]");
    if (!campo) return;
    ev.preventDefault();
    adicionar(Number(campo.getAttribute("data-novo")));
  });

  async function carregar() {
    const nivel = localStorage.getItem("userLevel");
    const q = new URLSearchParams({ tipo: "avisos" });
    if (nivel) q.set("userLevel", nivel);
    const res = await fetch(`/api/shared/config?${q}`, { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || data.message || "Não foi possível carregar os avisos.");
    fluxos = (data.data || []).map((item) => ({
      codigo: item.codigo,
      label: item.label,
      descricao: item.descricao,
      ativo: item.ativo !== false,
      emails: Array.isArray(item.emails) ? item.emails.slice() : [],
    }));
    desenhar();
  }

  function recolherPendentes() {
    const novos = [];
    let erro = "";
    lista.querySelectorAll("[data-novo]").forEach((campo) => {
      const indice = Number(campo.getAttribute("data-novo"));
      const email = String(campo.value || "").trim().toLowerCase();
      if (!email || erro) return;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
    novos.forEach((item) => fluxos[item.indice].emails.push(item.email));
    return "";
  }

  btnSalvar.addEventListener("click", async () => {
    const pendente = recolherPendentes();
    if (pendente) {
      aviso(pendente);
      return;
    }
    btnSalvar.disabled = true;
    aviso("");
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
      fluxos = (data.data || []).map((item) => ({
        codigo: item.codigo,
        label: item.label,
        descricao: item.descricao,
        ativo: item.ativo !== false,
        emails: Array.isArray(item.emails) ? item.emails.slice() : [],
      }));
      desenhar();
      aviso("Avisos salvos.", "ok");
    } catch (err) {
      aviso(err.message);
    } finally {
      btnSalvar.disabled = false;
    }
  });

  try {
    await carregar();
  } catch (err) {
    lista.innerHTML = `<p class="aviso erro">${escapar(err.message)}</p>`;
  }
});
