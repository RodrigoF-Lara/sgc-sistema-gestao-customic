// Gestão de Usuários - SGC
let usuarioSelecionado = null;

// Torna selecionarUsuario global para onclick funcionar
window.selecionarUsuario = selecionarUsuario;

// Verificação de acesso - Apenas ADMIN (nível 1)
function verificarAcesso() {
    const userLevel = localStorage.getItem('userLevel');
    const userName = localStorage.getItem('userName');
    
    console.log('DEBUG - userLevel:', userLevel, 'tipo:', typeof userLevel);
    
    // Se não tem userLevel salvo, sessão antiga - forçar novo login
    if (userLevel === null || userLevel === 'null' || userLevel === undefined) {
        alert('Sua sessão precisa ser atualizada.\n\nPor favor, faça login novamente para acessar esta página.');
        localStorage.removeItem('userName');
        localStorage.removeItem('loginTime');
        window.location.href = '/index.html';
        return false;
    }
    
    // NIVEL 1 = ADMIN
    if (userLevel !== '1' && userLevel !== 1 && parseInt(userLevel) !== 1) {
        alert(`Acesso Negado!\n\n${userName || 'Usuário'}, você não tem permissão para acessar esta página.\n\nApenas administradores podem gerenciar usuários.`);
        window.location.href = '/menu.html';
        return false;
    }
    return true;
}

document.addEventListener('DOMContentLoaded', function() {
    // Verifica acesso antes de carregar a página
    if (!verificarAcesso()) {
        return;
    }
    
    carregarUsuarios();
    inicializarEventos();
    configurarMascaras();
});

function inicializarEventos() {
    const form = document.getElementById('usuarioForm');
    const btnLimpar = document.getElementById('btnLimpar');
    const btnExcluir = document.getElementById('btnExcluir');
    const filtroInput = document.getElementById('filtroUsuarios');
    const btnNovoUsuario = document.getElementById('btnNovoUsuario');
    const btnFecharForm = document.getElementById('btnFecharForm');

    form.addEventListener('submit', salvarUsuario);
    btnLimpar.addEventListener('click', limparFormulario);
    btnExcluir.addEventListener('click', excluirUsuario);
    btnNovoUsuario.addEventListener('click', mostrarFormulario);
    btnFecharForm.addEventListener('click', esconderFormulario);

    // Filtro de usuários
    filtroInput.addEventListener('input', function(e) {
        filtrarUsuarios(e.target.value);
    });

    // Força uppercase em campos específicos
    const camposUppercase = document.querySelectorAll('.uppercase');
    camposUppercase.forEach(campo => {
        campo.addEventListener('input', function(e) {
            e.target.value = e.target.value.toUpperCase();
        });
    });
}

function mostrarFormulario() {
    document.getElementById('formularioSection').classList.add('show');
    document.getElementById('form-title').textContent = 'Novo Usuário';
    document.getElementById('acoesEdicao').style.display = 'none';
    limparFormulario();
    // Scroll suave para o formulário
    document.getElementById('formularioSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function esconderFormulario() {
    document.getElementById('formularioSection').classList.remove('show');
    limparFormulario();
}

window.editarUsuario = function(usuarioNome) {
    console.log('Editando usuário:', usuarioNome);
    mostrarFormulario();
    carregarUsuarioParaEdicao(usuarioNome);
};

window.excluirUsuarioConfirm = async function(usuarioNome, nomeCompleto) {
    if (!confirm(`Tem certeza que deseja excluir o usuário "${usuarioNome}"?\n${nomeCompleto}\n\nEsta ação não pode ser desfeita!`)) {
        return;
    }

    try {
        const response = await fetch(`/api/shared/auth?usuario=${encodeURIComponent(usuarioNome)}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensagem(data.message, 'success');
            carregarUsuarios();
        } else {
            mostrarMensagem(data.error || 'Erro ao excluir usuário', 'error');
        }
    } catch (error) {
        console.error('Erro ao excluir usuário:', error);
        mostrarMensagem('Erro ao excluir usuário: ' + error.message, 'error');
    }
}

function configurarMascaras() {
    const cpfInput = document.getElementById('cpf');
    
    // Máscara de CPF
    cpfInput.addEventListener('input', function(e) {
        let value = e.target.value.replace(/\D/g, '');
        
        if (value.length <= 11) {
            value = value.replace(/(\d{3})(\d)/, '$1.$2');
            value = value.replace(/(\d{3})(\d)/, '$1.$2');
            value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
        }
        
        e.target.value = value;
    });
}

async function carregarUsuarios() {
    try {
        const response = await fetch('/api/shared/auth');
        const data = await response.json();

        console.log('Resposta da API:', data);

        if (response.ok) {
            renderizarUsuarios(data.usuarios);
            document.getElementById('totalUsuarios').textContent = data.total;
        } else {
            mostrarMensagem('Erro ao carregar usuários: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Erro ao carregar usuários:', error);
        mostrarMensagem('Erro ao carregar usuários: ' + error.message, 'error');
    }
}

function renderizarUsuarios(usuarios) {
    const container = document.getElementById('usuariosList');

    console.log('Renderizando usuários:', usuarios);

    if (usuarios.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa fa-users"></i>
                <p>Nenhum usuário cadastrado</p>
            </div>
        `;
        return;
    }

    const html = usuarios.map(usuario => {
        const NIVEL_LABELS = { '1': 'ADMIN', '2': 'GERENTE', '3': 'USER', '4': 'ESTOQUISTA' };
        const NIVEL_CLASSES = { '1': 'admin', '2': 'gerente', '3': 'user', '4': 'user' };
        const nivelRaw = String(usuario.NIVEL || '').trim();
        const nivelLabel = NIVEL_LABELS[nivelRaw] || nivelRaw || 'USER';
        const nivelClass = NIVEL_CLASSES[nivelRaw] || nivelLabel.toLowerCase();
        const userKey = usuario.USUARIO || '';
        const nomeCompleto = `${usuario.F_NAME || ''} ${usuario.L_NAME || ''}`;

        return `
            <div class="usuario-item" data-usuario="${userKey}" style="display: grid; grid-template-columns: 2fr 1fr 2fr 120px; gap: 10px; align-items: center;">
                <div class="usuario-info" style="flex: none;">
                    <h3 style="margin: 0;">${usuario.USUARIO || ''}</h3>
                </div>
                <span class="usuario-badge ${nivelClass}" style="margin: 0; width: fit-content;">${nivelLabel}</span>
                <div style="flex: none;">
                    <p style="margin: 0; font-size: 0.9em; color: #666;">${nomeCompleto}</p>
                </div>
                <div class="usuario-acoes" style="justify-content: center;">
                    <button class="btn-icon edit" onclick="editarUsuario('${userKey}')" title="Editar">
                        <i class="fa fa-edit"></i>
                    </button>
                    <button class="btn-icon delete" onclick="excluirUsuarioConfirm('${userKey}', '${nomeCompleto}')" title="Excluir">
                        <i class="fa fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function filtrarUsuarios(termo) {
    const filtroLower = termo.toLowerCase().trim();
    const items = document.querySelectorAll('.usuario-item');
    let totalVisiveis = 0;

    items.forEach(item => {
        const usuario = item.querySelector('h3').textContent.toLowerCase();
        const nome = item.querySelector('p').textContent.toLowerCase();
        const badge = item.querySelector('.usuario-badge').textContent.toLowerCase();
        
        // Busca em usuário, nome completo ou nível
        const match = usuario.includes(filtroLower) || 
                     nome.includes(filtroLower) || 
                     badge.includes(filtroLower);

        if (match) {
            item.style.display = '';
            totalVisiveis++;
        } else {
            item.style.display = 'none';
        }
    });

    // Atualiza contador
    const totalElement = document.getElementById('totalUsuarios');
    const totalOriginal = totalElement.textContent.match(/\d+/)[0];
    
    if (filtroLower) {
        totalElement.textContent = `${totalVisiveis} de ${totalOriginal}`;
    } else {
        totalElement.textContent = totalOriginal;
    }
}

function selecionarUsuario(usuarioNome) {
    // Função removida - agora usa os botões de ação diretamente
}

async function carregarUsuarioParaEdicao(usuarioNome) {
    console.log('Carregando USUARIO para edição:', usuarioNome);
    
    try {
        const response = await fetch('/api/shared/auth');
        const data = await response.json();

        if (response.ok) {
            const usuario = data.usuarios.find(u => u.USUARIO === usuarioNome);
            
            if (usuario) {
                console.log('Usuário encontrado:', usuario);
                usuarioSelecionado = usuario;
                
                // Guarda o nome original do usuário para edição
                document.getElementById('usuarioId').value = usuario.USUARIO || '';
                document.getElementById('usuario').value = usuario.USUARIO || '';
                document.getElementById('senha').value = ''; // Não mostra senha por segurança
                document.getElementById('nivel').value = String(usuario.NIVEL || '').trim();
                document.getElementById('cpf').value = usuario.CPF || '';
                document.getElementById('firstName').value = usuario.F_NAME || '';
                document.getElementById('lastName').value = usuario.L_NAME || '';
                document.getElementById('setor').value = usuario.SETOR || '';

                // Altera título do formulário
                document.getElementById('form-title').textContent = 'Editar Usuário';
                document.getElementById('acoesEdicao').style.display = 'flex';
                
                // Torna senha opcional na edição
                document.getElementById('senha').required = false;
                document.getElementById('senha').placeholder = 'Deixe em branco para manter a senha atual';
                
                console.log('Formulário carregado com sucesso');
            } else {
                console.error('Usuário não encontrado na lista');
            }
        }
    } catch (error) {
        console.error('Erro ao carregar usuário:', error);
    }
}

async function salvarUsuario(e) {
    e.preventDefault();

    const usuarioOriginal = document.getElementById('usuarioId').value;
    const dados = {
        usuario: document.getElementById('usuario').value,
        senha: document.getElementById('senha').value,
        nivel: document.getElementById('nivel').value,
        cpf: document.getElementById('cpf').value.replace(/\D/g, ''),
        firstName: document.getElementById('firstName').value,
        lastName: document.getElementById('lastName').value,
        setor: document.getElementById('setor').value,
        cod: '' // Campo não utilizado mas necessário para API
    };

    try {
        let response;

        if (usuarioOriginal) {
            // Atualizar usuário existente
            dados.usuarioOriginal = usuarioOriginal;
            
            // Se senha estiver vazia, remove do objeto
            if (!dados.senha) {
                delete dados.senha;
            }

            response = await fetch('/api/shared/auth', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
        } else {
            // Criar novo usuário
            response = await fetch('/api/shared/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
        }

        const data = await response.json();

        if (response.ok) {
            mostrarMensagem(data.message, 'success');
            esconderFormulario();
            carregarUsuarios();
        } else {
            const erroMsg = data.error || data.message || 'Erro ao salvar usuário';
            const detalhes = data.message && data.error ? `\n\nDetalhes: ${data.message}` : '';
            console.error('Erro da API:', data);
            mostrarMensagem(erroMsg + detalhes, 'error');
        }
    } catch (error) {
        console.error('Erro ao salvar usuário:', error);
        mostrarMensagem('Erro ao salvar usuário: ' + error.message, 'error');
    }
}

async function excluirUsuario() {
    const usuarioNome = document.getElementById('usuarioId').value;

    if (!usuarioNome) {
        mostrarMensagem('Selecione um usuário para excluir', 'error');
        return;
    }

    const nomeExibicao = document.getElementById('usuario').value;

    if (!confirm(`Tem certeza que deseja excluir o usuário "${nomeExibicao}"?\n\nEsta ação não pode ser desfeita!`)) {
        return;
    }

    try {
        const response = await fetch(`/api/shared/auth?usuario=${encodeURIComponent(usuarioNome)}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok) {
            mostrarMensagem(data.message, 'success');
            limparFormulario();
            carregarUsuarios();
        } else {
            mostrarMensagem(data.error || 'Erro ao excluir usuário', 'error');
        }
    } catch (error) {
        console.error('Erro ao excluir usuário:', error);
        mostrarMensagem('Erro ao excluir usuário: ' + error.message, 'error');
    }
}

function limparFormulario() {
    document.getElementById('usuarioForm').reset();
    document.getElementById('usuarioId').value = '';
    document.getElementById('senha').required = true;
    document.getElementById('senha').placeholder = '';
    document.getElementById('form-title').textContent = 'Novo Usuário';
    document.getElementById('acoesEdicao').style.display = 'none';
    
    usuarioSelecionado = null;
}

function mostrarMensagem(mensagem, tipo) {
    const statusMessage = document.getElementById('status-message');
    statusMessage.textContent = mensagem;
    statusMessage.className = `status-message ${tipo}`;
    statusMessage.style.display = 'block';

    setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 5000);

    // Scroll para o topo para mostrar a mensagem
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
