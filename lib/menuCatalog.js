/**
 * Catálogo central de link_id do SGC.
 * Fonte da matriz de permissões e filtro de menu/home.
 *
 * Convenção: kebab-case, estável no tempo.
 * Admin-only: marcado com admin_only (visual); a permissão real é a tabela.
 */

export const MENU_CATALOG = [
  // ----- Geral / Home -----
  {
    id: "home",
    label: "Menu Principal",
    icon: "fa-home",
    section: "geral",
    section_label: "Geral",
    url: "/menu.html",
  },

  // ----- Embalagem — Operações -----
  {
    id: "nova-requisicao",
    label: "Nova Requisição",
    icon: "fa-file-circle-plus",
    section: "emb-operacoes",
    section_label: "Embalagem · Operações",
    url: "/modules/embalagem/requisicoes/novaRequisicao.html",
  },
  {
    id: "consultar-requisicoes",
    label: "Consultar Requisições",
    icon: "fa-magnifying-glass",
    section: "emb-operacoes",
    section_label: "Embalagem · Operações",
    url: "/modules/embalagem/requisicoes/consulta.html",
  },
  {
    id: "requisicoes",
    label: "Requisições",
    icon: "fa-file-lines",
    section: "emb-operacoes",
    section_label: "Embalagem · Operações",
    url: "/modules/embalagem/requisicoes/requisicoes.html",
    nav_id: "nav-requisicoes",
  },
  {
    id: "saida-rapida",
    label: "Saída Rápida (QR)",
    icon: "fa-qrcode",
    section: "emb-operacoes",
    section_label: "Embalagem · Operações",
    url: "/modules/embalagem/kardex/saidaRapida.html",
    nav_id: "nav-saida-rapida",
  },
  {
    id: "estoque",
    label: "Gerenciar Estoque",
    icon: "fa-archive",
    section: "emb-operacoes",
    section_label: "Embalagem · Operações",
    url: "/modules/embalagem/kardex/estoque.html",
    nav_id: "nav-estoque",
  },
  {
    id: "inventario-ciclico",
    label: "Inventário Cíclico",
    icon: "fa-clipboard-check",
    section: "emb-operacoes",
    section_label: "Embalagem · Operações",
    url: "/modules/embalagem/inventario/inventarioCiclico.html",
    nav_id: "nav-inventario-ciclico",
  },

  // ----- Embalagem — NF -----
  {
    id: "lancamento-nf",
    label: "Lançamento NF",
    icon: "fa-file-invoice",
    section: "emb-notas",
    section_label: "Embalagem · Notas Fiscais",
    url: "/modules/embalagem/nf/lancamentoNF.html",
    nav_id: "nav-lancamento-nf",
  },
  {
    id: "status-nf",
    label: "Status NF",
    icon: "fa-barcode",
    section: "emb-notas",
    section_label: "Embalagem · Notas Fiscais",
    url: "/modules/embalagem/nf/statusNF.html",
    nav_id: "nav-status-nf",
  },

  // ----- Embalagem — Relatórios / Saving -----
  {
    id: "saving-compras",
    label: "Saving de Compras",
    icon: "fa-piggy-bank",
    section: "emb-relatorios",
    section_label: "Embalagem · Relatórios",
    url: "/modules/embalagem/saving/savingCompras.html",
    nav_id: "nav-saving",
  },
  {
    id: "relatorios",
    label: "Relatórios",
    icon: "fa-chart-bar",
    section: "emb-relatorios",
    section_label: "Embalagem · Relatórios",
    url: "/modules/embalagem/relatorios/relatorios.html",
    nav_id: "nav-relatorios",
  },
  {
    id: "relatorio-baixa-periodo",
    label: "Baixa por Período",
    icon: "fa-chart-line",
    section: "emb-relatorios",
    section_label: "Embalagem · Relatórios",
    url: "/modules/embalagem/relatorios/relatorioBaixaPorPeriodo.html",
  },
  {
    id: "consumo-medio",
    label: "Consumo Médio",
    icon: "fa-box",
    section: "emb-relatorios",
    section_label: "Embalagem · Relatórios",
    url: "/modules/embalagem/kardex/consumoMedio.html",
  },
  {
    id: "relatorio-requisicoes",
    label: "Relatório de Requisições",
    icon: "fa-clipboard-list",
    section: "emb-relatorios",
    section_label: "Embalagem · Relatórios",
    url: "/modules/embalagem/relatorios/relatorioRequisicoes.html",
  },
  {
    id: "relatorio-saldo",
    label: "Saldo em Estoque",
    icon: "fa-boxes-stacked",
    section: "emb-relatorios",
    section_label: "Embalagem · Relatórios",
    url: "/modules/embalagem/relatorios/relatorioSaldo.html",
  },
  {
    id: "relatorio-acuracidade",
    label: "Acuracidade",
    icon: "fa-bullseye",
    section: "emb-relatorios",
    section_label: "Embalagem · Relatórios",
    url: "/modules/embalagem/relatorios/relatorioAcuracidade.html",
  },

  // ----- Cadastros -----
  {
    id: "cadastro-produtos",
    label: "Produtos",
    icon: "fa-box-open",
    section: "cadastros",
    section_label: "Cadastros",
    url: "/shared/cadastros/cadastroProdutos.html",
    nav_id: "nav-produtos",
  },
  {
    id: "cadastro-fornecedores",
    label: "Fornecedores",
    icon: "fa-truck",
    section: "cadastros",
    section_label: "Cadastros",
    url: "/shared/cadastros/cadastroFornecedores.html",
    nav_id: "nav-fornecedores",
  },
  {
    id: "usuarios",
    label: "Usuários",
    icon: "fa-users",
    section: "cadastros",
    section_label: "Cadastros",
    url: "/shared/cadastros/cadastroUsuarios.html",
    nav_id: "nav-usuarios",
    admin_only: true,
  },

  // ----- Configurações -----
  {
    id: "configuracoes",
    label: "Configurações Gerais",
    icon: "fa-cog",
    section: "config",
    section_label: "Configurações",
    url: "/shared/config/configuracoes.html",
    nav_id: "nav-configuracoes",
  },
  {
    id: "config-notificacoes",
    label: "Notificações",
    icon: "fa-bell",
    section: "config",
    section_label: "Configurações",
    url: "/shared/config/configNotificacoes.html",
    nav_id: "nav-config-notificacoes",
  },
  {
    id: "config-inventario",
    label: "Config. Inventário Cíclico",
    icon: "fa-clipboard-check",
    section: "config",
    section_label: "Configurações",
    url: "/modules/embalagem/inventario/configInventario.html",
  },
  {
    id: "calendario-produtivo",
    label: "Calendário Produtivo",
    icon: "fa-calendar-days",
    section: "config",
    section_label: "Configurações",
    url: "/shared/config/calendarioProdutivo.html",
  },
  {
    id: "niveis",
    label: "Cargos",
    icon: "fa-user-tie",
    section: "config",
    section_label: "Configurações",
    url: "/shared/config/niveis.html",
    nav_id: "nav-niveis",
    admin_only: true,
  },
  {
    id: "permissoes",
    label: "Matriz de Permissões",
    icon: "fa-key",
    section: "config",
    section_label: "Configurações",
    url: "/shared/config/permissoes.html",
    nav_id: "nav-permissoes",
    admin_only: true,
  },
];

/**
 * Ações especiais (não aparecem no menu, mas controlam botões/APIs).
 * Adicione aqui quando precisar de feature-flag fina.
 */
export const ACOES_ESPECIAIS = [
  {
    id: "usuarios-gerenciar",
    label: "Gerenciar usuários (criar/editar/excluir)",
    desc: "CRUD completo em cadastro de usuários",
    icon: "fa-user-gear",
  },
  {
    id: "config-editar",
    label: "Editar configurações do sistema",
    desc: "Salvar inventário, calendário, notificações",
    icon: "fa-sliders",
  },
];

/** Mapa nav_id HTML → link_id (para filtrar o menu lateral) */
export function buildNavIdToLinkId() {
  const map = {};
  for (const link of MENU_CATALOG) {
    if (link.nav_id) map[link.nav_id] = link.id;
  }
  return map;
}

/** Mapa path/filename → link_id */
export function buildPathToLinkId() {
  const map = {};
  for (const link of MENU_CATALOG) {
    if (!link.url) continue;
    const file = link.url.split("/").pop().replace(/\.html$/i, "").toLowerCase();
    map[file] = link.id;
    map[link.url.toLowerCase()] = link.id;
  }
  // aliases de páginas que compartilham o mesmo link_id
  map["novarequisicao"] = "nova-requisicao";
  map["consulta"] = "consultar-requisicoes";
  map["detalhes"] = "consultar-requisicoes";
  map["requisicoes"] = "requisicoes";
  map["saidarapida"] = "saida-rapida";
  map["estoque"] = "estoque";
  map["inventariociclico"] = "inventario-ciclico";
  map["configinventario"] = "config-inventario";
  map["lancamentonf"] = "lancamento-nf";
  map["statusnf"] = "status-nf";
  map["savingcompras"] = "saving-compras";
  map["relatorios"] = "relatorios";
  map["relatoriobaixaporperiodo"] = "relatorio-baixa-periodo";
  map["consumomedio"] = "consumo-medio";
  map["relatoriorequisicoes"] = "relatorio-requisicoes";
  map["relatoriosaldo"] = "relatorio-saldo";
  map["relatorioacuracidade"] = "relatorio-acuracidade";
  map["relatorionecessidadecompras"] = "relatorios";
  map["cadastroprodutos"] = "cadastro-produtos";
  map["cadastrofornecedores"] = "cadastro-fornecedores";
  map["cadastrousuarios"] = "usuarios";
  map["configuracoes"] = "configuracoes";
  map["confignotificacoes"] = "config-notificacoes";
  map["calendarioprodutivo"] = "calendario-produtivo";
  map["niveis"] = "niveis";
  map["permissoes"] = "permissoes";
  map["menu"] = "home";
  map["index"] = "home";
  return map;
}
