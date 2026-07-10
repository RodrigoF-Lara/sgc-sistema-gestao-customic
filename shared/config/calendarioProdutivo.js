document.addEventListener('DOMContentLoaded', function() {
    carregarCalendario();

    document.getElementById('btnSalvar').addEventListener('click', salvarCalendario);
    document.getElementById('btnPadrao').addEventListener('click', aplicarPadrao);
});

function getStatusEl() {
    return document.getElementById('status-message');
}

function showStatus(texto, tipo) {
    const status = getStatusEl();
    status.textContent = texto;
    status.className = `status-message ${tipo}`;
}

function getConfigTela() {
    return {
        horaInicio: document.getElementById('horaInicio').value,
        horaFim: document.getElementById('horaFim').value,
        diasAtivos: {
            seg: document.getElementById('dia-seg').checked,
            ter: document.getElementById('dia-ter').checked,
            qua: document.getElementById('dia-qua').checked,
            qui: document.getElementById('dia-qui').checked,
            sex: document.getElementById('dia-sex').checked,
            sab: document.getElementById('dia-sab').checked,
            dom: document.getElementById('dia-dom').checked
        }
    };
}

function aplicarConfig(config) {
    document.getElementById('horaInicio').value = config.horaInicio || '08:00';
    document.getElementById('horaFim').value = config.horaFim || '18:00';

    const diasAtivos = config.diasAtivos || {};
    document.getElementById('dia-seg').checked = diasAtivos.seg !== false;
    document.getElementById('dia-ter').checked = diasAtivos.ter !== false;
    document.getElementById('dia-qua').checked = diasAtivos.qua !== false;
    document.getElementById('dia-qui').checked = diasAtivos.qui !== false;
    document.getElementById('dia-sex').checked = diasAtivos.sex !== false;
    document.getElementById('dia-sab').checked = diasAtivos.sab === true;
    document.getElementById('dia-dom').checked = diasAtivos.dom === true;
}

function aplicarPadrao() {
    aplicarConfig({
        horaInicio: '08:00',
        horaFim: '18:00',
        diasAtivos: {
            seg: true,
            ter: true,
            qua: true,
            qui: true,
            sex: true,
            sab: false,
            dom: false
        }
    });
    showStatus('Padrão aplicado. Clique em Salvar para persistir.', 'success');
}

async function carregarCalendario() {
    try {
        const response = await fetch('/api/shared/config?tipo=calendarioProdutivo&action=get');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || data.error || 'Falha ao carregar calendário');
        }

        aplicarConfig(data.config || {});
    } catch (error) {
        console.error('Erro ao carregar calendário produtivo:', error);
        aplicarPadrao();
        showStatus(`Erro ao carregar: ${error.message}`, 'error');
    }
}

async function salvarCalendario() {
    const config = getConfigTela();

    if (!config.horaInicio || !config.horaFim) {
        showStatus('Hora de início e fim são obrigatórias.', 'error');
        return;
    }

    if (config.horaInicio >= config.horaFim) {
        showStatus('A hora de início deve ser menor que a hora de fim.', 'error');
        return;
    }

    if (!Object.values(config.diasAtivos).some(Boolean)) {
        showStatus('Selecione ao menos um dia produtivo.', 'error');
        return;
    }

    try {
        showStatus('Salvando calendário produtivo...', 'success');

        const response = await fetch('/api/shared/config?tipo=calendarioProdutivo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'save',
                config,
                usuario: localStorage.getItem('userName') || 'SISTEMA'
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || data.error || 'Erro ao salvar');
        }

        showStatus('Calendário produtivo salvo com sucesso.', 'success');
    } catch (error) {
        console.error('Erro ao salvar calendário produtivo:', error);
        showStatus(`Erro ao salvar: ${error.message}`, 'error');
    }
}
