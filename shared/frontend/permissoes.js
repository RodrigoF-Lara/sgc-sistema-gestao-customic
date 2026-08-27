/**
 * Helper client-side de permissões (SGC).
 *
 * Carrega a matriz do nível logado via /api/shared/config?tipo=permissoes&action=minhas
 * e expõe window.SGCPermissoes.podeAcessar(linkId).
 *
 * Regras espelhadas do servidor:
 *  - nível '1' (Administrador) → tudo liberado
 *  - 'home' sempre livre
 *  - default deny
 *
 * A decisão real de mutação deve ser revalidada na API.
 */
(function (global) {
  /** Cargo ADM (e legados numéricos da migração) */
  const ADMIN_CODIGOS = new Set(["adm", "1", "administrador", "admin"]);
  const CACHE_KEY = "sgcPermissoesCache";
  const CACHE_TTL_MS = 60_000;

  let state = {
    loaded: false,
    loading: null,
    nivel: null,
    admin: false,
    map: {}, // link_id -> bool
  };

  function getNivel() {
    return String(localStorage.getItem("userLevel") || "").trim() || null;
  }

  function getUserCode() {
    return localStorage.getItem("userCode") || "";
  }

  function authHeaders() {
    const h = { "Content-Type": "application/json" };
    const nivel = getNivel();
    const code = getUserCode();
    if (nivel) h["x-user-level"] = nivel;
    if (code) h["x-user-code"] = code;
    return h;
  }

  function normalizarNivel(nivel) {
    if (nivel === null || nivel === undefined || nivel === "") return "";
    return String(nivel)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
  }

  function isAdminNivel(nivel) {
    return ADMIN_CODIGOS.has(normalizarNivel(nivel));
  }

  function readLocalCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.ts || Date.now() - obj.ts > CACHE_TTL_MS) return null;
      if (String(obj.nivel) !== String(getNivel())) return null;
      return obj;
    } catch (_) {
      return null;
    }
  }

  function writeLocalCache() {
    try {
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          ts: Date.now(),
          nivel: state.nivel,
          admin: state.admin,
          map: state.map,
        })
      );
    } catch (_) {
      /* ignore */
    }
  }

  function applyCache(obj) {
    state.nivel = obj.nivel;
    state.admin = !!obj.admin;
    state.map = obj.map || {};
    state.loaded = true;
  }

  async function carregar(force) {
    if (!force && state.loaded) return state;
    if (!force && state.loading) return state.loading;

    const cached = !force ? readLocalCache() : null;
    if (cached) {
      applyCache(cached);
      return state;
    }

    const nivel = getNivel();
    if (!nivel) {
      state.loaded = true;
      state.admin = false;
      state.map = { home: true };
      state.nivel = null;
      return state;
    }

    if (isAdminNivel(nivel)) {
      state.nivel = nivel;
      state.admin = true;
      state.map = { home: true };
      state.loaded = true;
      writeLocalCache();
      return state;
    }

    state.loading = (async () => {
      try {
        const res = await fetch("/api/shared/config?tipo=permissoes&action=minhas", {
          headers: authHeaders(),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          state.nivel = data.nivel || nivel;
          state.admin = !!data.admin;
          state.map = data.data || { home: true };
        } else {
          // fail-closed para não-admin
          state.nivel = nivel;
          state.admin = false;
          state.map = { home: true };
        }
      } catch (err) {
        console.error("[SGCPermissoes] falha ao carregar:", err);
        state.nivel = nivel;
        state.admin = isAdminNivel(nivel);
        state.map = { home: true };
      }
      state.loaded = true;
      state.loading = null;
      writeLocalCache();
      return state;
    })();

    return state.loading;
  }

  function podeAcessar(linkId) {
    const id = String(linkId || "").trim();
    if (!id) return false;
    if (id === "home" || id === "inicio") return true;

    const nivel = getNivel();
    if (isAdminNivel(nivel) || state.admin) return true;

    if (!state.loaded) {
      // Se ainda não carregou, tenta cache de sessão
      const cached = readLocalCache();
      if (cached) applyCache(cached);
    }

    if (state.admin) return true;
    return !!(state.map && state.map[id]);
  }

  function invalidarCache() {
    state.loaded = false;
    state.map = {};
    state.admin = false;
    try {
      sessionStorage.removeItem(CACHE_KEY);
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * Mapa de elementos do menu lateral (id HTML) → link_id (string ou array = basta 1 liberado)
   * Ex.: nav-requisicoes aparece se o usuário tiver nova OU consultar OU o hub.
   */
  const NAV_TO_LINK = {
    "nav-menu": "home",
    "nav-requisicoes": ["requisicoes", "nova-requisicao", "consultar-requisicoes"],
    "nav-saida-rapida": "saida-rapida",
    "nav-estoque": "estoque",
    "nav-inventario-ciclico": "inventario-ciclico",
    "nav-lancamento-nf": "lancamento-nf",
    "nav-status-nf": "status-nf",
    "nav-saving": "saving-compras",
    "nav-relatorios": ["relatorios", "relatorio-baixa-periodo", "relatorio-requisicoes", "relatorio-saldo", "relatorio-acuracidade", "consumo-medio"],
    "nav-produtos": "cadastro-produtos",
    "nav-fornecedores": "cadastro-fornecedores",
    "nav-usuarios": "usuarios",
    "nav-preview-capa": "preview-capa",
    "nav-pedidos-capa": "pedido-capa",
    "nav-novo-pedido-capa": ["pedido-capa", "pedido-capa-novo"],
    "nav-fila-capas": "pedido-capa-producao",
    "nav-cadastro-operacoes": "cadastro-operacoes",
    "nav-cadastro-estrutura-produto": "cadastro-estrutura-produto",
    "nav-cadastro-recursos": "cadastro-recursos",
    "nav-configuracoes": ["configuracoes", "config-inventario", "calendario-produtivo", "niveis", "permissoes"],
    "nav-config-notificacoes": "config-notificacoes",
    "nav-niveis": "niveis",
    "nav-permissoes": "permissoes",
  };

  function podeQualquer(linkIds) {
    if (!linkIds) return false;
    const list = Array.isArray(linkIds) ? linkIds : [linkIds];
    return list.some((id) => podeAcessar(id));
  }

  /** Cards do menu.html: seletor de href ou data-link-id */
  const HREF_TO_LINK = {
    "/menu.html": "home",
    "/modules/embalagem/requisicoes/novaRequisicao.html": "nova-requisicao",
    "/modules/embalagem/requisicoes/consulta.html": "consultar-requisicoes",
    "/modules/embalagem/requisicoes/requisicoes.html": "requisicoes",
    "/modules/embalagem/kardex/saidaRapida.html": "saida-rapida",
    "/modules/embalagem/kardex/estoque.html": "estoque",
    "/modules/embalagem/inventario/inventarioCiclico.html": "inventario-ciclico",
    "/modules/embalagem/nf/lancamentoNF.html": "lancamento-nf",
    "/modules/embalagem/nf/statusNF.html": "status-nf",
    "/modules/embalagem/saving/savingCompras.html": "saving-compras",
    "/modules/embalagem/relatorios/relatorios.html": "relatorios",
    "/modules/embalagem/relatorios/relatorioBaixaPorPeriodo.html": "relatorio-baixa-periodo",
    "/modules/embalagem/kardex/consumoMedio.html": "consumo-medio",
    "/modules/embalagem/relatorios/relatorioRequisicoes.html": "relatorio-requisicoes",
    "/modules/embalagem/relatorios/relatorioSaldo.html": "relatorio-saldo",
    "/modules/embalagem/relatorios/relatorioAcuracidade.html": "relatorio-acuracidade",
    "/shared/cadastros/cadastroProdutos.html": "cadastro-produtos",
    "/shared/cadastros/cadastroFornecedores.html": "cadastro-fornecedores",
    "/shared/cadastros/cadastroUsuarios.html": "usuarios",
    "/modules/producao/capas/previewCapa.html": "preview-capa",
    "/modules/comercial/pedidos/pedidos.html": "pedido-capa",
    "/modules/comercial/pedidos/novoPedido.html": "pedido-capa",
    "/modules/comercial/pedidos/detalhePedido.html": "pedido-capa",
    "/modules/producao/cadastros/cadastroOperacoes.html": "cadastro-operacoes",
    "/modules/producao/cadastros/cadastroEstruturaProduto.html": "cadastro-estrutura-produto",
    "/modules/producao/cadastros/cadastroRecursos.html": "cadastro-recursos",
    "/shared/config/configuracoes.html": "configuracoes",
    "/shared/config/configNotificacoes.html": "config-notificacoes",
    "/shared/config/calendarioProdutivo.html": "calendario-produtivo",
    "/shared/config/niveis.html": "niveis",
    "/shared/config/permissoes.html": "permissoes",
    "/modules/embalagem/inventario/configInventario.html": "config-inventario",
  };

  function normalizeHref(href) {
    if (!href) return "";
    try {
      const u = new URL(href, window.location.origin);
      return u.pathname;
    } catch (_) {
      return href.split("?")[0];
    }
  }

  function isNavLinkVisible(a) {
    if (!a) return false;
    if (a.getAttribute("data-perm-hidden") === "1") return false;
    if (a.style.display === "none") return false;
    if (a.classList.contains("nav-disabled")) return false;
    return true;
  }

  /**
   * Esconde itens do sidebar sem permissão.
   * Também esconde grupos que ficaram sem links visíveis (de dentro para fora).
   */
  function filtrarMenuLateral(root) {
    const scope = root || document;
    Object.keys(NAV_TO_LINK).forEach((navId) => {
      const el = typeof scope.getElementById === "function"
        ? scope.getElementById(navId)
        : document.getElementById(navId);
      if (!el) return;
      const linkId = NAV_TO_LINK[navId];
      if (!podeQualquer(linkId)) {
        el.style.display = "none";
        el.setAttribute("data-perm-hidden", "1");
      } else {
        el.style.display = "";
        el.removeAttribute("data-perm-hidden");
      }
    });

    // Processa grupos do mais interno para o mais externo
    const groups = Array.from(scope.querySelectorAll(".nav-group")).reverse();
    groups.forEach((group) => {
      // Agrupadores reservados (ex.: Cadastros de Produção) ficam visíveis mesmo vazios
      if (group.getAttribute("data-keep-visible") === "1") {
        group.style.display = "";
        group.removeAttribute("data-perm-hidden");
        return;
      }

      const items = group.querySelector(":scope > .nav-group-items") || group.querySelector(".nav-group-items");
      if (!items) return;

      let visibleCount = 0;
      items.querySelectorAll(":scope > a").forEach((a) => {
        if (isNavLinkVisible(a)) visibleCount++;
      });
      items.querySelectorAll(":scope > .nav-group").forEach((cg) => {
        if (cg.style.display !== "none" && cg.getAttribute("data-perm-hidden") !== "1") {
          visibleCount++;
        }
      });

      if (visibleCount === 0) {
        group.style.display = "none";
        group.setAttribute("data-perm-hidden", "1");
      } else {
        group.style.display = "";
        group.removeAttribute("data-perm-hidden");
      }
    });
  }

  /**
   * Esconde cards do menu principal (menu.html) e hub de configs.
   * Usa data-link-id se presente, senão o href.
   */
  function filtrarCards(container) {
    const root = container || document;
    root.querySelectorAll("a.menu-option-card, a.config-card").forEach((a) => {
      if (a.classList.contains("menu-option-disabled") || a.getAttribute("href") === "#") {
        return;
      }
      const explicit = a.getAttribute("data-link-id");
      const href = normalizeHref(a.getAttribute("href"));
      const linkId = explicit || HREF_TO_LINK[href] || null;
      if (!linkId) return;
      if (!podeAcessar(linkId)) {
        a.style.display = "none";
        a.setAttribute("data-perm-hidden", "1");
      } else {
        a.style.display = "";
        a.removeAttribute("data-perm-hidden");
      }
    });

    // Esconde subseções vazias
    root.querySelectorAll(".menu-section, .menu-options").forEach((section) => {
      if (!section.classList.contains("menu-options") && !section.classList.contains("menu-section")) {
        return;
      }
    });
    root.querySelectorAll(".menu-section").forEach((section) => {
      if (section.querySelector(".menu-empty-state")) {
        section.style.display = "";
        return;
      }
      const cards = section.querySelectorAll("a.menu-option-card");
      if (cards.length === 0) return;
      let visible = 0;
      cards.forEach((c) => {
        if (c.getAttribute("data-perm-hidden") === "1") return;
        if (c.style.display === "none") return;
        if (c.classList.contains("menu-option-disabled")) return;
        visible++;
      });
      if (visible === 0) {
        section.style.display = "none";
      } else {
        section.style.display = "";
      }
    });
  }

  /**
   * Protege a página atual: se não tiver permissão, redireciona.
   * @param {string} linkId
   */
  async function protegerPagina(linkId) {
    await carregar();
    if (podeAcessar(linkId)) return true;
    alert("Acesso negado. Você não tem permissão para esta página.");
    window.location.href = "/menu.html";
    return false;
  }

  global.SGCPermissoes = {
    carregar,
    podeAcessar,
    podeQualquer,
    invalidarCache,
    filtrarMenuLateral,
    filtrarCards,
    protegerPagina,
    authHeaders,
    getNivel,
    isAdmin: () => isAdminNivel(getNivel()) || state.admin,
    NAV_TO_LINK,
    HREF_TO_LINK,
  };
})(window);
