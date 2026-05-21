// Gestão de Fornecedores - SGC
// Paginação server-side + busca com debounce + modal de cadastro

let fornecedorSelecionado = null;
let estadoAtual = {
    page: 1,
    pageSize: 50,
    search: '',
    totalPages: 1,
    total: 0
};
let debounceTimer = null;

document.addEventListener('DOMContentLoaded', function() {
    inicializarEventos();
    configurarMascaraCNPJ();
    carregarFornecedores();
});

function inicializarEventos() {
    const form = document.getElementById('fornecedorForm');
    const btnLimpar = document.getElementById('btnLimpar');
    const btnExcluir = document.getElementById('btnExcluir');
    const filtroInput = document.getElementById('filtroFornecedores');
    const btnNovo = document.getElementById('btnNovoFornecedor');
    const btnFecharModal = document.getElementById('btnFecharModal');
    const modal = document.getElementById('modalFornecedor');
    const pageSizeSelect = document.getElementById('pageSize');

    form.addEventListener('submit', salvarFornecedor);
    btnLimpar.addEventListener('click', limparFormulario);
    btnExcluir.addEventListener('click', excluirFornecedor);
    btnNovo.addEventListener('click', abrirModalNovo);
    btnFecharModal.addEventListener('click', fecharModal);

    // Fecha modal ao clicar fora
    modal.addEventListener('click', function(e) {
        if (e.target === modal) fecharModal();
    });

    // Fecha modal com ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
            fecharModal();
        }
    });

    // Busca com debounce (300ms) - server-side
    filtroInput.addEventListener('input', function(e) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            estadoAtual.search = e.target.value.trim();
            estadoAtual.page = 1;
            carregarFornecedores();
        }, 300);
    });

    // Mudança de page size
    pageSizeSelect.addEventListener('change', function(e) {
        estadoAtual.pageSize = parseInt(e.target.value);
        estadoAtual.page = 1;
        carregarFornecedores();
    });

    // Delegação de eventos para botões de editar/excluir na lista
    document.getElementById('fornecedoresList').addEventListener('click', function(e) {
        const btnEdit = e.target.closest('.btn-edit');
        const btnDelete = e.target.closest('.btn-delete');
        
        if (btnEdit) {
            const codigo = parseInt(btnEdit.dataset.codigo);
            if (!isNaN(codigo)) abrirModalEdicao(codigo);
        } else if (btnDelete) {
            const codigo = parseInt(btnDelete.dataset.codigo);
            const razao = btnDelete.dataset.razao;
            if (!isNaN(codigo)) excluirFornecedorDireto(codigo, razao);
        }
    });
}

// ============================================================
// MODAL
// ============================================================

function abrirModalNovo() {
    limparFormulario();
    document.getElementById('form-title').innerHTML = '<i class="fa fa-plus"></i> Novo Fornecedor';
    document.getElementById('acoesEdicao').style.display = 'none';
    document.getElementById('modalFornecedor').classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('codigo').focus(), 100);
}

function abrirModalEdicao(codigo) {
    document.getElementById('modalFornecedor').classList.add('show');
    document.body.style.overflow = 'hidden';
    carregarFornecedorParaEdicao(codigo);
}

function fecharModal() {
    document.getElementById('modalFornecedor').classList.remove('show');
    document.body.style.overflow = '';
    limparFormulario();
}

// ============================================================
// LISTAGEM (server-side)
// ============================================================

async function carregarFornecedores() {
    const container = document.getElementById('fornecedoresList');
    container.innerHTML = '<div class="loading-indicator"><i class="fa fa-spinner fa-spin"></i> Carregando...</div>';

    try {
        const params = new URLSearchParams({
            tipo: 'fornecedores',
            page: estadoAtual.page,
            pageSize: estadoAtual.pageSize,
            search: estadoAtual.search
        });

        const response = await fetch(`/api/shared/cadastros?${params}`);
        const data = await response.json();

        if (response.ok) {
            estadoAtual.total = data.total;
            estadoAtual.totalPages = data.totalPages || 1;
            renderizarFornecedores(data.fornecedores);
            renderizarPaginacao();
            atualizarContador();
        } else {
            mostrarMensagem('Erro ao carregar fornecedores: ' + (data.error || ''), 'error');
        }
    } catch (error) {
        console.error('Erro ao carregar fornecedores:', error);
        mostrarMensagem('Erro ao carregar fornecedores: ' + error.message, 'error');
    }
}

function renderizarFornecedores(fornecedores) {
    const container = document.getElementById('fornecedoresList');

    if (!fornecedores || fornecedores.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa fa-truck"></i>
                <p>${estadoAtual.search ? 'Nenhum fornecedor encontrado para "' + estadoAtual.search + '"' : 'Nenhum fornecedor cadastrado'}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = fornecedores.map(f => `
        <div class="fornecedor-item">
            <div class="fornecedor-codigo">${f.COD_FORNECEDOR}</div>
            <div class="fornecedor-razao">${f.RAZAO_SOCIAL || ''}</div>
            <div class="fornecedor-cnpj">${formatarCNPJ(f.CNPJ) || '-'}</div>
            <div class="item-actions">
                <button class="btn-icon btn-edit" data-codigo="${f.COD_FORNECEDOR}" title="Editar">
                    <i class="fa fa-edit"></i> Editar
                </button>
                <button class="btn-icon btn-delete" data-codigo="${f.COD_FORNECEDOR}" data-razao="${(f.RAZAO_SOCIAL || '').replace(/"/g, '&quot;')}" title="Excluir">
                    <i class="fa fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function renderizarPaginacao() {
    const container = document.getElementById('paginationContainer');
    const controls = document.getElementById('paginationControls');
    const info = document.getElementById('paginationInfo');

    if (estadoAtual.total === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';

    const inicio = (estadoAtual.page - 1) * estadoAtual.pageSize + 1;
    const fim = Math.min(estadoAtual.page * estadoAtual.pageSize, estadoAtual.total);
    info.textContent = `Mostrando ${inicio}-${fim} de ${estadoAtual.total.toLocaleString('pt-BR')} registros`;

    // Botões de paginação
    let html = '';
    const { page, totalPages } = estadoAtual;

    html += `<button onclick="irParaPagina(1)" ${page === 1 ? 'disabled' : ''} title="Primeira"><i class="fa fa-angles-left"></i></button>`;
    html += `<button onclick="irParaPagina(${page - 1})" ${page === 1 ? 'disabled' : ''} title="Anterior"><i class="fa fa-angle-left"></i></button>`;

    // Janela de páginas (5 botões ao redor da atual)
    const inicioJanela = Math.max(1, page - 2);
    const fimJanela = Math.min(totalPages, inicioJanela + 4);

    for (let i = inicioJanela; i <= fimJanela; i++) {
        html += `<button class="${i === page ? 'active' : ''}" onclick="irParaPagina(${i})">${i}</button>`;
    }

    html += `<button onclick="irParaPagina(${page + 1})" ${page === totalPages ? 'disabled' : ''} title="Próxima"><i class="fa fa-angle-right"></i></button>`;
    html += `<button onclick="irParaPagina(${totalPages})" ${page === totalPages ? 'disabled' : ''} title="Última"><i class="fa fa-angles-right"></i></button>`;

    controls.innerHTML = html;
}

window.irParaPagina = function(novaPagina) {
    if (novaPagina < 1 || novaPagina > estadoAtual.totalPages) return;
    estadoAtual.page = novaPagina;
    carregarFornecedores();
    document.querySelector('.lista-header').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function atualizarContador() {
    document.getElementById('totalFornecedores').textContent = estadoAtual.total.toLocaleString('pt-BR');
}

// ============================================================
// EDIÇÃO
// ============================================================

async function carregarFornecedorParaEdicao(codigo) {
    try {
        // Busca específica pelo código
        const params = new URLSearchParams({
            tipo: 'fornecedores',
            search: codigo,
            pageSize: 10
        });
        const response = await fetch(`/api/shared/cadastros?${params}`);
        const data = await response.json();

        if (response.ok) {
            const fornecedor = data.fornecedores.find(f => f.COD_FORNECEDOR === codigo);
            if (fornecedor) {
                fornecedorSelecionado = fornecedor;
                document.getElementById('fornecedorId').value = fornecedor.COD_FORNECEDOR || '';
                document.getElementById('codigo').value = fornecedor.COD_FORNECEDOR || '';
                document.getElementById('razaoSocial').value = fornecedor.RAZAO_SOCIAL || '';
                document.getElementById('cnpj').value = formatarCNPJ(fornecedor.CNPJ) || '';
                document.getElementById('form-title').innerHTML = '<i class="fa fa-edit"></i> Editar Fornecedor';
                document.getElementById('acoesEdicao').style.display = 'flex';
            }
        }
    } catch (error) {
        console.error('Erro ao carregar fornecedor:', error);
        mostrarMensagem('Erro ao carregar fornecedor: ' + error.message, 'error');
    }
}

async function salvarFornecedor(e) {
    e.preventDefault();

    const codFornecedorOriginal = document.getElementById('fornecedorId').value;
    const dados = {
        codFornecedor: parseInt(document.getElementById('codigo').value),
        razaoSocial: document.getElementById('razaoSocial').value,
        cnpj: limparCNPJ(document.getElementById('cnpj').value)
    };

    try {
        let response;
        if (codFornecedorOriginal) {
            dados.codFornecedorOriginal = parseInt(codFornecedorOriginal);
            response = await fetch('/api/shared/cadastros?tipo=fornecedores', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
        } else {
            response = await fetch('/api/shared/cadastros?tipo=fornecedores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
        }

        const data = await response.json();
        if (response.ok) {
            mostrarMensagem(data.message, 'success');
            fecharModal();
            await carregarFornecedores();
        } else {
            mostrarMensagem(data.error || 'Erro ao salvar fornecedor', 'error');
        }
    } catch (error) {
        console.error('Erro ao salvar fornecedor:', error);
        mostrarMensagem('Erro ao salvar fornecedor: ' + error.message, 'error');
    }
}

async function excluirFornecedorDireto(codigo, razao) {
    if (!confirm(`Deseja realmente excluir o fornecedor ${codigo} - ${razao}?\n\nEsta ação não pode ser desfeita!`)) return;

    try {
        const response = await fetch(`/api/shared/cadastros?tipo=fornecedores&codFornecedor=${codigo}`, { method: 'DELETE' });
        const data = await response.json();
        if (response.ok) {
            mostrarMensagem(data.message, 'success');
            await carregarFornecedores();
        } else {
            mostrarMensagem(data.error || 'Erro ao excluir fornecedor', 'error');
        }
    } catch (error) {
        console.error('Erro ao excluir fornecedor:', error);
        mostrarMensagem('Erro ao excluir fornecedor: ' + error.message, 'error');
    }
}

async function excluirFornecedor() {
    const codigo = document.getElementById('fornecedorId').value;
    const razao = document.getElementById('razaoSocial').value;
    if (!codigo) return mostrarMensagem('Selecione um fornecedor para excluir', 'error');
    if (!confirm(`Deseja realmente excluir o fornecedor ${codigo} - ${razao}?\n\nEsta ação não pode ser desfeita!`)) return;

    try {
        const response = await fetch(`/api/shared/cadastros?tipo=fornecedores&codFornecedor=${codigo}`, { method: 'DELETE' });
        const data = await response.json();
        if (response.ok) {
            mostrarMensagem(data.message, 'success');
            fecharModal();
            await carregarFornecedores();
        } else {
            mostrarMensagem(data.error || 'Erro ao excluir fornecedor', 'error');
        }
    } catch (error) {
        console.error('Erro ao excluir fornecedor:', error);
        mostrarMensagem('Erro ao excluir fornecedor: ' + error.message, 'error');
    }
}

function limparFormulario() {
    document.getElementById('fornecedorForm').reset();
    document.getElementById('fornecedorId').value = '';
    fornecedorSelecionado = null;
}

// ============================================================
// UTILS
// ============================================================

function mostrarMensagem(texto, tipo) {
    const elemento = document.getElementById('status-message');
    elemento.textContent = texto;
    elemento.className = `status-message ${tipo}`;
    elemento.style.display = 'block';
    setTimeout(() => { elemento.style.display = 'none'; }, 5000);
}

function configurarMascaraCNPJ() {
    const cnpjInput = document.getElementById('cnpj');
    cnpjInput.addEventListener('input', function(e) {
        let valor = e.target.value.replace(/\D/g, '');
        if (valor.length <= 14) {
            valor = valor.replace(/^(\d{2})(\d)/, '$1.$2');
            valor = valor.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
            valor = valor.replace(/\.(\d{3})(\d)/, '.$1/$2');
            valor = valor.replace(/(\d{4})(\d)/, '$1-$2');
        }
        e.target.value = valor;
    });
}

function formatarCNPJ(cnpj) {
    if (!cnpj) return '';
    const numeros = String(cnpj).replace(/\D/g, '');
    if (numeros.length === 14) {
        return numeros.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    }
    return cnpj;
}

function limparCNPJ(cnpj) {
    return cnpj ? cnpj.replace(/\D/g, '') : '';
}
