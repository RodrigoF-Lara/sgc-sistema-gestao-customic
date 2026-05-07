// Carrega menu-lateral.html (se existir) e inicializa comportamento do sidebar
document.addEventListener('DOMContentLoaded', function () {
  const sidebarContainer = document.getElementById('sidebar-container');
  if (!sidebarContainer) return;

  fetch('menu-lateral.html')
    .then(response => {
      if (!response.ok) throw new Error('menu-lateral.html não encontrado');
      return response.text();
    })
    .then(html => {
      sidebarContainer.innerHTML = html;
      inicializarSidebar();
    })
    .catch(err => {
      console.error('Falha ao carregar menu-lateral.html:', err);
      // Fallback sincronizado com nomes existentes no projeto
      sidebarContainer.innerHTML = `
        <div class="sidebar-header"><h3>SGC - Sistema de Gestão Customic</h3></div>
        <div class="sidebar-user-info"><span id="sidebar-username">Usuário</span></div>
        <nav class="sidebar-nav">
          <a href="menu.html" id="nav-menu"><i class="fa fa-home"></i> Menu Principal</a>
          <a href="requisicoes.html" id="nav-requisicoes"><i class="fa fa-file-lines"></i> Requisições</a>
          <a href="estoque.html" id="nav-estoque"><i class="fa fa-archive"></i> Gerenciar Estoque</a>
          <a href="saidaRapida.html" id="nav-saida-rapida"><i class="fa fa-qrcode"></i> Saída Rápida (QR)</a>
          <a href="statusNF.html" id="nav-status-nf"><i class="fa fa-barcode"></i> Status NF</a>
          <a href="inventarioCiclico.html" id="nav-inventario-ciclico"><i class="fa fa-clipboard-check"></i> Inventário Cíclico</a>
          <a href="relatorios.html" id="nav-relatorios"><i class="fa fa-chart-bar"></i> Relatórios</a>
          <a href="configInventario.html" id="nav-config-inventario"><i class="fa fa-cog"></i> Configurações</a>
        </nav>
        <div class="sidebar-footer"><button id="logout-btn" class="logout-btn">Sair</button></div>
      `;
      inicializarSidebar();
    });
});

function inicializarSidebar() {
  const userName = localStorage.getItem('userName');
  const usernameEl = document.getElementById('sidebar-username');
  if (usernameEl) usernameEl.textContent = userName || 'Usuário';

  const filename = (window.location.pathname.split('/').pop() || 'menu.html').toLowerCase();
  const pageKey = filename.replace('.html', '') || 'menu';
  const idMap = {
    'menu': 'nav-menu',
    'nova-requisicao': 'nav-requisicoes',
    'novarequisicao': 'nav-requisicoes',
    'consultar': 'nav-requisicoes',
    'consulta': 'nav-requisicoes',
    'requisicoes': 'nav-requisicoes',
    'estoque': 'nav-estoque',
    'saidarapida': 'nav-saida-rapida',
    'status-nf': 'nav-status-nf',
    'statusnf': 'nav-status-nf',
    'inventariociclico': 'nav-inventario-ciclico',
    'relatorios': 'nav-relatorios',
    'configinventario': 'nav-config-inventario',
    'index': 'nav-menu'
  };
  const navId = idMap[pageKey] || `nav-${pageKey}`;
  const navLink = document.getElementById(navId);
  if (navLink) navLink.classList.add('active');

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (confirm('Tem certeza que deseja sair?')) {
        localStorage.removeItem('userName');
        localStorage.removeItem('loginTime');
        window.location.href = 'index.html';
      }
    });
  }
}

// =====================================================================
// SISTEMA DE NOTIFICAÇÕES SGC
// =====================================================================
(function () {
  const STORAGE_KEY = 'sgc_notif_history';
  const MAX_HISTORY = 60;

  const TIPOS = {
    'requisicao-criada':     { icon: 'fa fa-clipboard',        cor: '#1976d2', label: 'Requisição Criada'     },
    'requisicao-finalizada': { icon: 'fa fa-check-circle',     cor: '#28a745', label: 'Requisição Finalizada'  },
    'inventario-criado':     { icon: 'fa fa-list-alt',         cor: '#7c3aed', label: 'Inventário Criado'      },
    'inventario-finalizado': { icon: 'fa fa-check-square',     cor: '#0891b2', label: 'Inventário Finalizado'  },
    'nf-lancada':            { icon: 'fa fa-file-text',        cor: '#ea580c', label: 'NF Lançada'             },
    'nf-armazenada':         { icon: 'fa fa-building',         cor: '#059669', label: 'NF Armazenada'          },
  };

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function saveHistory(arr) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(0, MAX_HISTORY)));
  }

  function getUnreadCount() {
    return getHistory().filter(function(e) { return !e.lido; }).length;
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

  function openPanel() {
    var panel = document.getElementById('sgc-notif-panel');
    if (!panel) return;
    panel.classList.add('sgc-panel-visible');
    renderHistory();
  }

  function closePanel() {
    var panel = document.getElementById('sgc-notif-panel');
    if (panel) panel.classList.remove('sgc-panel-visible');
  }

  function renderHistory() {
    var list = document.getElementById('sgc-notif-list');
    if (!list) return;
    var history = getHistory();
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
  }

  function clearAll() {
    saveHistory([]);
    updateBadge();
    renderHistory();
  }

  function markAllRead() {
    var history = getHistory().map(function(e) { return Object.assign({}, e, { lido: true }); });
    saveHistory(history);
    updateBadge();
    renderHistory();
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
    add: function(type, message, detail) {
      detail = detail || '';
      var evt = {
        id: Date.now() + Math.random(),
        type: type,
        message: message,
        detail: detail,
        timestamp: Date.now(),
        lido: false
      };
      var history = getHistory();
      history.unshift(evt);
      saveHistory(history);
      updateBadge();

      var panel = document.getElementById('sgc-notif-panel');
      if (panel && panel.classList.contains('sgc-panel-visible')) {
        renderHistory();
      }

      showToast(evt);
    }
  };

  // Inicializa quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
