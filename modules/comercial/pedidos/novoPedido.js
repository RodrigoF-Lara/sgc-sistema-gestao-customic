document.addEventListener("DOMContentLoaded", async () => {
  const P = window.PedidosCapa;
  const msg = document.getElementById("statusMsg");
  const btnSalvar = document.getElementById("btnSalvar");
  const btnEnviar = document.getElementById("btnEnviar");
  const pedidoId = Number(new URLSearchParams(location.search).get("id")) || null;
  let editando = false;

  if (window.SGCPermissoes) {
    await window.SGCPermissoes.carregar();
    if (!window.SGCPermissoes.podeAcessar("pedido-capa")) {
      alert("Acesso negado.");
      window.location.href = "/menu.html";
      return;
    }
  }

  function setMsg(text, isErr) {
    msg.textContent = text || "";
    msg.className = "status-msg " + (isErr ? "err" : "ok");
  }

  function toInputDate(v) {
    if (!v) return "";
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  document.getElementById("dataPedido").value = P.hojeISO();
  try {
    await CapaMockup.mount({ catalogBase: "/modules/producao/capas/" });
  } catch (err) {
    setMsg(err.message, true);
  }

  if (pedidoId) {
    try {
      const data = await P.api("obter", { query: { id: String(pedidoId) } });
      const p = data.data;
      if (p.status !== "RASCUNHO" && p.status !== "EM_PRODUCAO") {
        setMsg("Este pedido não pode mais ser editado. Abrindo o detalhe…", true);
        window.location.href = `./detalhePedido?id=${pedidoId}`;
        return;
      }
      editando = true;
      document.getElementById("pageTitle").innerHTML =
        `<i class="fa-solid fa-pen-to-square"></i> Editar ${p.codigoInterno}`;
      document.getElementById("pageSub").textContent =
        p.status === "EM_PRODUCAO"
          ? "Pedido já está em produção. Você pode corrigir dados, arte e print."
          : "Ajuste os dados, envie a foto e posicione na faca. Depois salve ou envie para produção.";
      if (p.status === "EM_PRODUCAO") {
        btnEnviar.style.display = "none";
      }
      document.getElementById("cliente").value = p.cliente || "";
      document.getElementById("numeroPedido").value = p.numeroPedido || "";
      document.getElementById("contato").value = p.contato || "";
      document.getElementById("telefone").value = p.telefone || "";
      document.getElementById("quantidade").value = String(p.quantidade || 1);
      document.getElementById("dataPedido").value = toInputDate(p.dataPedido);
      document.getElementById("dataNecessidade").value = toInputDate(p.dataNecessidade);
      document.getElementById("prioridade").value = p.prioridade === "URGENTE" ? "URGENTE" : "NORMAL";
      document.getElementById("observacao").value = p.observacao || "";
      document.getElementById("codPerso").value = p.codPerso || "";
      document.getElementById("codOrigem").value = p.codOrigem || "";
      if (p.linhaProduto) {
        document.getElementById("deparaHint").textContent = `Linha: ${p.linhaProduto}`;
      }
      if (p.modeloId) CapaMockup.setModelById(p.modeloId);
      if (p.hasArte) {
        const res = await fetch(`/api/comercial/pedidos?acao=anexo&id=${pedidoId}&tipoAnexo=ARTE`, {
          headers: P.authHeaders(),
        });
        if (res.ok) {
          const blob = await res.blob();
          await CapaMockup.loadPhotoFromBlob(blob, "arte.jpg");
        }
      }
    } catch (err) {
      setMsg(err.message, true);
    }
  }

  function formData() {
    return {
      cliente: document.getElementById("cliente").value,
      numeroPedido: document.getElementById("numeroPedido").value,
      contato: document.getElementById("contato").value,
      telefone: document.getElementById("telefone").value,
      quantidade: Number(document.getElementById("quantidade").value),
      dataPedido: document.getElementById("dataPedido").value,
      dataNecessidade: document.getElementById("dataNecessidade").value,
      prioridade: document.getElementById("prioridade").value,
      observacao: document.getElementById("observacao").value,
      vendedor: localStorage.getItem("userName") || "",
      codPerso: document.getElementById("codPerso").value,
      codOrigem: document.getElementById("codOrigem").value,
    };
  }

  async function resolverDePara() {
    const perso = document.getElementById("codPerso").value.trim();
    const hint = document.getElementById("deparaHint");
    if (!perso) {
      hint.textContent = "";
      return;
    }
    try {
      const res = await fetch(`/api/comercial/depara?acao=resolver&perso=${encodeURIComponent(perso)}`, {
        headers: P.authHeaders(),
      });
      const data = await res.json();
      if (data && data.data) {
        document.getElementById("codOrigem").value = data.data.codOrigem || "";
        hint.textContent = data.data.linha
          ? `Linha ${data.data.linha} · produzir ${data.data.codOrigem}`
          : `Produzir ${data.data.codOrigem}`;
      } else {
        hint.textContent = "Perso sem de/para cadastrado. Informe o origem manualmente.";
      }
    } catch (err) {
      hint.textContent = err.message;
    }
  }

  async function anexos() {
    const model = CapaMockup.getModel();
    const out = { modeloId: model && model.id, modeloNome: model && model.name };
    if (!CapaMockup.hasPhoto()) return out;
    const [previewBlob, arteBlob] = await Promise.all([
      CapaMockup.exportPreviewPng(),
      CapaMockup.exportArteJpeg(),
    ]);
    if (previewBlob) {
      out.preview = {
        nome: `preview-${model.id}.png`,
        mime: "image/png",
        data: await P.blobToBase64(previewBlob),
      };
    }
    if (arteBlob) {
      out.arte = {
        nome: CapaMockup.getPhotoName() || "arte.jpg",
        mime: "image/jpeg",
        data: await P.blobToBase64(arteBlob),
      };
    }
    return out;
  }

  async function salvar(enviarProducao) {
    const model = CapaMockup.getModel();
    if (!model) return setMsg("Selecione o modelo.", true);
    if (enviarProducao && !CapaMockup.hasPhoto()) {
      return setMsg("Monte a arte na faca antes de enviar para produção.", true);
    }
    btnSalvar.disabled = true;
    btnEnviar.disabled = true;
    setMsg(enviarProducao ? "Gerando print e enviando…" : "Salvando rascunho…");
    try {
      const body = { ...formData(), ...(await anexos()), enviarProducao: !!enviarProducao };
      let data;
      if (editando) {
        body.id = pedidoId;
        data = await P.api("atualizar", { method: "POST", body });
      } else {
        data = await P.api("criar", { method: "POST", body });
      }
      setMsg(`Pedido ${data.codigoInterno} ${enviarProducao ? "enviado para produção" : "salvo"}.`);
      window.location.href = `./detalhePedido?id=${data.id}`;
    } catch (err) {
      setMsg(err.message, true);
      btnSalvar.disabled = false;
      btnEnviar.disabled = false;
    }
  }

  document.getElementById("codPerso").addEventListener("blur", resolverDePara);
  btnSalvar.addEventListener("click", () => salvar(false));
  btnEnviar.addEventListener("click", () => salvar(true));
});
