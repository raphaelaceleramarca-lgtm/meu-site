// Ponte entre o site e a planilha.
// Cole este código em Extensões → Apps Script da sua planilha, troque a SENHA
// e publique como App da Web (veja o README).

const SENHA = 'troque-por-uma-senha-sua';
const ABA = 'Lançamentos';
const COLUNAS = ['data', 'tipo', 'categoria', 'descricao', 'previsto', 'realizado', 'status', 'observacao', 'conta'];
const ABA_INV = 'Investimentos';
const COLUNAS_INV = ['data', 'nome', 'tipo', 'instituicao', 'conta', 'aplicado', 'saldo', 'observacao'];
const TITULOS_INV = ['Atualizado em', 'Investimento', 'Tipo', 'Instituição', 'Conta', 'Valor aplicado', 'Saldo atual', 'Observação'];

function doGet() {
  return json({ ok: true, mensagem: 'Conexão ativa. Use o site para ver e lançar.' });
}

function doPost(e) {
  let pedido;
  try {
    pedido = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, erro: 'Pedido inválido.' });
  }
  if (!pedido || pedido.senha !== SENHA) return json({ ok: false, erro: 'Senha incorreta.' });

  const trava = LockService.getScriptLock();
  trava.waitLock(15000);
  try {
    const planilha = SpreadsheetApp.getActive();
    const aba = planilha.getSheetByName(ABA);
    if (!aba) return json({ ok: false, erro: 'Não encontrei a aba "' + ABA + '".' });

    if (pedido.acao === 'adicionar') adicionar(aba, pedido.lancamento);
    else if (pedido.acao === 'atualizar') atualizar(aba, pedido.linha, pedido.descricao, pedido.campos);
    else if (pedido.acao === 'excluir') excluir(aba, pedido.linha, pedido.descricao);
    else if (pedido.acao === 'inv_adicionar') invAdicionar(abaInvestimentos(planilha), pedido.investimento);
    else if (pedido.acao === 'inv_atualizar') invAtualizar(abaInvestimentos(planilha), pedido.linha, pedido.nome, pedido.campos);
    else if (pedido.acao === 'inv_excluir') invExcluir(abaInvestimentos(planilha), pedido.linha, pedido.nome);
    else if (pedido.acao !== 'listar') return json({ ok: false, erro: 'Ação desconhecida.' });

    SpreadsheetApp.flush();
    const abaInv = planilha.getSheetByName(ABA_INV);
    return json({
      ok: true,
      planilha: planilha.getName(),
      lancamentos: listar(aba),
      investimentos: abaInv ? invListar(abaInv) : [],
    });
  } catch (err) {
    return json({ ok: false, erro: String((err && err.message) || err) });
  } finally {
    trava.releaseLock();
  }
}

function listar(aba) {
  const ultima = ultimaLinha(aba);
  if (ultima < 2) return [];
  const fuso = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const valores = aba.getRange(2, 1, ultima - 1, COLUNAS.length).getValues();
  const saida = [];
  valores.forEach(function (r, i) {
    if (vazio(r[3]) && vazio(r[4])) return;
    saida.push({
      linha: i + 2,
      data: lerData(r[0], fuso),
      tipo: texto(r[1]),
      categoria: texto(r[2]) || 'Sem categoria',
      descricao: texto(r[3]),
      previsto: lerNumero(r[4]) || 0,
      realizado: vazio(r[5]) ? null : lerNumero(r[5]),
      status: texto(r[6]),
      observacao: texto(r[7]),
      conta: texto(r[8]).toUpperCase() || 'Sem conta',
    });
  });
  return saida;
}

function adicionar(aba, l) {
  if (!l || !texto(l.descricao)) throw new Error('Falta a descrição.');
  const valor = Number(l.previsto);
  if (!(valor > 0)) throw new Error('Falta o valor.');
  const linha = ultimaLinha(aba) + 1;
  aba.getRange(linha, 1, 1, COLUNAS.length).setValues([[
    escreverData(l.data),
    l.tipo === 'Entrada' ? 'Entrada' : 'Saída',
    texto(l.categoria) || 'Outros',
    texto(l.descricao),
    valor,
    l.realizado == null || l.realizado === '' ? '' : Number(l.realizado),
    texto(l.status) || 'Previsto',
    texto(l.observacao),
    l.conta === 'PJ' ? 'PJ' : 'PF',
  ]]);
  aba.getRange(linha, 1).setNumberFormat('dd/MM/yyyy');
  aba.getRange(linha, 5, 1, 2).setNumberFormat('"R$ "#,##0.00');
}

function atualizar(aba, linha, descricao, campos) {
  conferir(aba, linha, descricao);
  Object.keys(campos || {}).forEach(function (campo) {
    const col = COLUNAS.indexOf(campo);
    if (col < 0) return;
    let v = campos[campo];
    if (campo === 'data') v = escreverData(v);
    else if (campo === 'previsto' || campo === 'realizado') v = v == null || v === '' ? '' : Number(v);
    else v = texto(v);
    const celula = aba.getRange(linha, col + 1);
    celula.setValue(v);
    if (campo === 'data') celula.setNumberFormat('dd/MM/yyyy');
    if (campo === 'previsto' || campo === 'realizado') celula.setNumberFormat('"R$ "#,##0.00');
  });
}

function excluir(aba, linha, descricao) {
  conferir(aba, linha, descricao);
  aba.deleteRow(linha);
}

// Garante que a linha ainda é o mesmo lançamento que o site mostrou.
function conferir(aba, linha, descricao) {
  linha = Number(linha);
  if (!(linha >= 2)) throw new Error('Linha inválida.');
  if (texto(aba.getRange(linha, 4).getValue()) !== texto(descricao)) {
    throw new Error('A planilha mudou desde a última atualização. Atualize a página e tente de novo.');
  }
}

// Última linha com conteúdo nas colunas que identificam um registro
// (Lançamentos: descrição e valor; Investimentos: nome até saldo).
function ultimaLinha(aba, coluna, largura) {
  coluna = coluna || 4;
  largura = largura || 2;
  const n = aba.getLastRow();
  if (n < 2) return n;
  const d = aba.getRange(2, coluna, n - 1, largura).getValues();
  for (let i = d.length - 1; i >= 0; i--) {
    if (d[i].some(function (v) { return !vazio(v); })) return i + 2;
  }
  return 1;
}

// ---------- Investimentos ----------

function abaInvestimentos(planilha) {
  let aba = planilha.getSheetByName(ABA_INV);
  if (!aba) {
    aba = planilha.insertSheet(ABA_INV);
    aba.getRange(1, 1, 1, TITULOS_INV.length).setValues([TITULOS_INV]).setFontWeight('bold');
    aba.setFrozenRows(1);
  }
  return aba;
}

function invListar(aba) {
  const ultima = ultimaLinha(aba, 2, 6);
  if (ultima < 2) return [];
  const fuso = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const valores = aba.getRange(2, 1, ultima - 1, COLUNAS_INV.length).getValues();
  const saida = [];
  valores.forEach(function (r, i) {
    if (vazio(r[1]) && vazio(r[6])) return;
    const aplicado = lerNumero(r[5]);
    const saldo = lerNumero(r[6]);
    saida.push({
      linha: i + 2,
      data: lerData(r[0], fuso),
      nome: texto(r[1]),
      tipo: texto(r[2]) || 'Outros',
      instituicao: texto(r[3]),
      conta: texto(r[4]).toUpperCase() || 'PF',
      aplicado: aplicado == null ? saldo || 0 : aplicado,
      saldo: saldo == null ? aplicado || 0 : saldo,
      observacao: texto(r[7]),
    });
  });
  return saida;
}

function invAdicionar(aba, inv) {
  if (!inv || !texto(inv.nome)) throw new Error('Falta o nome do investimento.');
  const saldo = Number(inv.saldo);
  if (!(saldo >= 0)) throw new Error('Falta o saldo.');
  const aplicado = inv.aplicado == null || inv.aplicado === '' ? saldo : Number(inv.aplicado);
  const linha = ultimaLinha(aba, 2, 6) + 1;
  aba.getRange(linha, 1, 1, COLUNAS_INV.length).setValues([[
    escreverData(inv.data),
    texto(inv.nome),
    texto(inv.tipo) || 'Outros',
    texto(inv.instituicao),
    inv.conta === 'PJ' ? 'PJ' : 'PF',
    aplicado,
    saldo,
    texto(inv.observacao),
  ]]);
  aba.getRange(linha, 1).setNumberFormat('dd/MM/yyyy');
  aba.getRange(linha, 6, 1, 2).setNumberFormat('"R$ "#,##0.00');
}

function invAtualizar(aba, linha, nome, campos) {
  invConferir(aba, linha, nome);
  Object.keys(campos || {}).forEach(function (campo) {
    const col = COLUNAS_INV.indexOf(campo);
    if (col < 0) return;
    let v = campos[campo];
    if (campo === 'data') v = escreverData(v);
    else if (campo === 'aplicado' || campo === 'saldo') v = v == null || v === '' ? '' : Number(v);
    else v = texto(v);
    const celula = aba.getRange(linha, col + 1);
    celula.setValue(v);
    if (campo === 'data') celula.setNumberFormat('dd/MM/yyyy');
    if (campo === 'aplicado' || campo === 'saldo') celula.setNumberFormat('"R$ "#,##0.00');
  });
}

function invExcluir(aba, linha, nome) {
  invConferir(aba, linha, nome);
  aba.deleteRow(linha);
}

function invConferir(aba, linha, nome) {
  linha = Number(linha);
  if (!(linha >= 2)) throw new Error('Linha inválida.');
  if (texto(aba.getRange(linha, 2).getValue()) !== texto(nome)) {
    throw new Error('A planilha mudou desde a última atualização. Atualize a página e tente de novo.');
  }
}

function lerData(v, fuso) {
  if (v instanceof Date) return Utilities.formatDate(v, fuso, 'yyyy-MM-dd');
  const m = String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : null;
}

function escreverData(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const fuso = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  return Utilities.parseDate(m[1] + '-' + m[2] + '-' + m[3] + ' 12:00', fuso, 'yyyy-MM-dd HH:mm');
}

function lerNumero(v) {
  if (typeof v === 'number') return v;
  const s = String(v || '').replace(/[^\d,-]/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function texto(v) {
  return v == null ? '' : String(v).trim();
}

function vazio(v) {
  return v === '' || v == null;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
