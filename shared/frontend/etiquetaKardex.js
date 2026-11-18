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

    function ehInventario(dadosOuArray) {
      const lista = Array.isArray(dadosOuArray) ? dadosOuArray : [dadosOuArray];
      return lista.some((dados) => dados && dados.layout === 'inventario');
    }

    function selecionarEImprimirEtiqueta(dadosOuArray) {
      _pendingLabelData = dadosOuArray;
      const dica = document.querySelector('#btnEtiqueta100x150 small');
      if (dica) {
        dica.textContent = ehInventario(dadosOuArray)
          ? 'Etiqueta 100×150 com o título INVENTÁRIO 26/27'
          : 'Etiqueta completa com QR Code e código de barras';
      }
      document.getElementById('modalEtiqueta').style.display = 'flex';
    }

    document.getElementById('closeModalEtiqueta').addEventListener('click', () => {
      document.getElementById('modalEtiqueta').style.display = 'none';
      _pendingLabelData = null;
    });

    document.getElementById('btnEtiqueta100x150').addEventListener('click', () => {
      document.getElementById('modalEtiqueta').style.display = 'none';
      if (_pendingLabelData) {
        if (ehInventario(_pendingLabelData)) gerarEtiquetaInventario(_pendingLabelData);
        else gerarEtiqueta100x150(_pendingLabelData);
      }
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
              <div class="codigo-texto" style="font-size:${tamanhoCodigo(dados.codigo, false)}">${dados.codigo}</div>
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
              font-size: 56pt;
              font-weight: 900;
              letter-spacing: -0.03em;
              line-height: 0.9;
              color: #111;
              margin-top: 1mm;
              text-align: center;
              white-space: nowrap;
              max-width: 100%;
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

    function escEtq(valor) {
      return String(valor ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      }[c]));
    }

    function tamanhoCodigo(codigo, inventario) {
      const n = String(codigo || "").length;
      if (inventario) {
        if (n <= 6) return "72pt";
        if (n <= 8) return "56pt";
        if (n <= 10) return "42pt";
        return "32pt";
      }
      if (n <= 6) return "56pt";
      if (n <= 8) return "44pt";
      if (n <= 10) return "34pt";
      return "26pt";
    }

    function gerarEtiquetaInventario(dadosOuArray) {
      const etiquetas = Array.isArray(dadosOuArray) ? dadosOuArray : [dadosOuArray];
      if (etiquetas.length === 0) return;

      const janelaEtiqueta = window.open("", "_blank", "width=800,height=600");
      if (!janelaEtiqueta || typeof janelaEtiqueta.closed == "undefined" || janelaEtiqueta.closed) {
        alert("A janela de impressão foi bloqueada pelo navegador. Por favor, habilite os pop-ups para este site e tente reimprimir a etiqueta a partir do histórico.");
        return;
      }

      const etiquetasHtml = etiquetas.map((dados, indice) => {
        const titulo = escEtq(dados.titulo || "INVENTÁRIO 26/27");
        const idTxt = dados.idMovimento ? escEtq(dados.idMovimento) : "—";
        const qr = dados.idMovimento
          ? `<div id="qr-inv-${indice}" class="qr-area"></div>`
          : "";
        const armazem = dados.armazem ? String(dados.armazem).padStart(2, "0") : "-";
        return `
        <div class="etiqueta">
          <div class="header">
            <span class="id-badge">ID: ${idTxt}</span>
            <h1>${titulo}</h1>
          </div>
          <div class="descricao-bloco">
            <div class="descricao-label">DESCRIÇÃO DO PRODUTO:</div>
            <div class="descricao-text">${escEtq(dados.descricao || "N/A")}</div>
          </div>
          <div class="miolo">
            ${qr}
            <div class="codigo-texto" style="font-size:${tamanhoCodigo(dados.codigo, true)}">${escEtq(dados.codigo)}</div>
          </div>
          <div class="info">
            <div class="info-row">
              <span>QUANTIDADE:</span>
              <strong>${escEtq(dados.quantidade)}</strong>
            </div>
            <div class="info-row">
              <span>ENDEREÇO:</span>
              <strong>${escEtq(dados.endereco || "-")}</strong>
            </div>
            <div class="info-row">
              <span>ARMAZÉM:</span>
              <strong>${escEtq(armazem)}</strong>
            </div>
          </div>
          <div class="footer">
            <span>${escEtq(dados.dataHora || "")}</span>
            <strong>${escEtq(dados.usuario || "")} | KARDEX ${escEtq(dados.ano || "")}</strong>
          </div>
        </div>`;
      }).join("");

      const htmlEtiqueta = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Etiqueta - ${escEtq(etiquetas[0].codigo)}</title>
  <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"><\/script>
  <style>
    @media print {
      @page { size: 100mm 150mm; margin: 0; }
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        padding: 0 !important;
        background: white !important;
        display: block !important;
      }
      .no-print { display: none !important; }
      .etiqueta {
        page-break-after: always;
        margin: 0 !important;
        border: none !important;
      }
      .etiqueta:last-child { page-break-after: auto; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      background: #ccc;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 5mm;
      gap: 5mm;
    }
    .etiqueta {
      width: 100mm;
      height: 150mm;
      background: white;
      border: 1px dashed #999;
      padding: 4mm 4.5mm 3.5mm;
      display: flex;
      flex-direction: column;
      color: #111;
    }
    .header {
      min-height: 9mm;
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      column-gap: 2mm;
      border-bottom: 2px solid #111;
      padding-bottom: 1.5mm;
    }
    .id-badge {
      background: #111;
      color: #fff;
      border-radius: 8px;
      padding: 1.1mm 2.4mm;
      font-size: 9pt;
      font-weight: 700;
      letter-spacing: 0.2px;
    }
    .header h1 {
      text-align: center;
      font-size: 12.5pt;
      font-weight: 800;
      letter-spacing: 0.3px;
      color: #111;
      line-height: 1.05;
    }
    .descricao-bloco {
      text-align: center;
      padding: 2.5mm 1mm 1mm;
    }
    .descricao-label {
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.3px;
      color: #222;
      margin-bottom: 1mm;
    }
    .descricao-text {
      font-size: 12pt;
      font-weight: 800;
      line-height: 1.15;
      max-height: 2.5em;
      overflow: hidden;
    }
    .miolo {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 0;
      padding: 1mm 0 2mm;
    }
    .qr-area {
      width: 34mm;
      height: 34mm;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.5mm;
    }
    .qr-area img, .qr-area canvas {
      width: 34mm !important;
      height: 34mm !important;
    }
    .codigo-texto {
      font-weight: 900;
      letter-spacing: -0.04em;
      line-height: 0.85;
      text-align: center;
      width: 100%;
      white-space: nowrap;
    }
    .info { margin-top: auto; }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 3mm;
      font-size: 10.5pt;
      padding: 1.1mm 0;
      border-bottom: 0.6pt solid #d0d0d0;
    }
    .info-row span { font-weight: 800; }
    .info-row strong { font-weight: 700; text-align: right; }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 2mm;
      border-top: 2px solid #111;
      margin-top: 1.5mm;
      padding-top: 1.6mm;
      font-size: 7.5pt;
      color: #333;
    }
    .footer span { font-style: italic; }
    .footer strong { text-align: right; }
    .btn-imprimir {
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 10px 20px;
      background: #1976d2;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
      z-index: 1000;
    }
  </style>
</head>
<body>
  <button class="btn-imprimir no-print" onclick="window.print()">🖨️ Imprimir Etiqueta</button>
  ${etiquetasHtml}
  <script>
    const etiquetasData = ${JSON.stringify(etiquetas).replace(/</g, "\\u003c")};
    window.onload = function() {
      etiquetasData.forEach(function(dados, indice) {
        const alvo = document.getElementById('qr-inv-' + indice);
        if (dados.idMovimento && alvo) {
          new QRCode(alvo, {
            text: 'ID: ' + dados.idMovimento + ' | COD: ' + dados.codigo,
            width: 220,
            height: 220,
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
      setTimeout(() => { janelaEtiqueta.print(); }, 500);
    }

    window.selecionarEImprimirEtiqueta = selecionarEImprimirEtiqueta;
    window.gerarEtiqueta100x150 = gerarEtiqueta100x150;
    window.gerarEtiqueta40x30 = gerarEtiqueta40x30;
    window.gerarEtiquetaInventario = gerarEtiquetaInventario;
    window.__sgcEtiquetaPronta = true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
