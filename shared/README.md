# Camada Shared (Compartilhada)

> Código transversal usado por **todos os módulos** do SGC.
> Tudo aqui deve ser **estável, genérico e bem testado** — mudanças impactam o sistema inteiro.
>
> **Última atualização:** 10/07/2026

---

## Estrutura atual

| Pasta | Conteúdo |
|-------|----------|
| `frontend/` | `layout.js`, `menu-lateral.html`, `style.css`, `script.js`, `fundos.js` |
| `cadastros/` | `cadastros.html` + `cadastro{Usuarios,Fornecedores,Produtos}.{html,js}` |
| `config/` | `configuracoes.html`, `configNotificacoes.{html,js}` |

> O login (`index.html`) permanece na raiz por exigência do roteamento Vercel.

---

## Recursos do `frontend/`

- **Sidebar** ([menu-lateral.html](frontend/menu-lateral.html)) — 3 módulos top-level colapsáveis (Embalagens, Produção, Geral) com sub-acordeões aninhados.
- **layout.js** — carrega a sidebar via `fetch`, gerencia accordion, item ativo (incluindo páginas derivadas como `relatorioNecessidadeCompras.html`), notificações e botão hamburger com **comportamento dual**:
  - **Desktop (>768px):** alterna mini-sidebar (modo só ícones, 64px) com preferência persistida em `localStorage.sgcSidebarCollapsed`.
  - **Mobile (≤768px):** slide-out lateral com overlay, ESC e fecha-ao-clicar-link.
- **style.css** — variáveis CSS (`--cor-principal` etc.), regras globais, mini-sidebar desktop (`body.sidebar-collapsed`), responsividade mobile (`body.sidebar-open`), tabelas com scroll horizontal e filtros em coluna única no mobile.
- **fundos.js** — rotação de imagens de fundo configurável por `/api/shared/fundos`.
- **script.js** — utilitários compartilhados (ex: upload de CSV de requisição).

---

## Regras

1. **Sem dependência de módulos:** nada aqui pode importar de `modules/embalagem/` ou `modules/producao/`.
2. **API compartilhada:** endpoints transversais ficam em `api/shared/`.
3. **Mudanças com cuidado:** qualquer alteração aqui deve ser testada em todos os módulos consumidores.
4. **Versionamento:** documentar breaking changes em `CHANGELOG_SHARED.md` (a criar quando necessário).
