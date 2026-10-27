// Ponte entre o site e a planilha.
// Cole este código em Extensões → Apps Script da sua planilha, troque a SENHA
// e publique como App da Web (veja o README).

const SENHA = 'troque-por-uma-senha-sua';
const ABA = 'Lançamentos';
const COLUNAS = ['data', 'tipo', 'categoria', 'descricao', 'previsto', 'realizado', 'status', 'observacao', 'conta'];

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
    else if (pedido.acao !== 'listar') return json({ ok: false, erro: 'Ação desconhecida.' });

    SpreadsheetApp.flush();
    return json({ ok: true, planilha: planilha.getName(), lancamentos: listar(aba) });
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

function ultimaLinha(aba) {
  const n = aba.getLastRow();
  if (n < 2) return n;
  const d = aba.getRange(2, 4, n - 1, 2).getValues();
  for (let i = d.length - 1; i >= 0; i--) {
    if (!vazio(d[i][0]) || !vazio(d[i][1])) return i + 2;
  }
  return 1;
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
