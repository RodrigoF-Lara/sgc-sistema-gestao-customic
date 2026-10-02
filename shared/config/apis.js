document.addEventListener("DOMContentLoaded", async () => {
  if (window.SGCPermissoes) {
    const ok = await window.SGCPermissoes.protegerPagina("apis");
    if (!ok) return;
    if (!window.SGCPermissoes.isAdmin()) {
      alert("Só administrador vê as chaves de API.");
      window.location.href = "/menu.html";
      return;
    }
  }

  const erro = document.getElementById("erroApi");
  const status = document.getElementById("statusCopia");

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

  async function api(method, acao) {
    const q = new URLSearchParams({ acao });
    const nivel = localStorage.getItem("userLevel");
    if (nivel) q.set("userLevel", nivel);
    const res = await fetch(`/api/design/mockups?${q}`, {
      method,
      headers: authHeaders(),
      body: method === "GET" ? undefined : JSON.stringify({
        acao,
        usuario: localStorage.getItem("userName") || "SGC",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    return data;
  }

  function mostrar(data) {
    erro.hidden = true;
    document.getElementById("apiListaUrl").value = data.listaUrl || "";
    document.getElementById("apiFotoModelo").textContent = data.fotoUrl
      ? `Modelo da foto: ${data.fotoUrl}`
      : "";
    const ambiente = data.origem === "ambiente";
    document.getElementById("apiAmbiente").hidden = !ambiente;
    document.getElementById("apiChave").hidden = ambiente;
    document.querySelector("label[for='apiChave']").hidden = ambiente;
    document.getElementById("apiChave").value = ambiente ? "" : (data.chave || "");
    document.getElementById("btnCopiarChave").hidden = ambiente;
    document.getElementById("btnNovaChave").hidden = ambiente;
  }

  async function copiar(id) {
    const el = document.getElementById(id);
    if (!el.value) return;
    try {
      await navigator.clipboard.writeText(el.value);
    } catch (_) {
      el.focus();
      el.select();
      document.execCommand("copy");
    }
    status.textContent = "Copiado.";
  }

  document.getElementById("btnCopiarUrl").addEventListener("click", () => copiar("apiListaUrl"));
  document.getElementById("btnCopiarChave").addEventListener("click", () => copiar("apiChave"));
  document.getElementById("btnNovaChave").addEventListener("click", async () => {
    if (!confirm("A chave atual para de funcionar nos outros programas. Gerar outra?")) return;
    const btn = document.getElementById("btnNovaChave");
    btn.disabled = true;
    status.textContent = "";
    try {
      mostrar(await api("POST", "chave-api"));
      status.textContent = "Nova chave gerada. Copie e atualize os outros programas.";
    } catch (err) {
      erro.hidden = false;
      erro.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  try {
    mostrar(await api("GET", "chave-api"));
  } catch (err) {
    erro.hidden = false;
    erro.textContent = err.message;
  }
});
