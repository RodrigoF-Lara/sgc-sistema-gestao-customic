/**
 * Editor de montagem da capa (faca + arte).
 * Usado no preview avulso e no pedido comercial.
 */
window.CapaMockup = (() => {
  const DEFAULT_BASE = "/modules/producao/capas/";
  let BASE = DEFAULT_BASE;
  let els = {};
  const state = {
    models: [],
    brand: "all",
    query: "",
    model: null,
    photo: null,
    photoName: "",
    cx: 0,
    cy: 0,
    scale: 1,
    baseScale: 1,
    rot: 0,
    flip: 1,
    paths: null,
    view: { ox: 0, oy: 0, fit: 1, cssW: 0, cssH: 0 },
    drag: null,
    pointers: new Map(),
    pinch: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function searchText(model) {
    const bits = [model.name, model.brand, ...(model.aliases || [])];
    for (const part of String(model.name).split(/[/,]/)) bits.push(part.trim());
    return bits.join(" ").toLowerCase().replace(/\+/g, " plus ").replace(/\s+/g, " ");
  }

  function brandLabel(brand) {
    if (brand === "apple") return "iPhone";
    if (brand === "samsung") return "Samsung";
    return "Outro";
  }

  function matches(model) {
    if (state.brand !== "all" && model.brand !== state.brand) return false;
    const q = state.query.trim().toLowerCase().replace(/\+/g, " plus ").replace(/\s+/g, " ");
    if (!q) return true;
    return searchText(model).includes(q);
  }

  function renderList() {
    if (!els.list) return;
    const items = state.models.filter(matches);
    if (!items.length) {
      els.list.innerHTML = `<div class="empty-models">Nenhum modelo encontrado.</div>`;
      return;
    }
    els.list.innerHTML = items
      .map(
        (m) => `
      <button type="button" class="model-card${state.model && state.model.id === m.id ? " is-on" : ""}" data-id="${m.id}">
        <img src="${BASE}${m.thumb}" alt="" />
        <div>
          <strong>${m.name}</strong>
          <span>${brandLabel(m.brand)}</span>
        </div>
      </button>`
      )
      .join("");
  }

  function setModel(model) {
    state.model = model;
    state.paths = {
      outer: new Path2D(model.outer),
      camera: new Path2D(model.camera),
      clip: (() => {
        const p = new Path2D();
        p.addPath(new Path2D(model.outer));
        p.addPath(new Path2D(model.camera));
        return p;
      })(),
    };
    if (els.title) els.title.textContent = model.name;
    if (state.photo) coverPhoto("cover");
    else {
      state.cx = model.width / 2;
      state.cy = model.height / 2;
    }
    renderList();
    layoutCanvas();
  }

  function coverPhoto(mode) {
    const m = state.model;
    const img = state.photo;
    if (!m || !img) return;
    const ratio =
      mode === "fit"
        ? Math.min(m.width / img.width, m.height / img.height)
        : Math.max(m.width / img.width, m.height / img.height);
    state.baseScale = ratio;
    state.scale = ratio * (mode === "fit" ? 1 : 1.04);
    state.cx = m.width / 2;
    state.cy = m.height / 2;
    state.rot = 0;
    state.flip = 1;
    syncSliders();
    draw();
  }

  function syncSliders() {
    const pct = Math.round((state.scale / (state.baseScale || state.scale || 1)) * 100);
    if (els.zoom) els.zoom.value = String(Math.max(20, Math.min(400, pct)));
    if (els.zoomVal) els.zoomVal.textContent = `${pct}%`;
    if (els.rot) els.rot.value = String(Math.round(state.rot));
    if (els.rotVal) els.rotVal.textContent = `${Math.round(state.rot)}°`;
    if (els.btnDownload) els.btnDownload.disabled = !(state.model && state.photo);
    if (els.hint) els.hint.classList.toggle("hidden", !!state.photo);
    if (els.wrap) els.wrap.classList.toggle("has-photo", !!state.photo);
  }

  function layoutCanvas() {
    if (!els.wrap || !els.canvas) return;
    const wrap = els.wrap;
    const canvas = els.canvas;
    const m = state.model;
    const cssW = Math.max(120, wrap.clientWidth);
    const cssH = Math.max(180, wrap.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    if (!m) {
      state.view = { ox: 0, oy: 0, fit: 1, cssW, cssH, dpr };
      draw();
      return;
    }
    const pad = 18;
    const fit = Math.min((cssW - pad * 2) / m.width, (cssH - pad * 2) / m.height);
    state.view = {
      ox: (cssW - m.width * fit) / 2,
      oy: (cssH - m.height * fit) / 2,
      fit,
      cssW,
      cssH,
      dpr,
    };
    draw();
  }

  function draw(targetCtx, opts) {
    const m = state.model;
    const ctx = targetCtx || els.canvas.getContext("2d");
    const exportMode = !!opts;
    if (!exportMode) {
      const { cssW, cssH, dpr, ox, oy, fit } = state.view;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      if (!m || !state.paths) return;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(fit, fit);
      paintCase(ctx, m, 1.15 / fit);
      ctx.restore();
      return;
    }
    paintCase(ctx, m, opts.lineWidth || 1.4);
  }

  function paintCase(ctx, m, lineWidth) {
    ctx.save();
    ctx.fillStyle = "#f2f4f7";
    ctx.fill(state.paths.outer);
    ctx.save();
    ctx.clip(state.paths.clip, "evenodd");
    if (state.photo) {
      ctx.translate(state.cx, state.cy);
      ctx.rotate((state.rot * Math.PI) / 180);
      ctx.scale(state.scale * state.flip, state.scale);
      ctx.drawImage(state.photo, -state.photo.width / 2, -state.photo.height / 2);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, m.width, m.height);
    }
    ctx.restore();
    ctx.fillStyle = "#1c1c1e";
    ctx.fill(state.paths.camera);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = lineWidth;
    ctx.stroke(state.paths.outer);
    ctx.stroke(state.paths.camera);
    ctx.restore();
  }

  function clientToModel(clientX, clientY) {
    const rect = els.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { ox, oy, fit } = state.view;
    return { x: (x - ox) / fit, y: (y - oy) / fit };
  }

  async function loadPhoto(file) {
    if (!file || !file.type.startsWith("image/")) return;
    let bmp;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      bmp = await createImageBitmap(file);
    }
    state.photo = bmp;
    state.photoName = file.name;
    if (els.photoName) els.photoName.textContent = file.name;
    if (state.model) coverPhoto("cover");
    else syncSliders();
    draw();
  }

  async function loadPhotoFromBlob(blob, name) {
    if (!blob) return;
    const file = new File([blob], name || "arte.jpg", { type: blob.type || "image/jpeg" });
    await loadPhoto(file);
  }

  function clearPhoto() {
    if (state.photo && state.photo.close) {
      try { state.photo.close(); } catch (_) { /* ignore */ }
    }
    state.photo = null;
    state.photoName = "";
    if (els.photoName) els.photoName.textContent = "Nenhuma foto carregada.";
    if (els.photoInput) els.photoInput.value = "";
    syncSliders();
    draw();
  }

  async function exportPreviewPng() {
    const m = state.model;
    if (!m || !state.photo) return null;
    const maxSide = 1800;
    const scale = maxSide / Math.max(m.width, m.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(m.width * scale);
    canvas.height = Math.round(m.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    draw(ctx, { lineWidth: 1.1 });
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  async function exportArteJpeg() {
    if (!state.photo) return null;
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(state.photo.width, state.photo.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(state.photo.width * scale));
    canvas.height = Math.max(1, Math.round(state.photo.height * scale));
    canvas.getContext("2d").drawImage(state.photo, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  }

  async function downloadPng() {
    const blob = await exportPreviewPng();
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `capa-${state.model.id}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  function bind() {
    els.list?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-id]");
      if (!btn) return;
      const model = state.models.find((m) => m.id === btn.dataset.id);
      if (model) setModel(model);
    });
    els.search?.addEventListener("input", () => {
      state.query = els.search.value;
      renderList();
    });
    document.querySelectorAll(".capa-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".capa-chip").forEach((c) => c.classList.toggle("is-on", c === chip));
        state.brand = chip.dataset.brand;
        renderList();
      });
    });
    els.photoInput?.addEventListener("change", () => {
      const file = els.photoInput.files && els.photoInput.files[0];
      if (file) loadPhoto(file);
    });
    els.zoom?.addEventListener("input", () => {
      const pct = Number(els.zoom.value) / 100;
      state.scale = (state.baseScale || 1) * pct;
      if (els.zoomVal) els.zoomVal.textContent = `${Math.round(pct * 100)}%`;
      draw();
    });
    els.rot?.addEventListener("input", () => {
      state.rot = Number(els.rot.value);
      if (els.rotVal) els.rotVal.textContent = `${Math.round(state.rot)}°`;
      draw();
    });
    els.btnCover?.addEventListener("click", () => coverPhoto("cover"));
    els.btnFit?.addEventListener("click", () => coverPhoto("fit"));
    els.btnFlip?.addEventListener("click", () => {
      state.flip *= -1;
      draw();
    });
    els.btnReset?.addEventListener("click", () => coverPhoto("cover"));
    els.btnClear?.addEventListener("click", clearPhoto);
    els.btnDownload?.addEventListener("click", downloadPng);

    const wrap = els.wrap;
    if (!wrap) return;
    wrap.addEventListener("dragover", (e) => {
      e.preventDefault();
      wrap.classList.add("is-over");
    });
    wrap.addEventListener("dragleave", () => wrap.classList.remove("is-over"));
    wrap.addEventListener("drop", (e) => {
      e.preventDefault();
      wrap.classList.remove("is-over");
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) loadPhoto(file);
    });
    wrap.addEventListener("pointerdown", (e) => {
      if (!state.photo) return;
      wrap.setPointerCapture(e.pointerId);
      const pt = clientToModel(e.clientX, e.clientY);
      state.pointers.set(e.pointerId, { x: pt.x, y: pt.y });
      if (state.pointers.size === 1) {
        state.drag = { x: pt.x, y: pt.y, cx: state.cx, cy: state.cy };
        wrap.classList.add("is-drag");
      } else if (state.pointers.size === 2) {
        const pts = [...state.pointers.values()];
        state.pinch = {
          dist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1,
          scale: state.scale,
        };
        state.drag = null;
      }
    });
    wrap.addEventListener("pointermove", (e) => {
      if (!state.pointers.has(e.pointerId)) return;
      const pt = clientToModel(e.clientX, e.clientY);
      state.pointers.set(e.pointerId, { x: pt.x, y: pt.y });
      if (state.pointers.size === 2 && state.pinch) {
        const pts = [...state.pointers.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
        state.scale = state.pinch.scale * (dist / state.pinch.dist);
        syncSliders();
        draw();
        return;
      }
      if (state.drag) {
        state.cx = state.drag.cx + (pt.x - state.drag.x);
        state.cy = state.drag.cy + (pt.y - state.drag.y);
        draw();
      }
    });
    function endPointer(e) {
      state.pointers.delete(e.pointerId);
      if (state.pointers.size < 2) state.pinch = null;
      if (state.pointers.size === 0) {
        state.drag = null;
        wrap.classList.remove("is-drag");
      }
    }
    wrap.addEventListener("pointerup", endPointer);
    wrap.addEventListener("pointercancel", endPointer);
    wrap.addEventListener(
      "wheel",
      (e) => {
        if (!state.photo || !state.model) return;
        e.preventDefault();
        const pt = clientToModel(e.clientX, e.clientY);
        const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
        const next = Math.max(state.baseScale * 0.15, Math.min(state.baseScale * 6, state.scale * factor));
        const t = next / state.scale;
        state.cx = pt.x + (state.cx - pt.x) * t;
        state.cy = pt.y + (state.cy - pt.y) * t;
        state.scale = next;
        syncSliders();
        draw();
      },
      { passive: false }
    );
    window.addEventListener("resize", layoutCanvas);
    new ResizeObserver(layoutCanvas).observe(wrap);
  }

  async function mount(opts) {
    BASE = (opts && opts.catalogBase) || DEFAULT_BASE;
    els = {
      list: $("modelList"),
      search: $("modelSearch"),
      canvas: $("preview"),
      wrap: $("stageWrap"),
      hint: $("dropHint"),
      title: $("stageTitle"),
      photoInput: $("photoInput"),
      photoName: $("photoName"),
      zoom: $("zoomRange"),
      zoomVal: $("zoomVal"),
      rot: $("rotRange"),
      rotVal: $("rotVal"),
      btnCover: $("btnCover"),
      btnFit: $("btnFit"),
      btnFlip: $("btnFlip"),
      btnReset: $("btnReset"),
      btnClear: $("btnClear"),
      btnDownload: $("btnDownload"),
    };
    bind();
    const res = await fetch(`${BASE}facas/catalog.json`);
    if (!res.ok) throw new Error("Não foi possível carregar o catálogo de facas.");
    const data = await res.json();
    state.models = data.models || [];
    renderList();
    if (state.models[0]) setModel(state.models[0]);
    else layoutCanvas();
    return api;
  }

  const api = {
    mount,
    getModel: () => state.model,
    hasPhoto: () => !!state.photo,
    getPhotoName: () => state.photoName,
    exportPreviewPng,
    exportArteJpeg,
    loadPhotoFromBlob,
    setModelById: (id) => {
      const m = state.models.find((x) => x.id === id);
      if (m) setModel(m);
    },
    models: () => state.models,
  };
  return api;
})();
