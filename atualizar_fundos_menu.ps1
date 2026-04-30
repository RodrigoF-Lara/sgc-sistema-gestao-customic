# Script para atualizar automaticamente a lista de imagens de fundo
# Executa: .\atualizar_fundos_menu.ps1

$pastaFundos = "img\fundo_menu_principal"
$arquivoEndpoint = "api\fundos.js"

Write-Output "🎨 Atualizando lista de fundos do menu..."

# Buscar todas as imagens na pasta
$imagens = Get-ChildItem -Path $pastaFundos -File | 
    Where-Object { $_.Extension -match '\.(jpg|jpeg|png|gif|webp)$' } |
    Select-Object -ExpandProperty Name |
    Sort-Object

if ($imagens.Count -eq 0) {
    Write-Warning "⚠️ Nenhuma imagem encontrada em $pastaFundos"
    exit 1
}

# Ler o arquivo do endpoint
$conteudoEndpoint = Get-Content -Path $arquivoEndpoint -Raw

# Criar a lista de imagens no formato JavaScript
$listaJS = $imagens | ForEach-Object { "  '$_'" }
$listaFormatada = $listaJS -join ",`n"

# Substituir a constante IMAGENS_DISPONIVEIS
$novoConteudo = $conteudoEndpoint -replace "(?s)(const IMAGENS_DISPONIVEIS = \[)[^\]]*(\];)", "`$1`n$listaFormatada`n`$2"

# Salvar arquivo atualizado
$novoConteudo | Out-File -FilePath $arquivoEndpoint -Encoding UTF8 -NoNewline -Force

Write-Output "✓ Endpoint atualizado: $arquivoEndpoint"
Write-Output "✓ Total de imagens: $($imagens.Count)"
Write-Output ""
Write-Output "Imagens encontradas:"
$imagens | ForEach-Object { Write-Output "  - $_" }
Write-Output ""
Write-Output "📌 Próximos passos:"
Write-Output "   git add $arquivoEndpoint"
Write-Output "   git commit -m 'chore: atualiza lista de fundos do menu'"
Write-Output "   git push"
