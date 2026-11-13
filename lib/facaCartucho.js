// Cartucho tuck-end simplificado, em milímetros, medidas internas.
// A espessura não entra no desenho: a compensação de vinco ainda não foi validada.
// Não é faca de produção.

function numero(valor) {
  if (typeof valor === "number") return valor;
  const texto = String(valor ?? "").trim().replace(/\s/g, "").replace(",", ".");
  return Number(texto);
}

function arred(n) {
  return Math.round(n * 100) / 100;
}

function lerSangria(valor) {
  if (valor == null || String(valor).trim() === "") return { valor: 0 };
  const n = numero(valor);
  if (!Number.isFinite(n)) return { erro: "Sangria inválida." };
  const v = arred(n);
  if (v < 0 || v > 25) return { erro: "A sangria de estudo fica entre 0 e 25 mm." };
  return { valor: v };
}

// Marcas de desenho: 1 mm de folga fora da sangria e 4 mm de traço.
// Não são marca de gráfica nem mudam o corte.
function marcasRegistro(folhaLargura, folhaAltura, sangria) {
  if (!(sangria > 0)) return { sangria: 0, sangriaCaixa: null, marcas: [] };
  const fora = arred(sangria + 1);
  const fim = arred(fora + 4);
  const x = folhaLargura;
  const y = folhaAltura;
  return {
    sangria,
    sangriaCaixa: {
      x: -sangria,
      y: -sangria,
      largura: arred(x + 2 * sangria),
      altura: arred(y + 2 * sangria),
    },
    marcas: [
      [0, -fora, 0, -fim],
      [-fora, 0, -fim, 0],
      [x, -fora, x, -fim],
      [arred(x + fora), 0, arred(x + fim), 0],
      [0, arred(y + fora), 0, arred(y + fim)],
      [-fora, y, -fim, y],
      [x, arred(y + fora), x, arred(y + fim)],
      [arred(x + fora), y, arred(x + fim), y],
    ],
  };
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function facaCartucho(comprimento, largura, altura, sangria) {
  const L = numero(comprimento);
  const W = numero(largura);
  const H = numero(altura);
  if (![L, W, H].every((n) => Number.isFinite(n) && n >= 10 && n <= 2000)) {
    return { erro: "Medidas inválidas. Use milímetros entre 10 e 2000." };
  }
  const faixa = lerSangria(sangria);
  if (faixa.erro) return faixa;

  const cola = arred(clamp(W * 0.45, 12, 25));
  const tuck = arred(clamp(Math.min(W * 0.8, H * 0.9), 12, Math.max(12, W)));
  const poeira = arred(Math.max(8, Math.min(tuck - 2, W * 0.5 - 1)));
  const inset = 1.5;
  const x1 = cola;
  const x2 = arred(cola + L);
  const x3 = arred(cola + L + W);
  const x4 = arred(cola + L + W + L);
  const x5 = arred(cola + 2 * L + 2 * W);
  const y1 = tuck;
  const y2 = arred(tuck + H);
  const y3 = arred(H + 2 * tuck);

  const corte = [
    [arred(4), arred(y1 + 6)],
    [0, arred(y1 + 12)],
    [0, arred(y2 - 12)],
    [arred(4), arred(y2 - 6)],
    [x1, y2],
    [x1, y3],
    [x2, y3],
    [x2, y2],
    [arred(x2 + inset), y2],
    [arred(x2 + inset), arred(y2 + poeira)],
    [arred(x3 - inset), arred(y2 + poeira)],
    [arred(x3 - inset), y2],
    [x3, y2],
    [x4, y2],
    [arred(x4 + inset), y2],
    [arred(x4 + inset), arred(y2 + poeira)],
    [arred(x5 - inset), arred(y2 + poeira)],
    [arred(x5 - inset), y2],
    [x5, y2],
    [x5, y1],
    [arred(x5 - inset), y1],
    [arred(x5 - inset), arred(y1 - poeira)],
    [arred(x4 + inset), arred(y1 - poeira)],
    [arred(x4 + inset), y1],
    [x4, y1],
    [x3, y1],
    [arred(x3 - inset), y1],
    [arred(x3 - inset), arred(y1 - poeira)],
    [arred(x2 + inset), arred(y1 - poeira)],
    [arred(x2 + inset), y1],
    [x2, y1],
    [x2, 0],
    [x1, 0],
    [x1, y1],
  ];

  const vincos = [
    [x1, y1, x1, y2],
    [x2, y1, x2, y2],
    [x3, y1, x3, y2],
    [x4, y1, x4, y2],
    [x1, y1, x2, y1],
    [x1, y2, x2, y2],
    [arred(x2 + inset), y1, arred(x3 - inset), y1],
    [arred(x2 + inset), y2, arred(x3 - inset), y2],
    [arred(x4 + inset), y1, arred(x5 - inset), y1],
    [arred(x4 + inset), y2, arred(x5 - inset), y2],
  ];

  const estudo = marcasRegistro(x5, y3, faixa.valor);
  return {
    folhaLargura: x5,
    folhaAltura: y3,
    cola,
    tuck,
    poeira,
    sangria: estudo.sangria,
    sangriaCaixa: estudo.sangriaCaixa,
    marcas: estudo.marcas,
    corte,
    vincos,
    colaPontos: [
      [x1, y1],
      [arred(4), arred(y1 + 6)],
      [0, arred(y1 + 12)],
      [0, arred(y2 - 12)],
      [arred(4), arred(y2 - 6)],
      [x1, y2],
    ],
    paineis: [
      { nome: "Cola", x: 0, y: y1, largura: x1, altura: arred(y2 - y1) },
      { nome: "Frente", x: x1, y: y1, largura: L, altura: H },
      { nome: "Lateral", x: x2, y: y1, largura: W, altura: H },
      { nome: "Verso", x: x3, y: y1, largura: L, altura: H },
      { nome: "Lateral", x: x4, y: y1, largura: W, altura: H },
    ],
  };
}

function dxfNum(valor) {
  return String(Math.round(Number(valor) * 1000) / 1000);
}

function dxfPar(codigo, valor, linhas) {
  linhas.push(String(codigo), String(valor));
}

function dxfCamada(nome, cor, linhas) {
  dxfPar(0, "LAYER", linhas);
  dxfPar(2, nome, linhas);
  dxfPar(70, 0, linhas);
  dxfPar(62, cor, linhas);
  dxfPar(6, "CONTINUOUS", linhas);
}

function dxfLinha(camada, x1, y1, x2, y2, linhas) {
  dxfPar(0, "LINE", linhas);
  dxfPar(8, camada, linhas);
  dxfPar(10, dxfNum(x1), linhas);
  dxfPar(20, dxfNum(y1), linhas);
  dxfPar(11, dxfNum(x2), linhas);
  dxfPar(21, dxfNum(y2), linhas);
}

function dxfPolilinha(camada, pontos, linhas) {
  dxfPar(0, "LWPOLYLINE", linhas);
  dxfPar(8, camada, linhas);
  dxfPar(90, pontos.length, linhas);
  dxfPar(70, 1, linhas);
  for (const ponto of pontos) {
    dxfPar(10, dxfNum(ponto[0]), linhas);
    dxfPar(20, dxfNum(ponto[1]), linhas);
  }
}

// Y do DXF cresce para cima. A folha de corte fica com a base em y = 0.
export function dxfCartucho(desenho) {
  if (!desenho || desenho.erro || !Array.isArray(desenho.corte)) return "";
  const altura = Number(desenho.folhaAltura);
  const subir = (y) => altura - y;
  const linhas = [];
  dxfPar(0, "SECTION", linhas);
  dxfPar(2, "HEADER", linhas);
  dxfPar(9, "$ACADVER", linhas);
  dxfPar(1, "AC1015", linhas);
  dxfPar(9, "$INSUNITS", linhas);
  dxfPar(70, 4, linhas);
  dxfPar(0, "ENDSEC", linhas);
  dxfPar(0, "SECTION", linhas);
  dxfPar(2, "TABLES", linhas);
  dxfPar(0, "TABLE", linhas);
  dxfPar(2, "LAYER", linhas);
  dxfPar(70, 7, linhas);
  dxfCamada("0", 7, linhas);
  dxfCamada("CORTE", 1, linhas);
  dxfCamada("VINCO", 5, linhas);
  dxfCamada("COLA", 4, linhas);
  dxfCamada("SANGRIA", 6, linhas);
  dxfCamada("REGISTRO", 8, linhas);
  dxfCamada("ESTUDO", 7, linhas);
  dxfPar(0, "ENDTAB", linhas);
  dxfPar(0, "ENDSEC", linhas);
  dxfPar(0, "SECTION", linhas);
  dxfPar(2, "ENTITIES", linhas);
  dxfPolilinha("CORTE", desenho.corte.map((p) => [p[0], subir(p[1])]), linhas);
  for (const vinco of desenho.vincos || []) {
    dxfLinha("VINCO", vinco[0], subir(vinco[1]), vinco[2], subir(vinco[3]), linhas);
  }
  if (desenho.colaPontos && desenho.colaPontos.length) {
    dxfPolilinha("COLA", desenho.colaPontos.map((p) => [p[0], subir(p[1])]), linhas);
  }
  if (desenho.sangriaCaixa) {
    const caixa = desenho.sangriaCaixa;
    dxfPolilinha("SANGRIA", [
      [caixa.x, subir(caixa.y)],
      [caixa.x + caixa.largura, subir(caixa.y)],
      [caixa.x + caixa.largura, subir(caixa.y + caixa.altura)],
      [caixa.x, subir(caixa.y + caixa.altura)],
    ], linhas);
  }
  for (const marca of desenho.marcas || []) {
    dxfLinha("REGISTRO", marca[0], subir(marca[1]), marca[2], subir(marca[3]), linhas);
  }
  dxfPar(0, "TEXT", linhas);
  dxfPar(8, "ESTUDO", linhas);
  dxfPar(10, 0, linhas);
  dxfPar(20, dxfNum(-8 - (Number(desenho.sangria) || 0)), linhas);
  dxfPar(40, 3.5, linhas);
  dxfPar(1, "CARTUCHO DE ESTUDO. NAO E FACA DE PRODUCAO. UNIDADE: MM.", linhas);
  dxfPar(0, "ENDSEC", linhas);
  dxfPar(0, "EOF", linhas);
  return linhas.join("\r\n") + "\r\n";
}
