document.addEventListener('DOMContentLoaded', function() {
    carregarConfiguracoes();
});

const TIPOS_NOTIFICACOES = {
    'requisicao-criada': {
        label: 'Requisição Criada',
        descricao: 'Notifica quando uma nova requisição é criada no sistema',
        cor: '#1976d2',
        icon: 'fa fa-clipboard'
    },
    'requisicao-finalizada': {
        label: 'Requisição Finalizada',
        descricao: 'Notifica quando uma requisição é concluída',
        cor: '#28a745',
        icon: 'fa fa-check-circle'
    },
    'inventario-criado': {
        label: 'Inventário Criado',
        descricao: 'Notifica quando um novo inventário cíclico é gerado',
        cor: '#7c3aed',
        icon: 'fa fa-list-alt'
    },
    'inventario-finalizado': {
        label: 'Inventário Finalizado',
        descricao: 'Notifica quando um inventário é finalizado',
        cor: '#0891b2',
        icon: 'fa fa-check-square'
    },
    'nf-lancada': {
        label: 'NF Lançada',
        descricao: 'Notifica quando uma nota fiscal é lançada',
        cor: '#ea580c',
        icon: 'fa fa-file-text'
    },
    'nf-armazenada': {
        label: 'NF Armazenada',
        descricao: 'Notifica quando uma NF é armazenada no estoque',
        cor: '#059669',
        icon: 'fa fa-building'
    }
};

async function carregarConfiguracoes() {
    try {
        const response = await fetch('/api/configNotificacoes?action=get');
        const data = await response.json();

        if (response.ok && data.config) {
            aplicarConfiguracoes(data.config);
        } else {
            // Se não houver configurações, usar padrões
            aplicarConfigPadrao();
        }
    } catch (error) {
        console.error('Erro ao carregar configurações:', error);
        aplicarConfigPadrao();
    }

    renderizarTiposNotificacoes();
}

function aplicarConfiguracoes(config) {
    // Aplicar configurações gerais
    document.getElementById('expirationDays').value = config.expirationDays || 30;
    document.getElementById('maxNotifications').value = config.maxNotifications || 60;
    document.getElementById('pollInterval').value = config.pollInterval || 10;

    // Aplicar estados dos tipos de notificação
    if (config.tiposAtivos) {
        Object.keys(TIPOS_NOTIFICACOES).forEach(tipo => {
            const checkbox = document.getElementById(`toggle-${tipo}`);
            if (checkbox) {
                checkbox.checked = config.tiposAtivos[tipo] !== false;
            }
        });
    }
}

function aplicarConfigPadrao() {
    document.getElementById('expirationDays').value = 30;
    document.getElementById('maxNotifications').value = 60;
    document.getElementById('pollInterval').value = 10;

    // Todos os tipos ativos por padrão
    Object.keys(TIPOS_NOTIFICACOES).forEach(tipo => {
        const checkbox = document.getElementById(`toggle-${tipo}`);
        if (checkbox) {
            checkbox.checked = true;
        }
    });
}

function renderizarTiposNotificacoes() {
    const container = document.getElementById('notif-types-container');
    
    const html = Object.entries(TIPOS_NOTIFICACOES).map(([tipo, info]) => `
        <div class="notif-type-item">
            <div class="notif-type-info">
                <div class="notif-type-icon" style="background: ${info.cor}">
                    <i class="${info.icon}"></i>
                </div>
                <div class="notif-type-details">
                    <h3>${info.label}</h3>
                    <p>${info.descricao}</p>
                </div>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" id="toggle-${tipo}" checked>
                <span class="toggle-slider"></span>
            </label>
        </div>
    `).join('');

    container.innerHTML = html;
}

async function salvarConfiguracoes() {
    const statusMessage = document.getElementById('status-message');
    
    // Coletar estados dos tipos de notificação
    const tiposAtivos = {};
    Object.keys(TIPOS_NOTIFICACOES).forEach(tipo => {
        const checkbox = document.getElementById(`toggle-${tipo}`);
        tiposAtivos[tipo] = checkbox ? checkbox.checked : true;
    });

    const configuracoes = {
        expirationDays: parseInt(document.getElementById('expirationDays').value),
        maxNotifications: parseInt(document.getElementById('maxNotifications').value),
        pollInterval: parseInt(document.getElementById('pollInterval').value),
        tiposAtivos: tiposAtivos
    };

    try {
        statusMessage.textContent = 'Salvando configurações...';
        statusMessage.className = 'status-message';
        statusMessage.style.display = 'block';

        const response = await fetch('/api/configNotificacoes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'save',
                config: configuracoes
            })
        });

        const data = await response.json();

        if (response.ok) {
            statusMessage.textContent = '✓ Configurações salvas com sucesso!';
            statusMessage.className = 'status-message success';
            
            setTimeout(() => {
                statusMessage.style.display = 'none';
            }, 3000);
        } else {
            throw new Error(data.message || 'Erro ao salvar configurações');
        }
    } catch (error) {
        console.error('Erro ao salvar configurações:', error);
        statusMessage.textContent = `✗ Erro: ${error.message}`;
        statusMessage.className = 'status-message error';
    }
}

function resetarPadrao() {
    if (confirm('Deseja restaurar as configurações padrão?')) {
        aplicarConfigPadrao();
        
        const statusMessage = document.getElementById('status-message');
        statusMessage.textContent = 'Configurações restauradas. Clique em "Salvar" para aplicar.';
        statusMessage.className = 'status-message';
        statusMessage.style.display = 'block';
        
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 3000);
    }
}
