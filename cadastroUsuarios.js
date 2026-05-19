// Gestão de Usuários - SGC
let usuarioSelecionado = null;

// Torna selecionarUsuario global para onclick funcionar
window.selecionarUsuario = selecionarUsuario;

document.addEventListener('DOMContentLoaded', function() {
    carregarUsuarios();
    inicializarEventos();
    configurarMascaras();
});

function inicializarEventos() {
    const form = document.getElementById('usuarioForm');
    const btnLimpar = document.getElementById('btnLimpar');
    const btnExcluir = document.getElementById('btnExcluir');

    form.addEventListener('submit', salvarUsuario);
    btnLimpar.addEventListener('click', limparFormulario);
    btnExcluir.addEventListener('click', excluirUsuario);

    // Delegação de eventos para cliques nos usuários da lista
    document.getElementById('usuariosList').addEventListener('click', function(e) {
        const usuarioItem = e.target.closest('.usuario-item');
        if (usuarioItem) {
            console.log('Item clicado:', usuarioItem);
            console.log('dataset:', usuarioItem.dataset);
            console.log('data-id:', usuarioItem.dataset.id);
            
            const id = parseInt(usuarioItem.dataset.id);
            console.log('ID parseado:', id);
            
            if (!isNaN(id)) {
                selecionarUsuario(id);
            } else {
                console.error('ID inválido:', usuarioItem.dataset.id);
            }
        }
    });

    // Força uppercase em campos específicos
    const camposUppercase = document.querySelectorAll('.uppercase');
    camposUppercase.forEach(campo => {
        campo.addEventListener('input', function(e) {
            e.target.value = e.target.value.toUpperCase();
        });
    });
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
        const response = await fetch('/api/auth');
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
        console.log('Usuário individual:', usuario, 'ID:', usuario.ID);
        
        const nivel = String(usuario.NIVEL || 'USER');
        const nivelClass = nivel.toLowerCase();
        const nivelLabel = nivel;
        const userId = usuario.ID || 0;

        return `
            <div class="usuario-item" data-id="${userId}">
                <div class="usuario-info">
                    <h3>${usuario.USUARIO || ''}</h3>
                    <p>${usuario.F_NAME || ''} ${usuario.L_NAME || ''}</p>
                </div>
                <span class="usuario-badge ${nivelClass}">${nivelLabel}</span>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function selecionarUsuario(id) {
    console.log('Selecionando usuário ID:', id);
    
    // Remove seleção anterior
    document.querySelectorAll('.usuario-item').forEach(item => {
        item.classList.remove('selecionado');
    });

    // Adiciona seleção ao item clicado
    const item = document.querySelector(`[data-id="${id}"]`);
    if (item) {
        item.classList.add('selecionado');
        console.log('Item selecionado:', item);
    }

    // Carrega dados do usuário no formulário
    carregarUsuarioParaEdicao(id);
}

async function carregarUsuarioParaEdicao(id) {
    console.log('Carregando usuário para edição, ID:', id);
    
    try {
        const response = await fetch('/api/auth');
        const data = await response.json();

        if (response.ok) {
            const usuario = data.usuarios.find(u => u.ID === id);
            
            if (usuario) {
                console.log('Usuário encontrado:', usuario);
                usuarioSelecionado = usuario;
                
                // Guarda o nome original do usuário para edição
                document.getElementById('usuarioId').value = usuario.USUARIO || '';
                document.getElementById('usuario').value = usuario.USUARIO || '';
                document.getElementById('senha').value = ''; // Não mostra senha por segurança
                document.getElementById('nivel').value = usuario.NIVEL || '';
                document.getElementById('cpf').value = usuario.CPF || '';
                document.getElementById('firstName').value = usuario.F_NAME || '';
                document.getElementById('lastName').value = usuario.L_NAME || '';
                document.getElementById('setor').value = usuario.SETOR || '';
                document.getElementById('cod').value = usuario.COD || '';

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
        cod: document.getElementById('cod').value
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

            response = await fetch('/api/auth', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
        } else {
            // Criar novo usuário
            response = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
        }

        const data = await response.json();

        if (response.ok) {
            mostrarMensagem(data.message, 'success');
            limparFormulario();
            carregarUsuarios();
        } else {
            mostrarMensagem(data.error || 'Erro ao salvar usuário', 'error');
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
        const response = await fetch(`/api/auth?usuario=${encodeURIComponent(usuarioNome)}`, {
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

    // Remove seleção da lista
    document.querySelectorAll('.usuario-item').forEach(item => {
        item.classList.remove('selecionado');
    });
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
