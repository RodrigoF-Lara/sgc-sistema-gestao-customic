// Lista de imagens disponíveis na pasta img/fundo_menu_principal
// Atualize esta lista quando adicionar ou remover imagens
const imagensDisponiveis = [
  'fundo_1.jpeg',
  'fundo_2.jpeg',
  'fundo_3.gif'
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    return res.status(200).json({ 
      success: true, 
      imagens: imagensDisponiveis,
      total: imagensDisponiveis.length
    });
  } catch (error) {
    console.error('Erro ao listar fundos:', error);
    return res.status(500).json({ 
      error: 'Erro ao listar imagens',
      message: error.message 
    });
  }
}
