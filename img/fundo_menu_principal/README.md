# Fundos do Menu Principal

## Como Funciona

O sistema de fundos do menu principal carrega **automaticamente** todas as imagens da pasta `img/fundo_menu_principal/` e as alterna a cada 30 segundos com transição suave.

## 🎨 Recomendações para Evitar Pixelização

### Resolução Ideal das Imagens
- **Mínimo**: 1920x1080 (Full HD)
- **Recomendado**: 2560x1440 (2K) ou superior
- **Para telas 4K**: 3840x2160
- **Aspect Ratio**: 16:9 (widescreen padrão)

### Formatos e Qualidade
1. **JPEG/JPG**: Fotos e imagens complexas
   - Qualidade: 85-95% na exportação
   - Tamanho ideal: 500KB - 2MB
   
2. **PNG**: Imagens com texto ou alta nitidez
   - Use quando precisar de transparência
   - Melhor para gráficos vetorizados
   
3. **WebP**: Melhor compressão com qualidade
   - 30% menor que JPEG com mesma qualidade
   - **Mais recomendado para web!**
   
4. **GIF**: ⚠️ Evite para fundos estáticos
   - Apenas 256 cores (causa pixelização)
   - Use só para animações simples

### Ferramentas para Otimização
- **TinyPNG** (https://tinypng.com) - Compressão inteligente
- **Squoosh** (https://squoosh.app) - Comparação visual antes/depois
- **CloudConvert** (https://cloudconvert.com) - Conversão para WebP

### Melhorias CSS Já Aplicadas ✅
O sistema aplica automaticamente:
- `image-rendering: crisp-edges` - Renderização nítida
- `filter: contrast(1.05) brightness(1.02)` - Melhora visual
- Aceleração por GPU para transições suaves

## Adicionar Novas Imagens

### 🎉 Fluxo Totalmente Automático

1. **Adicione suas imagens** na pasta `img/fundo_menu_principal/`
2. **Execute o script** para atualizar o index.json:
   ```powershell
   .\atualizar_fundos_menu.ps1
   ```
3. **Faça commit e push**:
   ```powershell
   git add img/fundo_menu_principal/index.json img/fundo_menu_principal/sua_nova_imagem.*
   git commit -m "feat: adiciona novas imagens de fundo"
   git push
   ```

**Pronto!** A API detecta automaticamente através do `index.json`. Não precisa editar nenhum código!

### O Que Mudou?
- ✅ API agora lê `index.json` dinamicamente
- ✅ Script atualiza apenas o JSON (não o código da API)
- ✅ Detecção 100% automática após deploy

## Formatos Suportados

- JPG / JPEG
- PNG
- GIF (incluindo animados)
- WEBP ⭐ (recomendado)

## Recursos

- ✅ Detecção automática de todas as imagens
- ✅ Ordem aleatória a cada carregamento
- ✅ Transição suave de 2 segundos
- ✅ Troca automática a cada 30 segundos
- ✅ Aplica apenas na área principal (sem afetar sidebar)
- ✅ Otimizações CSS para qualidade de imagem

## Estrutura

```
img/fundo_menu_principal/
├── index.json          # Lista de imagens (gerada automaticamente)
├── fundo_1.jpeg
├── fundo_2.jpeg
├── fundo_3.gif
└── ... (adicione mais aqui)
```
