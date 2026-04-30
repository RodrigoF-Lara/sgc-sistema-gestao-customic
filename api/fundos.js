// Lista de imagens disponíveis
// Atualize esta lista ao adicionar novas imagens na pasta img/fundo_menu_principal/
const IMAGENS_DISPONIVEIS = [
  'fundo_1.jpeg',
  'fundo_2.jpeg',
  'fundo_3.gif'
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({ 
    success: true, 
    imagens: IMAGENS_DISPONIVEIS,
    total: IMAGENS_DISPONIVEIS.length
  });
}
