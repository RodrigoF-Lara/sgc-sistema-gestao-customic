(() => {
  const qs = new URLSearchParams(location.search);
  const sku = (qs.get("sku") || "").trim();
  const q = (qs.get("q") || "").trim();
  const modeloHint = (qs.get("modelo") || "").trim();
  const origem = (qs.get("ref") || document.referrer || "").slice(0, 400);
  const errEl = document.getElementById("err");
  const btn = document.getElementById("btnSalvar");

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function pingHeight() {
    const h = Math.ceil(document.documentElement.scrollHeight);
    if (window.parent !== window) {
      window.parent.postMessage({ type: "customic-capa-resize", height: h }, "*");
    }
  }

  async function resolver() {
    const params = new URLSearchParams();
    if (sku) params.set("sku", sku);
    if (q) params.set("q", q);
    if (modeloHint) params.set("q", `${q} ${modeloHint}`);
    const res = await fetch(`/api/comercial/pedidos?acao=resolver-modelo&${params}`);
    const data = await res.json();
    return data.data;
  }

  async function init() {
    await CapaMockup.mount({ catalogBase: "/modules/producao/capas/" });
    let resolved = null;
    try {
      resolved = await resolver();
    } catch (_) {
      resolved = null;
    }
    if (modeloHint) CapaMockup.setModelById(modeloHint);
    if (resolved && resolved.modeloId) {
      CapaMockup.setModelById(resolved.modeloId);
      document.getElementById("sub").textContent =
        `Modelo: ${resolved.modeloNome}${sku ? " · SKU " + sku : ""}. Envie a foto e confirme a arte.`;
    } else {
      document.getElementById("modelsCol").classList.add("show");
      document.getElementById("appGrid").classList.add("with-models");
    }
    pingHeight();
    new ResizeObserver(pingHeight).observe(document.body);
  }

  btn.addEventListener("click", async () => {
    errEl.textContent = "";
    const model = CapaMockup.getModel();
    if (!model) {
      errEl.textContent = "Selecione o modelo.";
      return;
    }
    if (!CapaMockup.hasPhoto()) {
      errEl.textContent = "Envie uma foto antes de confirmar.";
      return;
    }
    btn.disabled = true;
    btn.textContent = "Salvando…";
    try {
      const [previewBlob, arteBlob] = await Promise.all([
        CapaMockup.exportPreviewPng(),
        CapaMockup.exportArteJpeg(),
      ]);
      const body = {
        modeloId: model.id,
        modeloNome: model.name,
        sku,
        origem,
        quantidade: 1,
        preview: {
          nome: `preview-${model.id}.png`,
          mime: "image/png",
          data: await blobToBase64(previewBlob),
        },
        arte: {
          nome: CapaMockup.getPhotoName() || "arte.jpg",
          mime: "image/jpeg",
          data: await blobToBase64(arteBlob),
        },
      };
      const res = await fetch("/api/comercial/pedidos?acao=widget-criar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || "Falha ao salvar.");
      document.getElementById("okBox").classList.add("show");
      document.getElementById("okCode").textContent = data.codigoInterno;
      if (window.parent !== window) {
        window.parent.postMessage(
          { type: "customic-capa-saved", id: data.id, codigoInterno: data.codigoInterno, sku },
          "*"
        );
      }
      pingHeight();
    } catch (e) {
      errEl.textContent = e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = "Confirmar arte";
    }
  });

  init().catch((e) => {
    errEl.textContent = e.message;
  });
})();
