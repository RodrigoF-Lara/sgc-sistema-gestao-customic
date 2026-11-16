/* Etiqueta de lote do kardex. O mesmo impresso da entrada e do balanço anual. */
(function () {
  const MODAL_HTML = `
    <div id="modalEtiqueta" class="modal">
        <div class="modal-content" style="max-width: 440px;">
            <div class="modal-header">
                <span style="font-size: 32px; margin-right: 10px;">🏷️</span>
                <h2 style="color: #1565c0;">Tamanho da Etiqueta</h2>
                <span id="closeModalEtiqueta" class="close-btn">&times;</span>
            </div>
            <div style="padding: 20px;">
                <p style="margin-bottom: 16px; color: #555; font-size: 14px;">Escolha o tamanho da etiqueta a ser impressa:</p>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <button type="button" id="btnEtiqueta100x150" style="padding: 14px 16px; font-size: 15px; font-weight: bold; background: linear-gradient(135deg,#1976d2,#1565c0); color: white; border: none; border-radius: 8px; cursor: pointer; text-align: left; transition: opacity .2s;">
                        🏷️ 100mm × 150mm
                        <small style="display:block; font-size:11px; font-weight:normal; margin-top:4px; opacity:.85;">Etiqueta completa com QR Code e código de barras</small>
                    </button>
                    <button type="button" id="btnEtiqueta40x30" style="padding: 14px 16px; font-size: 15px; font-weight: bold; background: linear-gradient(135deg,#388e3c,#2e7d32); color: white; border: none; border-radius: 8px; cursor: pointer; text-align: left; transition: opacity .2s;">
                        🏷️ 40mm × 30mm
                        <small style="display:block; font-size:11px; font-weight:normal; margin-top:4px; opacity:.85;">Etiqueta compacta com código de barras</small>
                    </button>
                </div>
            </div>
        </div>
    </div>`;

  function garantirModal() {
    if (document.getElementById('modalEtiqueta')) return;
    const holder = document.createElement('div');
    holder.innerHTML = MODAL_HTML;
    document.body.appendChild(holder.firstElementChild);
  }

  function iniciar() {
    if (window.__sgcEtiquetaPronta) return;
    garantirModal();
    let _pendingLabelData = null;

    function selecionarEImprimirEtiqueta(dadosOuArray) {
      _pendingLabelData = dadosOuArray;
      document.getElementById('modalEtiqueta').style.display = 'flex';
    }

    document.getElementById('closeModalEtiqueta').addEventListener('click', () => {
      document.getElementById('modalEtiqueta').style.display = 'none';
      _pendingLabelData = null;
    });

    document.getElementById('btnEtiqueta100x150').addEventListener('click', () => {
      document.getElementById('modalEtiqueta').style.display = 'none';
      if (_pendingLabelData) gerarEtiqueta100x150(_pendingLabelData);
      _pendingLabelData = null;
    });

    document.getElementById('btnEtiqueta40x30').addEventListener('click', () => {
      document.getElementById('modalEtiqueta').style.display = 'none';
      if (_pendingLabelData) gerarEtiqueta40x30(_pendingLabelData);
      _pendingLabelData = null;
    });

    window.addEventListener('click', (e) => {
      const modal = document.getElementById('modalEtiqueta');
      if (e.target === modal) { modal.style.display = 'none'; _pendingLabelData = null; }
    });

    function gerarEtiqueta100x150(dadosOuArray) {
      const etiquetas = Array.isArray(dadosOuArray) ? dadosOuArray : [dadosOuArray];
      if (etiquetas.length === 0) {
        console.error("gerarEtiqueta100x150 foi chamada sem dados de etiqueta válidos.");
        return;
      }

      const janelaEtiqueta = window.open("", "_blank", "width=800,height=600");

      if (!janelaEtiqueta || typeof janelaEtiqueta.closed == 'undefined' || janelaEtiqueta.closed) {
        alert("A janela de impressão foi bloqueada pelo navegador. Por favor, habilite os pop-ups para este site e tente reimprimir a etiqueta a partir do histórico.");
        return;
      }

      const etiquetasHtml = etiquetas.map(dados => `
        <div class="etiqueta">
          <div class="header">
              <div class="header-top">
                  <span class="id-badge">ID: ${dados.idMovimento || "N/A"}</span>
                  <h1>KARDEX SYSTEM</h1>
              </div>
          </div>
          
          <div class="codigo-principal">
              <div class="descricao-card">
                  <div class="descricao-label">DESCRIÇÃO DO PRODUTO:</div>
                  <div class="descricao-text">${dados.descricao || "N/A"}</div>
              </div>
          </div>
          
          <div class="qr-grande-container">
              <div id="qr-${dados.idMovimento}" class="qr-grande"></div>
              <div class="codigo-texto">${dados.codigo}</div>
          </div>
          
          <div class="info-principal">
              <div class="info-row destaque">
                  <span class="info-label">QUANTIDADE:</span>
                  <span class="info-value" style="font-size: 10pt;">${dados.quantidade}</span>
              </div>
              
              <div class="info-row">
                  <span class="info-label">ENDEREÇO:</span>
                  <span class="info-value">${dados.endereco || "-"}</span>
              </div>
              
              <div class="info-row">
                  <span class="info-label">ARMAZÉM:</span>
                  <span class="info-value">${dados.armazem ? String(dados.armazem).padStart(2, "0") : "-"}</span>
              </div>
          </div>
          
          <div class="footer">
              <div class="footer-left">
                  ${dados.dataHora}
              </div>
              <div class="footer-right">
                  ${dados.usuario} | KARDEX ${dados.ano || ""}
              </div>
          </div>
      </div>
      `).join('');

      const htmlEtiqueta = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Etiqueta - ${etiquetas[0].codigo}</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
      <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"><\/script>
      <style>
          @media print {
              @page { 
                  size: 100mm 150mm;
                  margin: 0;
              }
              body { 
                  -webkit-print-color-adjust: exact; 
                  print-color-adjust: exact;
                  padding: 0 !important;
                  background: white !important;
                  display: block !important;
              }
              .no-print { display: none !important; }
              .etiqueta {
                  page-break-inside: avoid;
                  margin-bottom: 0 !important;
                  border: none !important;
              }
          }
          
          * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
          }
          
          body {
              font-family: 'Arial', sans-serif;
              background: #ccc;
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 5mm;
          }
          
          .etiqueta {
              width: 100mm;
              height: 150mm;
              border: 1px dashed #666;
              padding: 3mm;
              background: white;
              display: flex;
              flex-direction: column;
              box-sizing: border-box;
              justify-content: space-between;
              margin-bottom: 5mm;
          }
          
          .header {
              text-align: center;
              border-bottom: 2px solid #333;
              padding-bottom: 1.5mm;
              margin-bottom: 1.5mm;
          }
          
          .header-top {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 1.5mm;
          }
          
          .header-top .id-badge {
              background-color: #2c3e50;
              color: white;
              padding: 1.5mm 3mm;
              border-radius: 3mm;
              font-size: 11pt;
              font-weight: bold;
          }
          
          .header h1 {
              font-size: 15pt;
              font-weight: bold;
              color: #1976d2;
              flex: 1;
              text-align: center;
              margin: 0;
          }
          
          .header .tipo-movimento {
              display: none;
          }

          .qr-code {
              width: 18mm !important;
              height: 18mm !important;
              display: flex;
              align-items: center;
              justify-content: center;
          }
          .qr-code img, .qr-code canvas {
              width: 18mm !important;
              height: 18mm !important;
          }
          
          .qr-grande-container {
              text-align: center;
              margin: 2mm 0;
              flex: 1;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
          }

          .qr-grande {
              width: 60mm;
              height: 60mm;
              display: flex;
              align-items: center;
              justify-content: center;
          }
          .qr-grande img, .qr-grande canvas {
              width: 60mm !important;
              height: 60mm !important;
          }
          
          .codigo-barras {
              text-align: center;
              margin: 2mm 0;
              flex: 1;
              display: flex;
              flex-direction: column;
              justify-content: center;
          }
          
          .codigo-barras svg {
              width: 100% !important;
              max-width: 130mm !important;
              height: auto !important;
          }
          
          .info-principal {
              margin: 1mm 0;
          }
          
          .info-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 0.8mm;
              padding: 1.2mm;
              background-color: #f5f5f5;
              border-left: 3px solid #1976d2;
          }
          
          .info-row.destaque {
              background-color: #e3f2fd;
              border-left-color: #0d47a1;
          }
          
          .info-label {
              font-weight: bold;
              color: #333;
              font-size: 8.5pt;
              min-width: 35%;
          }
          
          .info-value {
              color: #000;
              font-size: 8.5pt;
              font-weight: 600;
              text-align: right;
              flex: 1;
          }
          
          .descricao-card {
              margin: 1mm 0;
              padding: 2mm;
              background-color: #fff3e0;
              border: 1px solid #ff9800;
              border-radius: 2mm;
          }

          .descricao-label {
              font-weight: bold;
              font-size: 8pt;
              color: #e65100;
              margin-bottom: 1mm;
          }

          .descricao-text {
              font-size: 13pt;
              color: #000;
              font-weight: 700;
              line-height: 1.2;
          }
          
          .footer {
              border-top: 2px solid #333;
              padding-top: 2mm;
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 7pt;
              color: #666;
          }
          
          .footer-left {
              font-style: italic;
          }
          
          .footer-right {
              text-align: right;
              font-weight: bold;
          }

          .codigo-principal {
            text-align: center;
            padding: 2mm 0;
          }

          .codigo-texto {
              font-size: 18pt;
              font-weight: bold;
              letter-spacing: 2px;
              color: #111;
              margin-top: 2mm;
          }
          
          .btn-imprimir {
              position: fixed;
              top: 10px;
              right: 10px;
              padding: 10px 20px;
              background-color: #1976d2;
              color: white;
              border: none;
              border-radius: 5px;
              cursor: pointer;
              font-size: 14px;
              box-shadow: 0 2px 5px rgba(0,0,0,0.3);
              z-index: 1000;
          }
          
          .btn-imprimir:hover {
              background-color: #1565c0;
          }
      </style>
    </head>
    <body>
      <button class="btn-imprimir no-print" onclick="window.print()">🖨️ Imprimir Etiqueta</button>
      ${etiquetasHtml}    
      <script>
          const etiquetasData = ${JSON.stringify(etiquetas)};
          window.onload = function() {
              etiquetasData.forEach(dados => {
                  if (dados.idMovimento && document.getElementById('qr-' + dados.idMovimento)) {
                      new QRCode(document.getElementById('qr-' + dados.idMovimento), {
                          text: 'ID: ' + dados.idMovimento + ' | COD: ' + dados.codigo,
                          width: 227,
                          height: 227,
                          correctLevel: QRCode.CorrectLevel.M
                      });
                  }
              });
              window.focus();
          };
      <\/script>
    </body>
    </html>`;

      janelaEtiqueta.document.write(htmlEtiqueta);
      janelaEtiqueta.document.close();

      // Adiciona um pequeno delay para garantir que o conteúdo foi renderizado antes de imprimir
      setTimeout(() => {
        janelaEtiqueta.print();
      }, 500);
    }

    function gerarEtiqueta40x30(dadosOuArray) {
      const etiquetas = Array.isArray(dadosOuArray) ? dadosOuArray : [dadosOuArray];
      if (etiquetas.length === 0) return;

      const janelaEtiqueta = window.open("", "_blank", "width=420,height=360");
      if (!janelaEtiqueta || typeof janelaEtiqueta.closed == 'undefined' || janelaEtiqueta.closed) {
        alert("A janela de impressão foi bloqueada pelo navegador. Por favor, habilite os pop-ups para este site e tente reimprimir a etiqueta a partir do histórico.");
        return;
      }

      const etiquetasHtml = etiquetas.map(dados => `
        <div class="etiqueta">
          <div class="topo">
            <span class="codigo-text">${dados.codigo}</span>
            <span class="qtd-text">QTD: ${dados.quantidade}</span>
          </div>
          <div class="descricao">${(dados.descricao || '')}</div>
          <div class="meio">
            <div id="qr-${dados.idMovimento}" class="qr-area"></div>
            <div class="meio-info">
              <div class="info-linha"><span class="info-label">ID:</span> ${dados.idMovimento || '-'}</div>
              <div class="info-linha"><span class="info-label">END:</span> ${dados.endereco || '-'} / ARM: ${dados.armazem ? String(dados.armazem).padStart(2,'0') : '-'}</div>
              <div class="rodape data">${dados.dataHora || ''}</div>
              <div class="rodape usuario">${dados.usuario || ''}</div>
            </div>
          </div>
        </div>
      `).join('');

      const htmlEtiqueta40 = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Etiqueta 40x30 - ${etiquetas[0].codigo}</title>
      <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"><\/script>
      <style>
          @media print {
              @page {
                  size: 40mm 30mm;
                  margin: 0;
              }
              body {
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                  padding: 0 !important;
                  background: white !important;
                  display: block !important;
              }
              .no-print { display: none !important; }
              .etiqueta {
                  page-break-inside: avoid;
                  border: none !important;
                  margin: 0 !important;
              }
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
              font-family: Arial, sans-serif;
              background: #ccc;
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 4mm;
              gap: 4mm;
          }
          .etiqueta {
              width: 40mm;
              height: 30mm;
              background: white;
              border: 1px dashed #999;
              padding: 1.2mm 1.5mm;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              overflow: hidden;
          }
          .topo {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 0.5pt solid #ccc;
              padding-bottom: 0.5mm;
          }
          .codigo-text {
              font-size: 7pt;
              font-weight: bold;
              color: #000;
              letter-spacing: 0.3px;
          }
          .qtd-text {
              font-size: 7pt;
              font-weight: bold;
              color: #1565c0;
          }
          .meio {
              flex: 1;
              display: flex;
              flex-direction: row;
              align-items: center;
              gap: 1.5mm;
              overflow: hidden;
          }
          .qr-area {
              flex-shrink: 0;
              width: 17mm;
              height: 17mm;
              display: flex;
              align-items: center;
              justify-content: center;
          }
          .qr-area img, .qr-area canvas {
              width: 17mm !important;
              height: 17mm !important;
          }
          .meio-info {
              flex: 1;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              gap: 0.5mm;
              overflow: hidden;
          }
          .descricao {
              font-size: 5.5pt;
              color: #222;
              font-weight: bold;
              line-height: 1.3;
              overflow: hidden;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              border-bottom: 0.5pt solid #eee;
              padding-bottom: 0.5mm;
          }
          .info-linha {
              font-size: 5pt;
              color: #333;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
          }
          .info-label {
              font-weight: bold;
              color: #1565c0;
          }
          .rodape {
              font-size: 4.5pt;
              color: #888;
              font-style: italic;
          }
          .rodape.usuario {
              margin-top: auto;
              padding-top: 1mm;
              border-top: 0.5pt solid #eee;
              font-weight: bold;
              color: #555;
          }
          .btn-imprimir {
              position: fixed;
              top: 8px;
              right: 8px;
              padding: 8px 16px;
              background: #1976d2;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 13px;
              box-shadow: 0 2px 5px rgba(0,0,0,0.3);
          }
          .btn-imprimir:hover { background: #1565c0; }
      </style>
    </head>
    <body>
      <button class="btn-imprimir no-print" onclick="window.print()">🖨️ Imprimir Etiqueta</button>
      ${etiquetasHtml}
      <script>
          const etiquetasData = ${JSON.stringify(etiquetas)};
          window.onload = function() {
              etiquetasData.forEach(dados => {
                  if (dados.idMovimento && document.getElementById('qr-' + dados.idMovimento)) {
                      new QRCode(document.getElementById('qr-' + dados.idMovimento), {
                          text: String(dados.idMovimento),
                          width: 64,
                          height: 64,
                          correctLevel: QRCode.CorrectLevel.L
                      });
                  }
              });
              window.focus();
          };
      <\/script>
    </body>
    </html>`;

      janelaEtiqueta.document.write(htmlEtiqueta40);
      janelaEtiqueta.document.close();
      setTimeout(() => { janelaEtiqueta.print(); }, 500);
    }
    window.selecionarEImprimirEtiqueta = selecionarEImprimirEtiqueta;
    window.gerarEtiqueta100x150 = gerarEtiqueta100x150;
    window.gerarEtiqueta40x30 = gerarEtiqueta40x30;
    window.__sgcEtiquetaPronta = true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
