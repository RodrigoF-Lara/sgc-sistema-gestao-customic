// Garante que o helper de permissões esteja disponível (páginas que não o incluem)
function ensurePermissoesScript() {
  return new Promise((resolve) => {
    if (window.SGCPermissoes) return resolve();
    const existing = document.querySelector('script[src*="permissoes.js"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      // se já carregou antes do listener
      if (window.SGCPermissoes) resolve();
      // fallback curto
      setTimeout(() => resolve(), 400);
      return;
    }
    const s = document.createElement('script');
    s.src = '/shared/frontend/permissoes.js';
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

async function aplicarFiltroPermissoes(sidebarRoot) {
  try {
    await ensurePermissoesScript();
    if (!window.SGCPermissoes) return;
    await window.SGCPermissoes.carregar();
    window.SGCPermissoes.filtrarMenuLateral(sidebarRoot || document);
    // Cards do menu principal / hubs
    window.SGCPermissoes.filtrarCards(document);
  } catch (err) {
    console.error('Falha ao aplicar permissões no menu:', err);
  }
}

// Carrega menu-lateral.html (se existir) e inicializa comportamento do sidebar
document.addEventListener('DOMContentLoaded', function () {
  const sidebarContainer = document.getElementById('sidebar-container');
  if (!sidebarContainer) {
    // Páginas sem sidebar ainda podem ter cards filtráveis
    aplicarFiltroPermissoes(document);
    return;
  }

  fetch('/shared/frontend/menu-lateral.html')
    .then(response => {
      if (!response.ok) throw new Error('menu-lateral.html não encontrado');
      return response.text();
    })
    .then(async html => {
      sidebarContainer.innerHTML = html;
      inicializarSidebar();
      await aplicarFiltroPermissoes(sidebarContainer);
    })
    .catch(async err => {
      console.error('Falha ao carregar menu-lateral.html:', err);
      // Fallback sincronizado com nomes existentes no projeto
      sidebarContainer.innerHTML = `
        <div class="sidebar-header"><h3>SGC - Sistema de Gestão Customic</h3></div>
        <div class="sidebar-user-info"><span id="sidebar-username">Usuário</span></div>
        <nav class="sidebar-nav">
          <a href="/menu.html" id="nav-menu"><i class="fa fa-home"></i> Menu Principal</a>
          <a href="/modules/embalagem/requisicoes/requisicoes.html" id="nav-requisicoes"><i class="fa fa-file-lines"></i> Requisições</a>
          <a href="/modules/embalagem/kardex/saidaRapida.html" id="nav-saida-rapida"><i class="fa fa-qrcode"></i> Saída Rápida (QR)</a>
          <a href="/modules/embalagem/kardex/estoque.html" id="nav-estoque"><i class="fa fa-archive"></i> Gerenciar Estoque</a>
          <a href="/modules/embalagem/inventario/inventarioCiclico.html" id="nav-inventario-ciclico"><i class="fa fa-clipboard-check"></i> Inventário Cíclico</a>
          <a href="/modules/embalagem/nf/lancamentoNF.html" id="nav-lancamento-nf"><i class="fa fa-file-invoice"></i> Lançamento NF</a>
          <a href="/modules/embalagem/nf/statusNF.html" id="nav-status-nf"><i class="fa fa-barcode"></i> Status NF</a>
          <a href="/modules/embalagem/relatorios/relatorios.html" id="nav-relatorios"><i class="fa fa-chart-bar"></i> Relatórios</a>
          <a href="/shared/cadastros/cadastros.html" id="nav-cadastros"><i class="fa fa-database"></i> Cadastros</a>
          <a href="/shared/config/configuracoes.html" id="nav-configuracoes"><i class="fa fa-cog"></i> Configurações</a>
        </nav>
        <div class="sidebar-footer"><button id="logout-btn" class="logout-btn">Sair</button></div>
      `;
      inicializarSidebar();
      await aplicarFiltroPermissoes(sidebarContainer);
    });
});

function inicializarSidebar() {
  const userName = localStorage.getItem('userName');
  const usernameEl = document.getElementById('sidebar-username');
  if (usernameEl) usernameEl.textContent = userName || 'Usuário';

  const filename = (window.location.pathname.split('/').pop() || '/menu.html').toLowerCase();
  const pageKey = filename.replace('.html', '') || 'menu';
  const idMap = {
    'menu': 'nav-menu',
    'index': 'nav-menu',
    'nova-requisicao': 'nav-requisicoes',
    'novarequisicao': 'nav-requisicoes',
    'consultar': 'nav-requisicoes',
    'consulta': 'nav-requisicoes',
    'detalhes': 'nav-requisicoes',
    'requisicoes': 'nav-requisicoes',
    'estoque': 'nav-estoque',
    'saidarapida': 'nav-saida-rapida',
    'status-nf': 'nav-status-nf',
    'statusnf': 'nav-status-nf',
    'lancamentonf': 'nav-lancamento-nf',
    'inventariociclico': 'nav-inventario-ciclico',
    'relatorios': 'nav-relatorios',
    'relatorionecessidadecompras': 'nav-relatorios',
    'relatoriobaixaporperiodo': 'nav-relatorios',
    'relatoriorequisicoes': 'nav-relatorios',
    'relatoriosaldo': 'nav-relatorios',
    'relatorioacuracidade': 'nav-relatorios',
    'consumomedio': 'nav-relatorios',
    'savingcompras': 'nav-saving',
    'cadastros': 'nav-cadastros-group',
    'cadastroprodutos': 'nav-produtos',
    'cadastrofornecedores': 'nav-fornecedores',
    'cadastroproducao': 'nav-cadastro-producao',
    'cadastrousuarios': 'nav-usuarios',
    'configuracoes': 'nav-configuracoes',
    'configinventario': 'nav-configuracoes',
    'confignotificacoes': 'nav-config-notificacoes',
    'calendarioprodutivo': 'nav-configuracoes',
    'niveis': 'nav-niveis',
    'permissoes': 'nav-permissoes'
  };
  const navId = idMap[pageKey] || `nav-${pageKey}`;
  const navLink = document.getElementById(navId);
  if (navLink) navLink.classList.add('active');

  // Inicializa grupos colapsáveis e expande o grupo do item ativo
  const groups = document.querySelectorAll('.sidebar-nav .nav-group');
  groups.forEach(group => {
    const toggle = group.querySelector('.nav-group-toggle');
    const items = group.querySelector('.nav-group-items');
    if (!toggle || !items) return;

    const hasActive = items.querySelector('a.active');
    if (hasActive) {
      group.classList.add('open');
      toggle.setAttribute('aria-expanded', 'true');
    }

    toggle.addEventListener('click', () => {
      const isOpen = group.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('Tem certeza que deseja sair?')) {
        localStorage.removeItem('userName');
        localStorage.removeItem('loginTime');
        localStorage.removeItem('userLevel');
        localStorage.removeItem('userCode');
        if (window.SGCPermissoes) window.SGCPermissoes.invalidarCache();
        try { sessionStorage.removeItem('sgcPermissoesCache'); } catch (_) { /* ignore */ }
        window.location.href = '/index.html';
      }
    });
  }

  // ===== Toggle de sidebar para mobile =====
  inicializarSidebarMobile();
}

function inicializarSidebarMobile() {
  // Evita duplicar elementos se layout for re-inicializado
  if (document.getElementById('sidebar-toggle-btn')) return;

  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'sidebar-toggle-btn';
  toggleBtn.className = 'sidebar-toggle-btn';
  toggleBtn.setAttribute('aria-label', 'Abrir/fechar menu');
  toggleBtn.innerHTML = '<i class="fa fa-bars"></i>';

  const overlay = document.createElement('div');
  overlay.id = 'sidebar-overlay';
  overlay.className = 'sidebar-overlay';

  document.body.appendChild(toggleBtn);
  document.body.appendChild(overlay);

  const isMobile = () => window.innerWidth <= 768;

  // ----- Estado persistido (apenas desktop) -----
  const SIDEBAR_KEY = 'sgcSidebarCollapsed';
  if (!isMobile() && localStorage.getItem(SIDEBAR_KEY) === '1') {
    document.body.classList.add('sidebar-collapsed');
  }

  const closeMobile = () => document.body.classList.remove('sidebar-open');
  const openMobile  = () => document.body.classList.add('sidebar-open');

  const toggle = () => {
    if (isMobile()) {
      if (document.body.classList.contains('sidebar-open')) closeMobile();
      else openMobile();
    } else {
      const collapsed = document.body.classList.toggle('sidebar-collapsed');
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
    }
  };

  toggleBtn.addEventListener('click', toggle);
  overlay.addEventListener('click', closeMobile);

  // Tooltip nos itens quando colapsado (desktop)
  document.querySelectorAll('.sidebar-nav a, .sidebar-nav .nav-group-toggle').forEach(el => {
    const labelEl = el.querySelector('span:not(.nav-badge-soon)');
    const txt = (labelEl ? labelEl.textContent : el.textContent || '').trim();
    if (txt && !el.hasAttribute('title')) el.setAttribute('title', txt);
  });

  // Fecha ao clicar em link de navegação (apenas no mobile, com sidebar aberto)
  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    a.addEventListener('click', () => {
      if (isMobile()) closeMobile();
    });
  });

  // Fecha com ESC (apenas mobile)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMobile()) closeMobile();
  });

  // Ao redimensionar entre breakpoints, limpa estados conflitantes
  window.addEventListener('resize', () => {
    if (isMobile()) {
      document.body.classList.remove('sidebar-collapsed');
    } else {
      document.body.classList.remove('sidebar-open');
      if (localStorage.getItem(SIDEBAR_KEY) === '1') {
        document.body.classList.add('sidebar-collapsed');
      }
    }
  });
}

// =====================================================================
// SISTEMA DE NOTIFICAÇÕES SGC (Com sincronização por API)
// =====================================================================
(function () {
  const MAX_HISTORY = 60;
  const POLL_INTERVAL = 10000; // Atualizar a cada 10 segundos
  
  let notificacoesCache = [];
  let pollTimer = null;

  const TIPOS = {
    'requisicao-criada':     { icon: 'fa fa-clipboard',        cor: '#1976d2', label: 'Requisição Criada'     },
    'requisicao-finalizada': { icon: 'fa fa-check-circle',     cor: '#28a745', label: 'Requisição Finalizada'  },
    'inventario-criado':     { icon: 'fa fa-list-alt',         cor: '#7c3aed', label: 'Inventário Criado'      },
    'inventario-finalizado': { icon: 'fa fa-check-square',     cor: '#0891b2', label: 'Inventário Finalizado'  },
    'nf-lancada':            { icon: 'fa fa-file-text',        cor: '#ea580c', label: 'NF Lançada'             },
    'nf-armazenada':         { icon: 'fa fa-building',         cor: '#059669', label: 'NF Armazenada'          },
  };

  // Busca notificações do servidor
  async function getHistory() {
    const usuario = localStorage.getItem('userName');
    if (!usuario) return [];

    try {
      const response = await fetch(`/api/shared/notificacoes?usuario=${encodeURIComponent(usuario)}&limite=${MAX_HISTORY}`);
      if (!response.ok) throw new Error('Erro ao buscar notificações');
      
      const data = await response.json();
      notificacoesCache = data.notificacoes || [];
      return notificacoesCache;
    } catch (error) {
      console.error('Erro ao buscar notificações:', error);
      return notificacoesCache; // Retorna cache em caso de erro
    }
  }

  // Não precisa mais salvar no localStorage - tudo vai para o servidor
  function saveHistory(arr) {
    // Função mantida para compatibilidade, mas não faz nada
    // As notificações são salvas automaticamente via API
  }

  function getUnreadCount() {
    return notificacoesCache.filter(function(e) { return !e.lido; }).length;
  }

  function escapeHtml(text) {
    var d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  function buildUI() {
    if (document.getElementById('sgc-notif-root')) return;

    // Container de toasts (fora do root para posicionamento independente)
    var toasts = document.createElement('div');
    toasts.id = 'sgc-notif-toasts';
    document.body.appendChild(toasts);

    // Root: sino + painel
    var root = document.createElement('div');
    root.id = 'sgc-notif-root';
    root.innerHTML =
      '<div id="sgc-notif-panel">' +
        '<div class="sgc-notif-panel-header">' +
          '<span><i class="fa fa-bell" style="margin-right:7px;color:var(--cor-principal)"></i>Notificações</span>' +
          '<button id="sgc-notif-panel-close" title="Fechar"><i class="fa fa-times"></i></button>' +
        '</div>' +
        '<div class="sgc-notif-panel-actions">' +
          '<button id="sgc-notif-mark-read">Marcar como lidas</button>' +
          '<button id="sgc-notif-clear-all">Limpar tudo</button>' +
        '</div>' +
        '<div id="sgc-notif-list"></div>' +
      '</div>' +
      '<div id="sgc-notif-bell" title="Notificações — clique para ver histórico">' +
        '<i class="fa fa-bell"></i>' +
        '<span id="sgc-notif-badge"></span>' +
      '</div>';
    document.body.appendChild(root);

    document.getElementById('sgc-notif-bell').addEventListener('click', togglePanel);
    document.getElementById('sgc-notif-panel-close').addEventListener('click', closePanel);
    document.getElementById('sgc-notif-clear-all').addEventListener('click', clearAll);
    document.getElementById('sgc-notif-mark-read').addEventListener('click', markAllRead);

    updateBadge();
  }

  function updateBadge() {
    var badge = document.getElementById('sgc-notif-badge');
    if (!badge) return;
    var count = getUnreadCount();
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }

  function togglePanel() {
    var panel = document.getElementById('sgc-notif-panel');
    if (!panel) return;
    if (panel.classList.contains('sgc-panel-visible')) {
      closePanel();
    } else {
      openPanel();
    }
  }

  async function openPanel() {
    var panel = document.getElementById('sgc-notif-panel');
    if (!panel) return;
    panel.classList.add('sgc-panel-visible');
    await renderHistory();
  }

  function closePanel() {
    var panel = document.getElementById('sgc-notif-panel');
    if (panel) panel.classList.remove('sgc-panel-visible');
  }

  async function renderHistory() {
    var list = document.getElementById('sgc-notif-list');
    if (!list) return;
    
    var history = await getHistory();
    
    if (history.length === 0) {
      list.innerHTML = '<p class="sgc-notif-empty"><i class="fa fa-bell-slash" style="font-size:1.5em;display:block;margin-bottom:8px"></i>Nenhuma notificação ainda.</p>';
      return;
    }
    list.innerHTML = history.map(function(evt) {
      var tipo = TIPOS[evt.type] || { icon: 'fa fa-bell', cor: '#666', label: evt.type };
      var data = new Date(evt.timestamp).toLocaleString('pt-BR');
      return '<div class="sgc-notif-item ' + (evt.lido ? 'lido' : 'nao-lido') + '">' +
        '<div class="sgc-notif-item-icon" style="color:' + tipo.cor + '"><i class="' + tipo.icon + '"></i></div>' +
        '<div class="sgc-notif-item-body">' +
          '<div class="sgc-notif-item-title">' + tipo.label + '</div>' +
          '<div class="sgc-notif-item-msg">' + escapeHtml(evt.message) + '</div>' +
          (evt.detail ? '<div class="sgc-notif-item-detail">' + escapeHtml(evt.detail) + '</div>' : '') +
          '<div class="sgc-notif-item-time">' + data + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    
    updateBadge();
  }

  async function clearAll() {
    const usuario = localStorage.getItem('userName');
    if (!usuario) return;

    try {
      const response = await fetch('/api/shared/notificacoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'limparTodas', usuario })
      });

      if (response.ok) {
        notificacoesCache = [];
        updateBadge();
        renderHistory();
      }
    } catch (error) {
      console.error('Erro ao limpar notificações:', error);
    }
  }

  async function markAllRead() {
    const usuario = localStorage.getItem('userName');
    if (!usuario) return;

    try {
      const response = await fetch('/api/shared/notificacoes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'marcarTodasLidas', usuario })
      });

      if (response.ok) {
        await renderHistory();
      }
    } catch (error) {
      console.error('Erro ao marcar notificações como lidas:', error);
    }
  }

  function showToast(evt) {
    var container = document.getElementById('sgc-notif-toasts');
    if (!container) return;

    var tipo = TIPOS[evt.type] || { icon: 'fa fa-bell', cor: '#666', label: evt.type };
    var toast = document.createElement('div');
    toast.className = 'sgc-toast';
    toast.innerHTML =
      '<div class="sgc-toast-icon" style="background:' + tipo.cor + '"><i class="' + tipo.icon + '"></i></div>' +
      '<div class="sgc-toast-body">' +
        '<div class="sgc-toast-title">' + tipo.label + '</div>' +
        '<div class="sgc-toast-msg">' + escapeHtml(evt.message) + '</div>' +
      '</div>' +
      '<button class="sgc-toast-close" title="Fechar"><i class="fa fa-times"></i></button>' +
      '<div class="sgc-toast-progress"></div>';

    container.appendChild(toast);

    toast.querySelector('.sgc-toast-close').addEventListener('click', function(e) {
      e.stopPropagation();
      dismissToast(toast);
    });
    toast.querySelector('.sgc-toast-body').addEventListener('click', function() {
      openPanel();
    });

    // Anima entrada (duplo requestAnimationFrame garante que o CSS já foi aplicado)
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        toast.classList.add('sgc-toast-show');
        var bar = toast.querySelector('.sgc-toast-progress');
        bar.style.transition = 'width 5s linear';
        bar.style.width = '0%';
      });
    });

    var timer = setTimeout(function() { dismissToast(toast); }, 5000);
    toast._sgcTimer = timer;
  }

  function dismissToast(toast) {
    clearTimeout(toast._sgcTimer);
    toast.classList.remove('sgc-toast-show');
    toast.classList.add('sgc-toast-hide');
    setTimeout(function() { if (toast.parentNode) toast.remove(); }, 350);
  }

  // API pública global
  window.SGCNotifications = {
    add: async function(type, message, detail) {
      detail = detail || '';
      const usuario = localStorage.getItem('userName');
      if (!usuario) {
        console.warn('Usuário não logado - notificação não será salva');
        return;
      }

      try {
        // Enviar notificação para o servidor (será visível para todos)
        const response = await fetch('/api/shared/notificacoes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: type,
            mensagem: message,
            detalhe: detail,
            usuarioOrigem: usuario,
            usuarioDestino: null  // null = todos veem
          })
        });

        if (!response.ok) {
          throw new Error('Erro ao criar notificação');
        }

        // Criar evento local para o toast (imediato)
        var evt = {
          id: Date.now() + Math.random(),
          type: type,
          message: message,
          detail: detail,
          timestamp: Date.now(),
          lido: false
        };

        // Mostrar toast imediatamente
        showToast(evt);

        // Atualizar histórico em segundo plano
        setTimeout(async function() {
          await getHistory();
          updateBadge();
          
          var panel = document.getElementById('sgc-notif-panel');
          if (panel && panel.classList.contains('sgc-panel-visible')) {
            renderHistory();
          }
        }, 500);

      } catch (error) {
        console.error('Erro ao adicionar notificação:', error);
      }
    }
  };

  // Inicializa polling de notificações
  async function startPolling() {
    const usuario = localStorage.getItem('userName');
    if (!usuario) return;

    // Primeira busca
    await getHistory();
    updateBadge();

    // Polling a cada 10 segundos
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async function() {
      await getHistory();
      updateBadge();
    }, POLL_INTERVAL);
  }

  // Para o polling quando o usuário sai
  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // Inicializa quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      buildUI();
      startPolling();
    });
  } else {
    buildUI();
    startPolling();
  }

  // Expor função de parar polling (útil para logout)
  window.SGCNotifications.stopPolling = stopPolling;
})();
