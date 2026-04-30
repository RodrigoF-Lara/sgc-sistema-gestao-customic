import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Lê o index.json da pasta de fundos
    const indexPath = path.join(process.cwd(), 'img', 'fundo_menu_principal', 'index.json');
    
    // Verifica se o arquivo existe
    if (!fs.existsSync(indexPath)) {
      return res.status(404).json({ 
        success: false, 
        error: 'index.json não encontrado',
        imagens: [],
        total: 0
      });
    }

    // Lê e parseia o JSON
    const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const imagens = indexData.imagens || [];

    return res.status(200).json({ 
      success: true, 
      imagens: imagens,
      total: imagens.length
    });
  } catch (error) {
    console.error('Erro ao ler fundos:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Erro ao carregar fundos',
      imagens: [],
      total: 0
    });
  }
}
