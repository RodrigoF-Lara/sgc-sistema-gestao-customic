const fs = require('fs');
const path = require('path');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Tenta ler o arquivo JSON com a lista de imagens
    const jsonPath = path.join(process.cwd(), 'img', 'fundo_menu_principal', 'index.json');
    
    if (fs.existsSync(jsonPath)) {
      const conteudo = fs.readFileSync(jsonPath, 'utf-8');
      const dados = JSON.parse(conteudo);
      
      return res.status(200).json({ 
        success: true, 
        imagens: dados.imagens,
        total: dados.imagens.length
      });
    }
    
    // Fallback se o JSON não existir
    return res.status(200).json({ 
      success: true, 
      imagens: ['fundo_1.jpeg', 'fundo_2.jpeg', 'fundo_3.gif'],
      total: 3
    });
  } catch (error) {
    console.error('Erro ao listar fundos:', error);
    return res.status(500).json({ 
      error: 'Erro ao listar imagens',
      message: error.message 
    });
  }
}
