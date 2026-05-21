# Camada Shared (Compartilhada)

> Código transversal usado por **todos os módulos** do SGC.
> Tudo aqui deve ser **estável, genérico e bem testado** — mudanças impactam o sistema inteiro.

---

## Subpastas Planejadas

| Pasta | Conteúdo |
|-------|----------|
| `frontend/` | `layout.js`, `menu-lateral.html`, `style.css`, `script.js`, `fundos.js`, futuros utils |
| `auth/` | `index.html` (login) |
| `cadastros/` | Telas de cadastro de usuários, fornecedores e produtos |
| `config/` | Configurações globais (notificações, etc.) |

> Os arquivos físicos serão movidos para cá na **Fase 2** do roadmap em
> [ARCHITECTURE.md](../ARCHITECTURE.md#8-roadmap-de-refatoração).

---

## Regras

1. **Sem dependência de módulos:** nada aqui pode importar de `modules/embalagem/` ou `modules/producao/`.
2. **API compartilhada:** endpoints transversais ficam em `api/shared/`.
3. **Mudanças com cuidado:** qualquer alteração aqui deve ser testada em todos os módulos consumidores.
4. **Versionamento:** documentar breaking changes em `CHANGELOG_SHARED.md` (a criar quando necessário).
