# Fundos do Menu Principal

## Como Funciona

O sistema de fundos do menu principal carrega **automaticamente** todas as imagens da pasta `img/fundo_menu_principal/` e as alterna a cada 30 segundos com transição suave.

## Adicionar Novas Imagens

### Opção 1: Automática (Recomendado)

1. Adicione suas imagens na pasta `img/fundo_menu_principal/`
2. Execute o script PowerShell:
   ```powershell
   .\atualizar_fundos_menu.ps1
   ```
3. Faça commit e push:
   ```powershell
   git add img/fundo_menu_principal/index.json
   git commit -m "chore: atualiza lista de fundos do menu"
   git push
   ```

### Opção 2: Manual

1. Adicione suas imagens na pasta `img/fundo_menu_principal/`
2. Edite o arquivo `img/fundo_menu_principal/index.json` manualmente
3. Faça commit e push

## Formatos Suportados

- JPG / JPEG
- PNG
- GIF (incluindo animados)
- WEBP

## Recursos

- ✅ Detecção automática de todas as imagens
- ✅ Ordem aleatória a cada carregamento
- ✅ Transição suave de 2 segundos
- ✅ Troca automática a cada 30 segundos
- ✅ Aplica apenas na área principal (sem afetar sidebar)

## Estrutura

```
img/fundo_menu_principal/
├── index.json          # Lista de imagens (gerada automaticamente)
├── fundo_1.jpeg
├── fundo_2.jpeg
├── fundo_3.gif
└── ... (adicione mais aqui)
```
