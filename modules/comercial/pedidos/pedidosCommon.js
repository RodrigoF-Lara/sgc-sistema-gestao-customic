window.PedidosCapa = (() => {
  const API = "/api/comercial/pedidos";

  const STATUS_LABEL = {
    RASCUNHO: "Rascunho",
    EM_PRODUCAO: "Em produção",
    PRODUZIDO: "Produzido",
    ENVIADO: "Enviado",
    CANCELADO: "Cancelado",
  };

  function authHeaders() {
    const h = { "Content-Type": "application/json" };
    if (window.SGCPermissoes) Object.assign(h, window.SGCPermissoes.authHeaders());
    else {
      const nivel = localStorage.getItem("userLevel");
      const code = localStorage.getItem("userCode");
      if (nivel) h["x-user-level"] = nivel;
      if (code) h["x-user-code"] = code;
    }
    const nome = localStorage.getItem("userName");
    if (nome) h["x-user-name"] = nome;
    return h;
  }

  async function api(acao, opts) {
    const method = (opts && opts.method) || "GET";
    const params = new URLSearchParams({ acao, ...((opts && opts.query) || {}) });
    const res = await fetch(`${API}?${params}`, {
      method,
      headers: authHeaders(),
      body: method === "GET" ? undefined : JSON.stringify(opts.body || {}),
    });
    if (acao === "anexo" && res.ok) return res;
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data.error || data.message || `Erro ${res.status}`);
    }
    return data;
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function fmtDate(v) {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
    return d.toLocaleDateString("pt-BR");
  }

  function fmtDateTime(v) {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString("pt-BR");
  }

  function statusBadge(status) {
    const label = STATUS_LABEL[status] || status;
    return `<span class="st-badge st-${String(status || "").toLowerCase()}">${label}</span>`;
  }

  function hojeISO() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function anexoUrl(id, tipo) {
    return `${API}?acao=anexo&id=${id}&tipoAnexo=${tipo}`;
  }

  return {
    api,
    authHeaders,
    blobToBase64,
    fmtDate,
    fmtDateTime,
    statusBadge,
    hojeISO,
    anexoUrl,
    STATUS_LABEL,
  };
})();
