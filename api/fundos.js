const fs = require('fs');
const path = require('path');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Caminho para a pasta de fundos do menu principal
    const fundosPath = path.join(process.cwd(), 'img', 'fundo_menu_principal');
    
    // Ler todos os arquivos da pasta
    const arquivos = fs.readdirSync(fundosPath);
    
    // Filtrar apenas imagens (jpg, jpeg, png, gif, webp)
    const imagens = arquivos.filter(arquivo => {
      const ext = path.extname(arquivo).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    });
    
    return res.status(200).json({ 
      success: true, 
      imagens: imagens,
      total: imagens.length
    });
  } catch (error) {
    console.error('Erro ao listar fundos:', error);
    return res.status(500).json({ 
      error: 'Erro ao listar imagens',
      message: error.message 
    });
  }
}
