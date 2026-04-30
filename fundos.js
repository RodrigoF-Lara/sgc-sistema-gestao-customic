// Sistema de troca suave de fundos para todas as páginas
(function() {
  'use strict';
  
  document.addEventListener('DOMContentLoaded', async function() {
    console.log('🎨 Iniciando carregamento de fundos...');
    let fundosDisponiveis = [];
    
    try {
      // Buscar lista de imagens da API
      const response = await fetch('/api/fundos');
      const data = await response.json();
      
      if (data.success && data.imagens.length > 0) {
        fundosDisponiveis = data.imagens;
        console.log(`✓ Carregadas ${data.total} imagens de fundo:`, fundosDisponiveis);
      } else {
        throw new Error('Nenhuma imagem encontrada');
      }
    } catch (error) {
      console.warn('⚠️ Erro ao carregar fundos da API:', error);
      // Fallback: usar lista padrão
      fundosDisponiveis = ['fundo_1.png', 'fundo_2.png', 'fundo_3.png', 'fundo_4.png', 'fundo_5.png'];
      console.log('Usando lista padrão:', fundosDisponiveis);
    }
    
    // Embaralhar imagens para começar em ordem aleatória
    fundosDisponiveis.sort(() => Math.random() - 0.5);
    console.log('Ordem de exibição:', fundosDisponiveis);
    
    let indiceAtual = 0;
    let usandoBefore = true;
    const mainContent = document.querySelector('.main-content');
    
    if (!mainContent) {
      console.warn('⚠️ Elemento .main-content não encontrado - fundos não serão aplicados');
      return;
    }
    
    // Define as imagens iniciais via CSS inline
    const primeiraImagem = `/img/fundo_menu_principal/${fundosDisponiveis[0]}`;
    const segundaImagem = fundosDisponiveis.length > 1 
      ? `/img/fundo_menu_principal/${fundosDisponiveis[1]}` 
      : primeiraImagem;
    
    console.log('Primeira imagem:', primeiraImagem);
    console.log('Segunda imagem:', segundaImagem);
    
    // Cria o style com as imagens
    const style = document.createElement('style');
    style.textContent = `
      .main-content::before {
        background-image: url('${primeiraImagem}');
      }
      .main-content::after {
        background-image: url('${segundaImagem}');
      }
    `;
    document.head.appendChild(style);
    console.log('✓ CSS de fundo aplicado na .main-content');
    
    function trocarFundo() {
      // Próximo índice
      indiceAtual = (indiceAtual + 1) % fundosDisponiveis.length;
      const proximaImagem = `/img/fundo_menu_principal/${fundosDisponiveis[indiceAtual]}`;
      
      console.log(`🔄 Trocando para: ${proximaImagem}`);
      
      if (usandoBefore) {
        // Atualiza ::after e faz fade
        const novoStyle = document.createElement('style');
        novoStyle.textContent = `.main-content::after { background-image: url('${proximaImagem}'); }`;
        document.head.appendChild(novoStyle);
        mainContent.classList.add('fade-to-after');
      } else {
        // Atualiza ::before e remove fade
        const novoStyle = document.createElement('style');
        novoStyle.textContent = `.main-content::before { background-image: url('${proximaImagem}'); }`;
        document.head.appendChild(novoStyle);
        mainContent.classList.remove('fade-to-after');
      }
      
      usandoBefore = !usandoBefore;
    }
    
    // Troca a cada 30 segundos (só se houver mais de uma imagem)
    if (fundosDisponiveis.length > 1) {
      console.log(`✓ Troca automática ativada (${fundosDisponiveis.length} imagens, intervalo: 30s)`);
      setInterval(trocarFundo, 30000);
    } else {
      console.log('⚠️ Apenas 1 imagem, troca automática desativada');
    }
  });
})();
