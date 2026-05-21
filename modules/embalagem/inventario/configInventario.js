document.addEventListener('DOMContentLoaded', function () {
    const configForm = document.getElementById('configForm');
    const resetBtn = document.getElementById('resetBtn');
    const statusMessage = document.getElementById('statusMessage');
    const configAtual = document.getElementById('configAtual');

    // Campos do formulário
    const bloco1Qtd = document.getElementById('bloco1Qtd');
    const bloco1Dias = document.getElementById('bloco1Dias');
    const bloco2Qtd = document.getElementById('bloco2Qtd');
    const bloco2Acuracidade = document.getElementById('bloco2Acuracidade');
    const bloco3Qtd = document.getElementById('bloco3Qtd');
    const bloco4Qtd = document.getElementById('bloco4Qtd');
    const bloco5Qtd = document.getElementById('bloco5Qtd');
    const bloco5Inventarios = document.getElementById('bloco5Inventarios');

    // Carrega as configurações atuais ao abrir a página
    carregarConfiguracoes();

    configForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        await salvarConfiguracoes();
    });

    resetBtn.addEventListener('click', function () {
        if (confirm('Restaurar configurações padrão?')) {
            restaurarPadrao();
        }
    });

    async function carregarConfiguracoes() {
        try {
            const response = await fetch('/api/config?tipo=inventario&action=get');
            const data = await response.json();

            if (response.ok && data.config) {
                const config = data.config;

                // Preenche o formulário
                bloco1Qtd.value = config.BLOCO1_QTD_ITENS;
                bloco1Dias.value = config.BLOCO1_DIAS_MOVIMENTACAO;
                bloco2Qtd.value = config.BLOCO2_QTD_ITENS;
                bloco2Acuracidade.value = config.BLOCO2_ACURACIDADE_MIN;
                bloco3Qtd.value = config.BLOCO3_QTD_ITENS;
                bloco4Qtd.value = config.BLOCO4_QTD_ITENS || 5;
                bloco5Qtd.value = config.BLOCO5_QTD_ITENS || 10;
                bloco5Inventarios.value = config.BLOCO5_INVENTARIOS_ATRAS || 3;

                // Atualiza o resumo
                atualizarResumo(config);
            } else {
                throw new Error('Configuração não encontrada');
            }
        } catch (error) {
            console.error('Erro ao carregar configurações:', error);
            configAtual.innerHTML = `<p class="error-message">Erro ao carregar configurações: ${error.message}</p>`;
        }
    }

    async function salvarConfiguracoes() {
        const usuario = localStorage.getItem('userName') || 'Sistema';

        const config = {
            bloco1QtdItens: parseInt(bloco1Qtd.value),
            bloco1DiasMovimentacao: parseInt(bloco1Dias.value),
            bloco2QtdItens: parseInt(bloco2Qtd.value),
            bloco2AcuracidadeMin: parseFloat(bloco2Acuracidade.value),
            bloco3QtdItens: parseInt(bloco3Qtd.value),
            bloco4QtdItens: parseInt(bloco4Qtd.value),
            bloco5QtdItens: parseInt(bloco5Qtd.value),
            bloco5InventariosAtras: parseInt(bloco5Inventarios.value),
            usuario: usuario
        };

        try {
            statusMessage.style.color = '#222';
            statusMessage.textContent = 'Salvando configurações...';

            const response = await fetch('/api/config?tipo=inventario', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Erro ao salvar configurações');
            }

            statusMessage.style.color = 'green';
            statusMessage.textContent = 'Configurações salvas com sucesso!';

            // Recarrega as configurações
            await carregarConfiguracoes();

            setTimeout(() => {
                statusMessage.textContent = '';
            }, 3000);

        } catch (error) {
            statusMessage.style.color = '#c00';
            statusMessage.textContent = `Erro: ${error.message}`;
        }
    }

    function restaurarPadrao() {
        bloco1Qtd.value = 10;
        bloco1Dias.value = 21;
        bloco2Qtd.value = 10;
        bloco2Acuracidade.value = 95;
        bloco3Qtd.value = 3;
        bloco4Qtd.value = 5;
        bloco5Qtd.value = 10;
        bloco5Inventarios.value = 3;
    }

    function atualizarResumo(config) {
        const dataAlteracao = config.DT_ALTERACAO
            ? new Date(config.DT_ALTERACAO).toLocaleString('pt-BR')
            : 'N/A';

        configAtual.innerHTML = `
            <h3>Resumo da Configuração</h3>
            <p><strong>Bloco 1:</strong> ${config.BLOCO1_QTD_ITENS} itens mais movimentados nos últimos ${config.BLOCO1_DIAS_MOVIMENTACAO} dias</p>
            <p><strong>Bloco 2:</strong> ${config.BLOCO2_QTD_ITENS} itens com acuracidade inferior a ${config.BLOCO2_ACURACIDADE_MIN}%</p>
            <p><strong>Bloco 3:</strong> ${config.BLOCO3_QTD_ITENS} itens com maior valor em estoque</p>
            <p><strong>Bloco 4:</strong> ${config.BLOCO4_QTD_ITENS || 5} itens com maior valor unitário</p>
            <p><strong>Bloco 5:</strong> ${config.BLOCO5_QTD_ITENS || 10} itens não contados nos últimos ${config.BLOCO5_INVENTARIOS_ATRAS || 3} inventários</p>
            <hr style="margin: 15px 0; border: none; border-top: 1px solid #e0e0e0;">
            <p style="font-size: 0.9em; color: #666;">
                <strong>Última alteração:</strong> ${dataAlteracao}<br>
                <strong>Responsável:</strong> ${config.USUARIO_ALTERACAO || 'Sistema'}
            </p>
        `;
    }
});
