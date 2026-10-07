document.addEventListener("DOMContentLoaded", () => {
  const TIPOS = {
    linha: { api: "linhas", titulo: "Linhas", max: 80 },
    marca: { api: "marcas", titulo: "Marcas", max: 60 },
    modelo: { api: "modelos", titulo: "Modelos", max: 80 },
  };
  const cfg = TIPOS[document.body.dataset.tipo];
  const titulo = document.getElementById("titulo");
  const nomeInput = document.getElementById("nome");
  const form = document.getElementById("formNovo");
  const lista = document.getElementById("lista");
  const statusMessage = document.getElementById("statusMessage");
  if (!cfg || !lista) return;

  document.title = `Cadastro de ${cfg.titulo} - SGC Customic`;
  titulo.textContent = cfg.titulo;
  nomeInput.maxLength = cfg.max;
  let itens = [];

  function aviso(texto, tipo) {
    statusMessage.textContent = texto;
    statusMessage.className = `status-message ${tipo}`;
    statusMessage.style.display = "block";
  }

  function escapar(valor) {
    return String(valor)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function desenhar() {
    if (!itens.length) {
      lista.innerHTML = "<p>Nenhum item cadastrado.</p>";
      return;
    }
    lista.innerHTML = `
      <table>
        <thead><tr><th>Nome</th><th style="width:180px;"></th></tr></thead>
        <tbody>
          ${itens.map((item) => `
            <tr data-id="${item.id}">
              <td><input type="text" value="${escapar(item.nome)}" maxlength="${cfg.max}" /></td>
              <td style="text-align:right; white-space:nowrap;">
                <button type="button" class="btn-texto" data-acao="salvar">Salvar</button>
                <button type="button" class="btn-texto perigo" data-acao="excluir">Excluir</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  async function api(acao, body) {
    const res = await fetch(`/api/shared/cadastros?tipo=${cfg.api}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Erro ao salvar.");
    return data;
  }

  async function carregar() {
    aviso("Carregando...", "info");
    const res = await fetch(`/api/shared/cadastros?tipo=${cfg.api}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Erro ao carregar.");
    itens = data.itens || [];
    desenhar();
    statusMessage.style.display = "none";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = nomeInput.value.trim();
    if (!nome) {
      aviso("Informe o nome.", "error");
      return;
    }
    try {
      await api("criar", { nome });
      nomeInput.value = "";
      await carregar();
      aviso("Cadastrado.", "success");
    } catch (err) {
      aviso(err.message, "error");
    }
  });

  lista.addEventListener("click", async (e) => {
    const botao = e.target.closest("button");
    const linha = e.target.closest("tr");
    if (!botao || !linha) return;
    const id = Number(linha.dataset.id);
    const nome = linha.querySelector("input").value.trim();
    try {
      if (botao.dataset.acao === "excluir") {
        if (!window.confirm("Excluir este item?")) return;
        await api("excluir", { id });
        await carregar();
        aviso("Excluído.", "success");
        return;
      }
      if (!nome) {
        aviso("Informe o nome.", "error");
        return;
      }
      await api("atualizar", { id, nome });
      await carregar();
      aviso("Salvo. Os produtos que usavam o nome antigo foram atualizados.", "success");
    } catch (err) {
      aviso(err.message, "error");
    }
  });

  carregar().catch((err) => aviso(err.message, "error"));
});
