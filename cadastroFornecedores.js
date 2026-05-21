// Gestão de Fornecedores - SGC
let fornecedorSelecionado = null;

document.addEventListener('DOMContentLoaded', function() {
    carregarFornecedores();
    inicializarEventos();
    configurarMascaraCNPJ();
});

function inicializarEventos() {
    const form = document.getElementById('fornecedorForm');
    const btnLimpar = document.getElementById('btnLimpar');
    const btnExcluir = document.getElementById('btnExcluir');
    const filtroInput = document.getElementById('filtroFornecedores');

    form.addEventListener('submit', salvarFornecedor);
    btnLimpar.addEventListener('click', limparFormulario);
    btnExcluir.addEventListener('click', excluirFornecedor);

    // Filtro de fornecedores
    filtroInput.addEventListener('input', function(e) {
        filtrarFornecedores(e.target.value);
    });

    // Delegação de eventos para cliques nos fornecedores da lista
    document.getElementById('fornecedoresList').addEventListener('click', function(e) {
        const fornecedorItem = e.target.closest('.fornecedor-item');
        if (fornecedorItem) {
            const codigo = parseInt(fornecedorItem.dataset.codigo);
            if (!isNaN(codigo)) {
                selecionarFornecedor(codigo);
            }
        }
    });
}

async function carregarFornecedores() {
    try {
        const response = await fetch('/api/cadastros?tipo=fornecedores');
        const data = await response.json();

        if (response.ok) {
            renderizarFornecedores(data.fornecedores);
            document.getElementById('totalFornecedores').textContent = data.total;
        } else {
            mostrarMensagem('Erro ao carregar fornecedores: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Erro ao carregar fornecedores:', error);
        mostrarMensagem('Erro ao carregar fornecedores: ' + error.message, 'error');
    }
}

function renderizarFornecedores(fornecedores) {
    const container = document.getElementById('fornecedoresList');

    if (fornecedores.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa fa-truck"></i>
                <p>Nenhum fornecedor cadastrado</p>
            </div>
        `;
        return;
    }

    const html = fornecedores.map(fornecedor => {
        return `
            <div class="fornecedor-item" data-codigo="${fornecedor.COD_FORNECEDOR}">
                <div class="fornecedor-codigo">${fornecedor.COD_FORNECEDOR}</div>
                <div class="fornecedor-razao">${fornecedor.RAZAO_SOCIAL || ''}</div>
                <div class="fornecedor-cnpj">${formatarCNPJ(fornecedor.CNPJ) || '-'}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function filtrarFornecedores(termo) {
    const filtroLower = termo.toLowerCase().trim();
    const items = document.querySelectorAll('.fornecedor-item');
    let totalVisiveis = 0;

    items.forEach(item => {
        const codigo = item.querySelector('.fornecedor-codigo').textContent.toLowerCase();
        const razao = item.querySelector('.fornecedor-razao').textContent.toLowerCase();
        const cnpj = item.querySelector('.fornecedor-cnpj').textContent.toLowerCase();
        
        const match = codigo.includes(filtroLower) || 
                     razao.includes(filtroLower) || 
                     cnpj.includes(filtroLower);

        if (match) {
            item.style.display = '';
            totalVisiveis++;
        } else {
            item.style.display = 'none';
        }
    });

    // Atualiza contador
    const totalElement = document.getElementById('totalFornecedores');
    const totalOriginal = totalElement.textContent.match(/\d+/)[0];
    
    if (filtroLower) {
        totalElement.textContent = `${totalVisiveis} de ${totalOriginal}`;
    } else {
        totalElement.textContent = totalOriginal;
    }
}

function selecionarFornecedor(codigo) {
    // Remove seleção anterior
    document.querySelectorAll('.fornecedor-item').forEach(item => {
        item.classList.remove('selecionado');
    });

    // Adiciona seleção ao item clicado
    const item = document.querySelector(`[data-codigo="${codigo}"]`);
    if (item) {
        item.classList.add('selecionado');
    }

    // Carrega dados do fornecedor no formulário
    carregarFornecedorParaEdicao(codigo);
}

async function carregarFornecedorParaEdicao(codigo) {
    try {
        const response = await fetch('/api/cadastros?tipo=fornecedores');
        const data = await response.json();

        if (response.ok) {
            const fornecedor = data.fornecedores.find(f => f.COD_FORNECEDOR === codigo);
            
            if (fornecedor) {
                fornecedorSelecionado = fornecedor;
                
                document.getElementById('fornecedorId').value = fornecedor.COD_FORNECEDOR || '';
                document.getElementById('codigo').value = fornecedor.COD_FORNECEDOR || '';
                document.getElementById('razaoSocial').value = fornecedor.RAZAO_SOCIAL || '';
                document.getElementById('cnpj').value = formatarCNPJ(fornecedor.CNPJ) || '';

                // Altera título do formulário
                document.getElementById('form-title').innerHTML = '<i class="fa fa-edit"></i> Editar Fornecedor';
                document.getElementById('acoesEdicao').style.display = 'flex';
            }
        }
    } catch (error) {
        console.error('Erro ao carregar fornecedor:', error);
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
            // Edição
            dados.codFornecedorOriginal = parseInt(codFornecedorOriginal);
            response = await fetch('/api/cadastros?tipo=fornecedores', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
        } else {
            // Novo
            response = await fetch('/api/cadastros?tipo=fornecedores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
        }

        const data = await response.json();

        if (response.ok) {
            mostrarMensagem(data.message, 'success');
            limparFormulario();
            await carregarFornecedores();
        } else {
            mostrarMensagem(data.error || 'Erro ao salvar fornecedor', 'error');
        }
    } catch (error) {
        console.error('Erro ao salvar fornecedor:', error);
        mostrarMensagem('Erro ao salvar fornecedor: ' + error.message, 'error');
    }
}

async function excluirFornecedor() {
    const codigo = document.getElementById('fornecedorId').value;
    const razao = document.getElementById('razaoSocial').value;

    if (!codigo) {
        mostrarMensagem('Selecione um fornecedor para excluir', 'error');
        return;
    }

    if (!confirm(`Deseja realmente excluir o fornecedor ${codigo} - ${razao}?\n\nEsta ação não pode ser desfeita!`)) {
        return;
    }

    try {
        const response = await fetch(`/api/cadastros?tipo=fornecedores&codFornecedor=${codigo}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensagem(data.message, 'success');
            limparFormulario();
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
    document.getElementById('form-title').innerHTML = '<i class="fa fa-plus"></i> Novo Fornecedor';
    document.getElementById('acoesEdicao').style.display = 'none';
    fornecedorSelecionado = null;

    // Remove seleção visual
    document.querySelectorAll('.fornecedor-item').forEach(item => {
        item.classList.remove('selecionado');
    });
}

function mostrarMensagem(texto, tipo) {
    const elemento = document.getElementById('status-message');
    elemento.textContent = texto;
    elemento.className = `status-message ${tipo}`;
    elemento.style.display = 'block';

    setTimeout(() => {
        elemento.style.display = 'none';
    }, 5000);
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
    
    const numeros = cnpj.replace(/\D/g, '');
    
    if (numeros.length === 14) {
        return numeros.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    }
    
    return cnpj;
}

function limparCNPJ(cnpj) {
    return cnpj ? cnpj.replace(/\D/g, '') : '';
}
