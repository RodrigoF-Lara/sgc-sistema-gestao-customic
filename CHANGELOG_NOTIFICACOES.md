# Sistema de Notificações - Migração para Banco de Dados

## O Problema
O sistema de notificações estava usando `localStorage` do navegador, fazendo com que cada usuário só conseguisse ver as próprias notificações.

## A Solução
Migração para armazenamento centralizado no SQL Server, permitindo que notificações sejam compartilhadas entre todos os usuários.

## Arquivos Criados/Modificados

### 1. `SQL_Scripts/create_notificacoes_table.sql`
Script SQL para criar a tabela `TB_NOTIFICACOES` com:
- Armazenamento centralizado de notificações
- Suporte para notificações globais (todos veem) ou direcionadas
- Rastreamento de leitura por usuário
- Índices para performance

### 2. `api/notificacoes.js`
Nova API REST com endpoints:
- **GET** `/api/notificacoes?usuario=<nome>&limite=<num>` - Buscar notificações
- **POST** `/api/notificacoes` - Criar nova notificação
- **PUT** `/api/notificacoes` - Atualizar (marcar lida, limpar)

### 3. `layout.js`
Sistema de notificações atualizado para:
- Buscar notificações do servidor via API
- Polling automático a cada 10 segundos
- Manter compatibilidade com código existente
- Sincronização em tempo real entre usuários

## Como Implementar

### Passo 1: Executar o Script SQL
Execute o script para criar a tabela no banco de dados:

```sql
-- No SQL Server Management Studio ou ferramenta similar
-- Execute o arquivo: SQL_Scripts/create_notificacoes_table.sql
```

### Passo 2: Deploy da API
O arquivo `api/notificacoes.js` já está pronto e será automaticamente disponibilizado no deploy do Vercel.

### Passo 3: Teste
1. Faça login com dois usuários diferentes em navegadores/abas separadas
2. Execute uma ação que gera notificação (ex: criar requisição, finalizar NF)
3. Verifique se ambos os usuários recebem a notificação
4. O ícone de sino deve atualizar automaticamente para ambos

## Funcionalidades

### Notificações Globais
Todas as notificações criadas são globais por padrão (visíveis para todos):
- Requisição criada/finalizada
- Inventário criado/finalizado  
- NF lançada/armazenada

### Sincronização Automática
- Polling a cada 10 segundos atualiza notificações
- Badge de não lidas atualiza automaticamente
- Toast aparece imediatamente ao criar notificação

### Controle de Leitura
- Cada usuário pode marcar suas notificações como lidas
- Limpar notificações afeta apenas o usuário atual
- Rastreamento individual de quem leu cada notificação

## Compatibilidade
O código existente que usa `SGCNotifications.add()` continua funcionando sem alterações. Exemplos em:
- `script.js` (requisições)
- `detalhes.js` (finalizar requisição)
- `inventarioCiclico.js` (inventário)
- `lancamentoNF.js` (NF)
- `statusNF-page.js` (armazenamento)

## Observações Técnicas
- A função `add()` agora é assíncrona mas mantém compatibilidade com chamadas síncronas
- Cache local evita consultas desnecessárias ao servidor
- Tratamento de erros mantém funcionamento mesmo se API falhar
- Sistema de polling para quando usuário faz logout
