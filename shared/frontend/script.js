document.getElementById('csvForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const fileInput = document.getElementById('csvFile');
    const dtNecessidade = document.getElementById('dtNecessidade').value;
    const prioridade = document.getElementById('prioridade').value;
    const statusElem = document.getElementById('status');
    const aguardeAnimacao = document.getElementById('aguardeAnimacao');
    const resumoRequisicaoTbody = document.querySelector('#resumoRequisicao tbody'); // Pega o tbody da tabela

    if (!fileInput.files.length || !dtNecessidade || !prioridade) {
        statusElem.style.color = "#c00";
        statusElem.textContent = "Preencha todos os campos e selecione um arquivo CSV!";
        return;
    }

    aguardeAnimacao.style.display = "block";
    statusElem.style.color = "#222";
    statusElem.textContent = "Enviando";
    let dots = 0;
    const animInterval = setInterval(() => {
        dots = (dots + 1) % 4;
        statusElem.textContent = "Enviando" + ".".repeat(dots);
    }, 500);

    const userName = localStorage.getItem('userName');

    try {
        // Criar a requisição
        // ALTERAÇÃO AQUI
        const responseNovaReq = await fetch("/api/requisicao", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: 'createHeader', // Novo parâmetro de ação
                dtNecessidade: dtNecessidade,
                prioridade: prioridade,
                solicitante: userName
            })
        });

        const dataNovaReq = await responseNovaReq.json();

        if (!responseNovaReq.ok) {
            throw new Error(dataNovaReq.message || "Erro ao criar requisição");
        }

        const idReq = dataNovaReq.idReq;

        // Limpa a tabela de resumo antes de adicionar novos dados
        resumoRequisicaoTbody.innerHTML = '';

        // Upload do CSV
        Papa.parse(fileInput.files[0], {
            header: true,
            skipEmptyLines: true,
            delimiter: ";", // <-- ADICIONE ESTA LINHA
            complete: async function(results) {
                try {
                    // ALTERAÇÃO AQUI
        const responseUpload = await fetch("/api/requisicao", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: 'uploadItems', // Novo parâmetro de ação
                data: results.data,
                idReq: idReq
            })
        });

                    const dataUpload = await responseUpload.json();

                    if (!responseUpload.ok) {
                        throw new Error(dataUpload.message || "Erro ao enviar CSV");
                    }

                    clearInterval(animInterval);
                    const now = new Date();
                    const dataHora = now.toLocaleString('pt-BR');
                    statusElem.style.color = "green";
                    statusElem.textContent = `${dataUpload.message} (Requisição #${idReq} - Inserido em: ${dataHora})`;

                    if (window.SGCNotifications) {
                        SGCNotifications.add(
                            'requisicao-criada',
                            `Requisição #${idReq} criada com ${results.data.length} item(ns)`,
                            `Solicitante: ${userName || 'Sistema'} | Prioridade: ${prioridade}`
                        );
                    }

                    // Adiciona os dados na tabela de resumo
                    results.data.forEach(item => {
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td>${idReq}</td>
                            <td>${dtNecessidade}</td>
                            <td>${prioridade}</td>
                            <td>${item.CODIGO}</td>
                            <td>${item.QNT_REQ}</td>
                        `;
                        resumoRequisicaoTbody.appendChild(row);
                    });

                } catch (error) {
                    clearInterval(animInterval);
                    console.error(error);
                    statusElem.style.color = "#c00";
                    statusElem.textContent = `Erro ao enviar CSV: ${error.message}`;
                } finally {
                    aguardeAnimacao.style.display = "none";
                }
            }
        });

    } catch (error) {
        clearInterval(animInterval);
        console.error(error);
        statusElem.style.color = "#c00";
        statusElem.textContent = `Erro ao criar requisição: ${error.message}`;
        aguardeAnimacao.style.display = "none";
    }
});