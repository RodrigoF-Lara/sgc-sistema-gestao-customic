(() => {
  const BASE = "/modules/producao/capas/";

  const els = {
    list: document.getElementById("modelList"),
    search: document.getElementById("modelSearch"),
    chips: document.querySelectorAll(".capa-chip"),
    canvas: document.getElementById("preview"),
    wrap: document.getElementById("stageWrap"),
    hint: document.getElementById("dropHint"),
    title: document.getElementById("stageTitle"),
    photoInput: document.getElementById("photoInput"),
    photoName: document.getElementById("photoName"),
    zoom: document.getElementById("zoomRange"),
    zoomVal: document.getElementById("zoomVal"),
    rot: document.getElementById("rotRange"),
    rotVal: document.getElementById("rotVal"),
    btnCover: document.getElementById("btnCover"),
    btnFit: document.getElementById("btnFit"),
    btnFlip: document.getElementById("btnFlip"),
    btnReset: document.getElementById("btnReset"),
    btnClear: document.getElementById("btnClear"),
    btnDownload: document.getElementById("btnDownload"),
  };

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

  function searchText(model) {
    const bits = [model.name, model.brand, ...(model.aliases || [])];
    for (const part of String(model.name).split(/[/,]/)) bits.push(part.trim());
    return bits
      .join(" ")
      .toLowerCase()
      .replace(/\+/g, " plus ")
      .replace(/\s+/g, " ");
  }

  function brandLabel(brand) {
    if (brand === "apple") return "iPhone";
    if (brand === "samsung") return "Samsung";
    return "Outro";
  }

  function matches(model) {
    if (state.brand !== "all" && model.brand !== state.brand) return false;
    const q = state.query
      .trim()
      .toLowerCase()
      .replace(/\+/g, " plus ")
      .replace(/\s+/g, " ");
    if (!q) return true;
    return searchText(model).includes(q);
  }

  function renderList() {
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
    els.title.textContent = model.name;
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
    const pw = img.width;
    const ph = img.height;
    const ratio =
      mode === "fit"
        ? Math.min(m.width / pw, m.height / ph)
        : Math.max(m.width / pw, m.height / ph);
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
    els.zoom.value = String(Math.max(20, Math.min(400, pct)));
    els.zoomVal.textContent = `${pct}%`;
    els.rot.value = String(Math.round(state.rot));
    els.rotVal.textContent = `${Math.round(state.rot)}°`;
    els.btnDownload.disabled = !(state.model && state.photo);
    els.hint.classList.toggle("hidden", !!state.photo);
    els.wrap.classList.toggle("has-photo", !!state.photo);
  }

  function layoutCanvas() {
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
    const ox = (cssW - m.width * fit) / 2;
    const oy = (cssH - m.height * fit) / 2;
    state.view = { ox, oy, fit, cssW, cssH, dpr };
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
    els.photoName.textContent = file.name;
    if (state.model) coverPhoto("cover");
    else syncSliders();
    draw();
  }

  function clearPhoto() {
    if (state.photo && state.photo.close) {
      try {
        state.photo.close();
      } catch (_) {
        /* ignore */
      }
    }
    state.photo = null;
    state.photoName = "";
    els.photoName.textContent = "Nenhuma foto carregada.";
    els.photoInput.value = "";
    syncSliders();
    draw();
  }

  async function downloadPng() {
    const m = state.model;
    if (!m || !state.photo) return;
    const maxSide = 2200;
    const scale = maxSide / Math.max(m.width, m.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(m.width * scale);
    canvas.height = Math.round(m.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    draw(ctx, { lineWidth: 1.1 });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `capa-${m.id}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  els.list.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-id]");
    if (!btn) return;
    const model = state.models.find((m) => m.id === btn.dataset.id);
    if (model) setModel(model);
  });

  els.search.addEventListener("input", () => {
    state.query = els.search.value;
    renderList();
  });

  els.chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      els.chips.forEach((c) => c.classList.toggle("is-on", c === chip));
      state.brand = chip.dataset.brand;
      renderList();
    });
  });

  els.photoInput.addEventListener("change", () => {
    const file = els.photoInput.files && els.photoInput.files[0];
    if (file) loadPhoto(file);
  });

  els.zoom.addEventListener("input", () => {
    const pct = Number(els.zoom.value) / 100;
    state.scale = (state.baseScale || 1) * pct;
    els.zoomVal.textContent = `${Math.round(pct * 100)}%`;
    draw();
  });

  els.rot.addEventListener("input", () => {
    state.rot = Number(els.rot.value);
    els.rotVal.textContent = `${Math.round(state.rot)}°`;
    draw();
  });

  els.btnCover.addEventListener("click", () => coverPhoto("cover"));
  els.btnFit.addEventListener("click", () => coverPhoto("fit"));
  els.btnFlip.addEventListener("click", () => {
    state.flip *= -1;
    draw();
  });
  els.btnReset.addEventListener("click", () => coverPhoto("cover"));
  els.btnClear.addEventListener("click", clearPhoto);
  els.btnDownload.addEventListener("click", downloadPng);

  const wrap = els.wrap;
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
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      state.pinch = {
        dist: Math.hypot(dx, dy) || 1,
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
  new ResizeObserver(layoutCanvas).observe(els.wrap);

  async function init() {
    const res = await fetch(`${BASE}facas/catalog.json`);
    if (!res.ok) throw new Error("Não foi possível carregar o catálogo de facas.");
    const data = await res.json();
    state.models = data.models || [];
    renderList();
    if (state.models[0]) setModel(state.models[0]);
    else layoutCanvas();
  }

  init().catch((err) => {
    els.list.innerHTML = `<div class="empty-models">${err.message}</div>`;
    console.error(err);
  });
})();
