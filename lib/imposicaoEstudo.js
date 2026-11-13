// Imposição de estudo: retângulos alinhados na folha de máquina.
// Sem pinça, sem entre-corte e sem sangria. Não é imposição de produção.
// LARGURA mantém a faca: a largura dela fica na largura da máquina.
// ALTURA gira 90°: a altura da faca fica na largura da máquina.
// Sem fibra, fica a rotação em que cabem mais poses. Empate mantém sem girar.

const FIBRAS = new Set(["LARGURA", "ALTURA"]);

function grade(pecaL, pecaA, maqL, maqA) {
  if (!(pecaL > 0) || !(pecaA > 0) || !(maqL > 0) || !(maqA > 0)) {
    return { colunas: 0, linhas: 0, poses: 0 };
  }
  const colunas = Math.floor(maqL / pecaL);
  const linhas = Math.floor(maqA / pecaA);
  if (colunas < 1 || linhas < 1) return { colunas: 0, linhas: 0, poses: 0 };
  return { colunas, linhas, poses: colunas * linhas };
}

export function imposicaoEstudo(folhaLargura, folhaAltura, maquinaLargura, maquinaAltura, fibra) {
  const fl = Number(folhaLargura);
  const fa = Number(folhaAltura);
  const ml = Number(maquinaLargura);
  const ma = Number(maquinaAltura);
  const fibraNorm = fibra == null || String(fibra).trim() === "" ? null : String(fibra).trim().toUpperCase();
  if (fibraNorm && !FIBRAS.has(fibraNorm)) return { erro: "Sentido de fibra inválido." };
  if (![ml, ma].every((n) => Number.isFinite(n) && n > 0)) {
    return {
      informada: false,
      fibra: fibraNorm,
      poses: null,
      colunas: 0,
      linhas: 0,
      giro: false,
      motivos: ["Falta o formato de máquina. As poses continuam as digitadas."],
    };
  }
  const normal = grade(fl, fa, ml, ma);
  const girada = grade(fa, fl, ml, ma);
  let escolhida;
  if (fibraNorm === "ALTURA") escolhida = { ...girada, giro: true };
  else if (fibraNorm === "LARGURA") escolhida = { ...normal, giro: false };
  else escolhida = normal.poses >= girada.poses ? { ...normal, giro: false } : { ...girada, giro: true };
  const motivos = [];
  if (!fibraNorm) motivos.push("Falta o sentido de fibra. A rotação ficou a que cabe mais poses.");
  if (escolhida.poses < 1) motivos.push("A faca não cabe nesse formato de máquina, na rotação permitida.");
  return {
    informada: true,
    fibra: fibraNorm,
    poses: escolhida.poses >= 1 ? escolhida.poses : null,
    colunas: escolhida.colunas,
    linhas: escolhida.linhas,
    giro: escolhida.giro,
    pecaLargura: escolhida.giro ? fa : fl,
    pecaAltura: escolhida.giro ? fl : fa,
    maquinaLargura: ml,
    maquinaAltura: ma,
    motivos,
  };
}
