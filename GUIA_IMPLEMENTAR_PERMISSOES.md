# Guia de Implementação — Sistema de Permissões de Acesso

Documento de referência para **replicar** o modelo de permissões usado no **Gestão PCP v2** em outro projeto.

Leia este arquivo inteiro antes de implementar. Ele descreve o **modelo mental**, o **banco**, o **helper**, as **APIs**, as **telas admin** e os **padrões de uso** em páginas/APIs.

---

## 1. Visão geral (o que o sistema faz)

O controle de acesso é baseado em **grupos (níveis)**, não em permissões por usuário individual.

```
Usuário ──tem──► nivel (ex: "operador", "pcp", "gestor")
                      │
                      ▼
              permissoes_menu
              (link_id + nivel + permitido)
                      │
                      ▼
              pode_acessar('filas-producao')  → true/false
```

**Fluxo resumido:**

1. Admin cria **grupos** (tabela `niveis_usuario`): administrador, gestor, pcp, operador, etc.
2. Admin atribui um **grupo** a cada usuário (`usuarios.nivel = 'pcp'`).
3. No login, o `nivel` vai para a **sessão** (`$_SESSION['nivel']`).
4. Admin marca na matriz **quem pode ver cada módulo / ação** (tabela `permissoes_menu`).
5. Em qualquer ponto do código, chama-se `pode_acessar('id-da-funcionalidade')`.
6. Menu e Home **escondem** o que o usuário não pode acessar.
7. Páginas e APIs **bloqueiam** de verdade (403), não só escondem o botão.

### Princípios de design (não quebrar)

| Regra | Comportamento |
|--------|----------------|
| **Admin sempre liberado** | Se `nivel === 'administrador'`, `pode_acessar()` retorna `true` sem consultar a tabela. |
| **Default = NEGADO** | Se não existir linha `(link_id, nivel)` ou `permitido = false` → sem acesso. |
| **Home sempre livre** | `link_id === 'home'` (e opcionalmente `'inicio'`) sempre liberado para logados. |
| **Mesma tabela para menu e ações** | Links do menu **e** ações especiais (ex: reordenar fila) usam `permissoes_menu.link_id`. |
| **Grupos dinâmicos** | Novos níveis entram via UI; a matriz de permissões e o select de usuários leem da tabela. |

---

## 2. Arquivos do sistema de origem (mapa)

Use como checklist do que copiar/adaptar:

```
# SQL
niveis_usuario.sql          → cria grupos
permissoes_menu.sql         → cria matriz de permissões

# Core
menu/permissoes_helper.php  → função pode_acessar() + cache em memória
menu/config.php             → catálogo de links do menu (fonte dos link_id)

# APIs
niveis_api.php              → CRUD de grupos (GET lista / POST create|update|delete)
permissoes_api.php          → GET matriz / POST upsert da matriz

# Telas admin (só administrador)
niveis.php                  → UI de grupos
permissoes.php              → UI matriz (checkbox por link × nível)

# Integração
login_auth.php              → grava $_SESSION['nivel'] no login
menu/menu_v2.php            → filtra links com pode_acessar()
home.php                    → cards só do que o usuário pode ver
usuarios_api.php + usuarios.js → campo nivel no cadastro de usuário
configuracoes.html          → atalhos para niveis.php e permissoes.php
```

---

## 3. Modelo de dados

### 3.1 Tabela `niveis_usuario` (grupos)

```sql
CREATE TABLE IF NOT EXISTS public.niveis_usuario (
    id              bigserial   PRIMARY KEY,
    codigo          text        NOT NULL UNIQUE,  -- 'administrador','gestor','pcp',...
    label           text        NOT NULL,         -- 'Administrador', 'Gestor',...
    ordem           integer     NOT NULL DEFAULT 100,
    protegido       boolean     NOT NULL DEFAULT false, -- true = não pode excluir
    dt_criacao      timestamptz NOT NULL DEFAULT now(),
    dt_atualizacao  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_niveis_usuario_codigo ON public.niveis_usuario (codigo);
CREATE INDEX IF NOT EXISTS idx_niveis_usuario_ordem  ON public.niveis_usuario (ordem);

-- Seed típico
INSERT INTO public.niveis_usuario (codigo, label, ordem, protegido) VALUES
    ('administrador', 'Administrador', 10, true),
    ('gestor',        'Gestor',        20, false),
    ('pcp',           'PCP',           30, false),
    ('lider',         'Líder',         40, false),
    ('operador',      'Operador',      50, false)
ON CONFLICT (codigo) DO NOTHING;
```

**Regras de negócio dos grupos:**

- `codigo`: só `a-z`, `0-9`, `_`; imutável depois de criado (é FK lógica em `usuarios.nivel` e `permissoes_menu.nivel`).
- `protegido = true` em `administrador`: API de delete bloqueia exclusão.
- Ao excluir um grupo: (1) não pode haver usuários com esse `nivel`; (2) apagar linhas em `permissoes_menu` com esse `nivel`; (3) apagar o grupo.

### 3.2 Tabela `permissoes_menu` (matriz)

```sql
CREATE TABLE IF NOT EXISTS public.permissoes_menu (
    id                 bigserial   PRIMARY KEY,
    link_id            text        NOT NULL,   -- id do módulo OU da ação especial
    nivel              text        NOT NULL,   -- codigo de niveis_usuario
    permitido          boolean     NOT NULL DEFAULT false,
    dt_atualizacao     timestamptz NOT NULL DEFAULT now(),
    usuario_atualizacao text,
    UNIQUE (link_id, nivel)
);

CREATE INDEX IF NOT EXISTS idx_perm_nivel ON public.permissoes_menu (nivel);
CREATE INDEX IF NOT EXISTS idx_perm_link  ON public.permissoes_menu (link_id);
```

**Chave de negócio:** par `(link_id, nivel)`. Upsert sempre por essa chave.

### 3.3 Campo no usuário

Na tabela de usuários:

```text
usuarios.nivel  text  -- deve bater com niveis_usuario.codigo
```

Exemplo de valores: `administrador`, `gestor`, `pcp`, `operador`.

Não há FK formal no SQL original (texto livre), mas a UI só oferece códigos existentes.

### 3.4 Catálogo de `link_id` (de onde vêm)

Há **duas fontes**:

#### A) Links de menu (`menu/config.php`)

Cada item do menu tem um `id` estável:

```php
[
    'id'         => 'filas-producao',   // ← este é o link_id
    'url'        => 'index.php',
    'label'      => 'Filas Prod. Acabado',
    'icon'       => 'clipboard-list',
    'section'    => 'producao',
    'menu_ativo' => 'filas',
    'badge'      => null,
    // 'admin_only' => true  // opcional (visual; permissão real é a tabela)
],
```

A tela `permissoes.php` **lê** esse array e monta as linhas da matriz.

#### B) Ações especiais (hardcoded em `permissoes.php`)

Não aparecem no menu, mas usam a mesma tabela:

```php
$acoes_especiais = [
    [
        'id'    => 'aps-reordenar',
        'label' => 'Reordenar filas (APS + Fila Produção)',
        'desc'  => 'Arrastar ordens para mudar a sequência...',
        'icon'  => 'chart-line',
    ],
    [
        'id'    => 'aps-alterar-recurso',
        'label' => 'Alterar recurso da OF...',
        // ...
    ],
    [
        'id'    => 'rancho-editar-dados',
        'label' => 'Fila Rancho: editar dados operacionais',
        // ...
    ],
    [
        'id'    => 'funil-ver-todos',
        'label' => 'Funil Comercial: ver leads de todos os responsáveis',
        // ...
    ],
];
```

**Convenção de nomenclatura de `link_id`:**

- kebab-case: `filas-producao`, `funil-comercial`, `aps-reordenar`
- Estável no tempo (nunca renomear sem migração de dados)
- Um id = uma capacidade checável no código

---

## 4. Sessão e autenticação

### 4.1 Login grava o nível

No login bem-sucedido:

```php
$_SESSION['usuario_id']    = $user['id'];
$_SESSION['usuario']       = $user['usuario'];
$_SESSION['codigo_focco']  = $user['codigo_focco'] ?? '';
$_SESSION['nome_completo'] = $user['nome_completo'] ?? '';
$_SESSION['nivel']         = $user['nivel'] ?? 'usuario'; // fallback se vazio
```

Sem `$_SESSION['nivel']` correto, o helper cai no default e **nega** tudo (exceto admin/home).

### 4.2 Guards de página

Dois padrões no projeto:

| Arquivo | Uso |
|---------|-----|
| `auth_guard.php` | Páginas HTML: se não logado → redirect para `login.html` |
| `check_session.php` | APIs / páginas que esperam JSON: se não logado → JSON 401 |

Nenhum dos dois sozinho verifica **permissão de módulo**. Isso é feito com `pode_acessar()` depois.

### 4.3 SessionStorage no front (menu JS)

Além da sessão PHP, o login grava no browser (para o menu exibir nome etc.):

```js
sessionStorage.setItem('usuario', ...);
sessionStorage.setItem('nome_completo', ...);
sessionStorage.setItem('codigo_focco', ...);
sessionStorage.setItem('nivel', nivel); // 'administrador' | outro
sessionStorage.setItem('logado', 'true');
```

**Importante:** a decisão de acesso real deve ser **sempre no PHP/API**, não só no JS.

---

## 5. Helper central — `pode_acessar()`

Arquivo de referência: `menu/permissoes_helper.php`

### 5.1 Implementação de referência

```php
<?php
/**
 * Helper de Permissões
 *
 * Uso:
 *   require_once __DIR__.'/menu/permissoes_helper.php';
 *   if (!pode_acessar('filas-producao')) { ... }
 *
 * Regras:
 *  - 'administrador' SEMPRE tem acesso total (ignora tabela)
 *  - Se a tabela não tiver registro para (link,nivel), o padrão é NEGADO
 *  - Exceção: 'home' sempre liberado (tela inicial)
 */

function _carregar_permissoes_cache() {
    static $cache = null;
    if ($cache !== null) return $cache;

    $cache = [];
    try {
        // Adapte para o client de DB do projeto alvo (Supabase, PDO, etc.)
        require_once __DIR__ . '/../SupabaseClient.php';
        $supa = new SupabaseClient();
        $rows = $supa->select('permissoes_menu', 'select=link_id,nivel,permitido');
        foreach ($rows ?: [] as $r) {
            $cache[$r['link_id']][$r['nivel']] = (bool)$r['permitido'];
        }
    } catch (Exception $e) {
        // Falha silenciosa: cache vazio = tudo negado (exceto admin/home)
    }
    return $cache;
}

function pode_acessar($link_id, $nivel = null) {
    if ($nivel === null) {
        $nivel = $_SESSION['nivel'] ?? 'usuario';
    }
    // Admin libera tudo
    if ($nivel === 'administrador') return true;
    // Home sempre livre
    if ($link_id === 'home') return true;

    $perm = _carregar_permissoes_cache();
    return !empty($perm[$link_id][$nivel]);
}
```

### 5.2 Detalhes importantes

1. **Cache estático por request** — carrega a tabela uma vez por request PHP (`static $cache`). Bom para menu com dezenas de links.
2. **Falha de DB = negado** — se a tabela não existir ou a API cair, só admin passa. Fail-closed.
3. **Não grava em arquivo** — cache é só em memória do processo da requisição.
4. **Admin hardcoded** — o código especial `administrador` é a única bypass. Não depende de linhas na tabela para o admin.

### 5.3 Onde chamar

| Camada | Exemplo |
|--------|---------|
| Render do menu | `if (!pode_acessar($link['id'], $nivel)) continue;` |
| Home / hub de cards | Idem |
| Entrada de página sensível | `if (!pode_acessar('mes-manutencao-apontamentos')) { 403; exit; }` |
| Endpoint de mutação | `if (!pode_acessar('aps-reordenar')) { 403 JSON; exit; }` |
| Feature flag na UI | `$podeReordenar = pode_acessar('aps-reordenar');` → esconde botão drag |

**Regra de ouro:** esconder no UI **e** validar de novo na API. Nunca confiar só no front.

---

## 6. Integração no menu

Em `menu/menu_v2.php` (ou equivalente):

```php
require_once __DIR__ . '/permissoes_helper.php';

if (session_status() === PHP_SESSION_NONE) { @session_start(); }
$nivel_usuario = $_SESSION['nivel'] ?? 'usuario';

$linksBySection = [];
foreach ($config['links'] as $link) {
    if (!pode_acessar($link['id'], $nivel_usuario)) continue;
    $linksBySection[$link['section']][] = $link;
}
// Renderiza só seções que ainda têm links
```

Efeito: o usuário **nem vê** módulos bloqueados. Se digitar a URL direto, a página ainda deve checar (quando a funcionalidade for sensível).

Sobre `admin_only` no config: no projeto original é **marcação visual** no CSS. O filtro real é `pode_acessar`. Ainda assim, na prática só se libera `permissoes` / `niveis` / `usuarios` para admin (ou se marca na matriz).

---

## 7. APIs

### 7.1 `permissoes_api.php`

| Método | Quem | Comportamento |
|--------|------|----------------|
| `GET` | Qualquer autenticado | Retorna matriz `{ link_id: { nivel: bool } }` |
| `POST` | Só `administrador` | Body `{ permissoes: [{link_id, nivel, permitido}, ...] }` → upsert |

Pseudocódigo POST:

```php
// 1) session + nivel === administrador
// 2) decode JSON
// 3) montar payload:
//    link_id, nivel, permitido, dt_atualizacao, usuario_atualizacao
// 4) upsert em permissoes_menu com on_conflict = 'link_id,nivel'
// 5) responder { success: true, gravados: N }
```

Resposta GET:

```json
{
  "success": true,
  "data": {
    "filas-producao": { "gestor": true, "pcp": true, "operador": false },
    "aps-reordenar": { "pcp": true, "operador": false }
  }
}
```

### 7.2 `niveis_api.php`

| Método | Quem | Comportamento |
|--------|------|----------------|
| `GET` | Autenticado | Lista níveis ordenados |
| `POST` action=`create` | Admin | Cria nível (codigo + label + ordem) |
| `POST` action=`update` | Admin | Atualiza label/ordem (não muda codigo) |
| `POST` action=`delete` | Admin | Bloqueia se protegido ou se há usuários; limpa permissões |

Sanitização do código:

```php
$codigoSan = preg_replace('/[^a-z0-9_]/', '', strtolower(trim($codigo)));
```

---

## 8. Telas administrativas

### 8.1 Grupos (`niveis.php`)

- Protegida: `$_SESSION['nivel'] !== 'administrador'` → 403 HTML.
- Form: código, nome, ordem.
- Lista com Editar / Excluir (excluir oculto se `protegido`).
- Consome `niveis_api.php`.

### 8.2 Matriz de permissões (`permissoes.php`)

- Protegida: só administrador.
- Colunas = níveis de `niveis_usuario` (fallback hardcoded se a tabela falhar).
- Linhas = links de `menu/config.php` agrupados por seção + bloco **Ações Especiais**.
- Coluna Administrador: checkboxes **sempre marcados e disabled** (só visual; acesso real é no helper).
- GET carrega estado; POST salva **todos** os checkboxes (não só os alterados).
- Chips “Liberar tudo / Bloquear tudo” por nível (exceto admin).
- Avisa `beforeunload` se houver alterações não salvas.

### 8.3 Cadastro de usuários

No select de nível, **não hardcodar** a lista: carregar de `niveis_api.php` (GET).

```js
const resp = await fetch('niveis_api.php');
// popular <select id="nivel">
```

Ao criar/editar usuário, gravar `nivel` com o `codigo` do grupo.

---

## 9. Padrões de uso no código (copiar estes)

### 9.1 Bloquear página inteira

```php
require_once __DIR__ . '/auth_guard.php'; // ou check_session.php
require_once __DIR__ . '/menu/permissoes_helper.php';

if (!pode_acessar('mes-manutencao-apontamentos')) {
    http_response_code(403);
    echo '<h1>Acesso negado</h1>';
    exit;
}
```

### 9.2 Feature flag na página (mostrar/ocultar UI)

```php
require_once __DIR__ . '/menu/permissoes_helper.php';

$podeReordenar       = pode_acessar('aps-reordenar');
$podeAlterarRecurso  = pode_acessar('aps-alterar-recurso');
$podeEditarDados     = pode_acessar('rancho-editar-dados');
```

No HTML/JS:

```php
<?php if ($podeReordenar): ?>
  <!-- botões de drag / reordenar -->
<?php endif; ?>
```

E no JS embutido:

```php
const PODE_REORDENAR = <?= $podeReordenar ? 'true' : 'false' ?>;
```

### 9.3 Bloquear API de escrita

```php
session_start();
require_once __DIR__ . '/menu/permissoes_helper.php';

if (empty($_SESSION['usuario'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Sessão expirada.']);
    exit;
}
if (!pode_acessar('aps-reordenar')) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Sem permissão para reordenar.']);
    exit;
}
// ... lógica da operação
```

### 9.4 Escopo de dados (permissão “ver todos”)

Exemplo do funil comercial: sem `funil-ver-todos`, o usuário só vê leads em que é responsável.

```php
$podeVerTodos = pode_acessar('funil-ver-todos', $nivelUsuario);

// Na query:
if (!$podeVerTodos) {
    // filtrar por responsavel_id = usuario logado
}
```

Isso é **autorização em cima do dado**, não só de tela.

### 9.5 Seed ao criar um módulo novo

Ao adicionar um módulo, além do item em `config.php`:

```sql
INSERT INTO public.permissoes_menu (link_id, nivel, permitido)
VALUES
    ('solicitacao-producao', 'gestor',  true),
    ('solicitacao-producao', 'pcp',     true),
    ('solicitacao-producao', 'lider',   true),
    ('solicitacao-producao', 'operador',true)
ON CONFLICT (link_id, nivel) DO UPDATE
SET permitido = EXCLUDED.permitido,
    dt_atualizacao = now();
```

Admin não precisa de linha (bypass no código). Seed é opcional; sem seed o default continua **negado** até marcar na UI.

---

## 10. Como adicionar um módulo novo (checklist)

1. **Definir `link_id`** estável (ex: `meu-modulo`).
2. **Registrar no catálogo de menu** (`config.php` ou equivalente) com esse `id`.
3. Se for **ação**, não for menu: adicionar em `$acoes_especiais` na tela de permissões.
4. **Na página:** `require` do helper + opcionalmente bloquear com `pode_acessar('meu-modulo')`.
5. **Nas APIs mutáveis:** mesma checagem.
6. **(Opcional) seed SQL** liberando níveis iniciais.
7. **Admin abre** `permissoes.php`, marca os grupos e salva.
8. Testar com usuário não-admin de cada grupo.

---

## 11. Como adicionar um grupo novo

1. Admin em `niveis.php` cria (ex: codigo `qualidade`, label `Qualidade`).
2. A coluna aparece automaticamente em `permissoes.php` (lê a tabela).
3. Admin marca o que o grupo pode acessar e salva.
4. Em `usuarios`, atribui usuários ao novo nível.
5. No próximo login, a sessão já carrega o novo `nivel`.

---

## 12. Arquitetura em camadas (resumo visual)

```
┌─────────────────────────────────────────────────────────────┐
│  ADMIN UI                                                   │
│  niveis.php  ──► niveis_api.php  ──► niveis_usuario         │
│  permissoes.php ──► permissoes_api.php ──► permissoes_menu  │
│  usuarios.*  ──► usuarios.nivel = codigo do grupo           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  LOGIN                                                      │
│  valida usuario/senha → $_SESSION['nivel'] = usuarios.nivel │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  RUNTIME                                                    │
│  permissoes_helper.pode_acessar(link_id)                    │
│       │                                                     │
│       ├─ menu_v2.php  → esconde links                       │
│       ├─ home.php     → esconde cards                       │
│       ├─ páginas      → 403 se sem acesso                   │
│       └─ APIs         → 403 se sem permissão de ação        │
└─────────────────────────────────────────────────────────────┘
```

---

## 13. O que NÃO é este sistema

Para não implementar errado no projeto alvo:

- **Não é RBAC com roles aninhados / herança** — cada nível é independente; não herda de outro.
- **Não é permissão por usuário** — só por grupo. Para exceção individual, ou cria um grupo, ou estende o modelo.
- **Não é ACL por recurso de negócio** (ex: “só recurso TORNO-01”) — isso seria outro mecanismo.
- **Não substitui autenticação** — só autoriza o que o logado pode fazer.
- **Não criptografa senha no projeto original** — ao portar, melhore (hash bcrypt); isso é ortogonal a permissões.

---

## 14. Plano de implementação no projeto alvo

Ordem sugerida:

### Fase 1 — Fundação
1. Criar tabelas `niveis_usuario` e `permissoes_menu` (SQL acima).
2. Garantir coluna `usuarios.nivel` (ou equivalente).
3. Seed dos grupos padrão com `administrador` protegido.
4. No login, gravar `nivel` na sessão.

### Fase 2 — Helper
5. Implementar `permissoes_helper.php` com `pode_acessar()` e cache.
6. Adaptar o acesso a dados (PDO, Eloquent, Supabase, etc.) sem mudar as regras.

### Fase 3 — Catálogo + Menu
7. Ter um catálogo central de módulos com `id` estável (como `config.php`).
8. Filtrar menu/home com `pode_acessar`.

### Fase 4 — Admin
9. API + tela de grupos.
10. API + tela de matriz de permissões (links do catálogo + ações especiais).
11. Cadastro de usuário com select dinâmico de níveis.
12. Proteger as telas admin com `nivel === 'administrador'`.

### Fase 5 — Endereçar features
13. Em cada módulo sensível: checagem de página + API.
14. Ações finas (reordenar, editar, ver todos): `link_id` de ação especial.

### Fase 6 — Validação
15. Login como operador sem permissões → só Home.
16. Liberar um módulo na matriz → aparece no menu e abre.
17. Tentar POST de ação sem permissão → 403.
18. Login como administrador → tudo liberado mesmo sem linhas na tabela.

---

## 15. Contratos JSON (para copiar na implementação)

### GET `niveis_api.php`

```json
{
  "success": true,
  "data": [
    { "id": 1, "codigo": "administrador", "label": "Administrador", "ordem": 10, "protegido": true },
    { "id": 2, "codigo": "operador", "label": "Operador", "ordem": 50, "protegido": false }
  ]
}
```

### POST `niveis_api.php` (create)

```json
{ "action": "create", "codigo": "qualidade", "label": "Qualidade", "ordem": 60 }
```

### POST `niveis_api.php` (update)

```json
{ "action": "update", "id": 5, "label": "Qualidade Total", "ordem": 55 }
```

### POST `niveis_api.php` (delete)

```json
{ "action": "delete", "id": 5 }
```

### GET `permissoes_api.php`

```json
{
  "success": true,
  "data": {
    "home": { "operador": true },
    "filas-producao": { "operador": true, "pcp": true }
  }
}
```

### POST `permissoes_api.php`

```json
{
  "permissoes": [
    { "link_id": "filas-producao", "nivel": "operador", "permitido": true },
    { "link_id": "filas-producao", "nivel": "pcp", "permitido": true },
    { "link_id": "aps-reordenar", "nivel": "operador", "permitido": false }
  ]
}
```

Resposta:

```json
{ "success": true, "gravados": 3 }
```

---

## 16. Exemplos reais de `link_id` no projeto origem

### Menu (amostra)

| link_id | Uso |
|---------|-----|
| `home` | Início (sempre livre) |
| `filas-producao` | Filas de produção |
| `fila-aps` | Fila APS |
| `fila-producao` | Fila produção (tablet) |
| `funil-comercial` | Funil de clientes |
| `usuarios` | Gerenciar usuários |
| `niveis` | Grupos de usuários |
| `permissoes` | Matriz de permissões |
| `mes-manutencao-apontamentos` | Manutenção de apontamentos MES |

### Ações especiais (amostra)

| link_id | Efeito no código |
|---------|------------------|
| `aps-reordenar` | Drag/reorder de fila + APIs `mover-para-posicao`, setups, turnos, etc. |
| `aps-alterar-recurso` | Mover OF para outro recurso |
| `rancho-editar-dados` | Editar campos operacionais do rancho |
| `funil-ver-todos` | Ver leads de todos os responsáveis |

---

## 17. Adaptação se o stack for diferente

| Origem (PCP) | No projeto alvo, troque por |
|--------------|----------------------------|
| PHP session | JWT claim `nivel`, session Laravel, cookie, etc. — desde que o helper leia o nível |
| Supabase REST | PDO/MySQL, Prisma, Django ORM… mantendo as mesmas colunas |
| `menu/config.php` | Qualquer catálogo central (YAML, tabela `modulos`, router config) |
| Páginas PHP | Middleware de rota (`can:filas-producao`) que chama a mesma lógica |
| Tela matriz em PHP+JS vanilla | React/Vue admin — o **contrato da API** permanece |

O que deve permanecer **idêntico no espírito**:

1. Grupos dinâmicos + matriz `(recurso, grupo, permitido)`
2. Default deny
3. Super-role bypass (admin)
4. Helper único de decisão
5. Validação server-side em toda mutação

---

## 18. Prompt sugerido para o implementador (outro projeto)

Cole algo assim no outro repositório, junto com este arquivo:

> Implemente o sistema de permissões descrito em `GUIA_IMPLEMENTAR_PERMISSOES.md`.
>
> Requisitos:
> 1. Tabelas `niveis_usuario` e `permissoes_menu` (ou equivalentes no DB do projeto).
> 2. Campo de grupo no usuário e gravação no login/sessão.
> 3. Helper `pode_acessar(link_id)` com: admin total, home livre, default deny, cache por request.
> 4. Filtrar o menu pelos módulos permitidos.
> 5. Telas admin (só admin): CRUD de grupos + matriz de permissões (módulos + ações especiais).
> 6. APIs REST com os contratos JSON da seção 15.
> 7. Em módulos sensíveis e APIs de escrita, chamar `pode_acessar` e retornar 403 se negado.
> 8. Não inventar RBAC por usuário individual; seguir o modelo por grupo.
>
> Adapte ao stack deste repositório, mas preserve as regras de negócio.

---

## 19. Checklist final de aceite

- [ ] Admin vê todos os itens do menu sem precisar de linhas na tabela
- [ ] Usuário sem nenhuma permissão só acessa Home (e login/logout)
- [ ] Marcar um checkbox e salvar libera o módulo no menu na próxima carga
- [ ] Desmarcar bloqueia de novo (default deny)
- [ ] API de mutação sem permissão de ação retorna 403
- [ ] Criar grupo novo reflete na matriz e no cadastro de usuários
- [ ] Excluir grupo com usuários ativos é bloqueado
- [ ] Excluir grupo limpa `permissoes_menu` daquele nível
- [ ] `administrador` não pode ser excluído (protegido)
- [ ] Ação especial (sem item de menu) aparece na matriz e controla botão/API

---

*Documento gerado a partir do código do Gestão PCP v2 (`permissoes_helper.php`, `permissoes.php`, `permissoes_api.php`, `niveis.php`, `niveis_api.php`, `permissoes_menu.sql`, `niveis_usuario.sql`, `menu/menu_v2.php`, `login_auth.php` e usos em APS/Funil/Home).*
