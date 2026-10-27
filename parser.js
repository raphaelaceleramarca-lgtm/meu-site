// Interpreta uma frase curta ("mercado 320 ontem", "recebi 3.000 Acelera dia 15 pj")
// e devolve um lançamento já classificado. Primeiro procura algo parecido no histórico
// da planilha; se não achar, usa palavras-chave.

export const CATEGORIAS_PADRAO = [
  'Receitas', 'Moradia', 'Alimentação', 'Transporte', 'Saúde e bem-estar', 'Assinaturas',
  'Cartões', 'Dívidas', 'Comunicação', 'Pessoal', 'Lazer', 'Educação', 'Impostos',
  'Marketing', 'Ferramentas', 'Outros',
];

const REGRAS = [
  ['Alimentação', ['mercado', 'supermercado', 'ifood', 'restaurante', 'padaria', 'almoco', 'jantar', 'lanche', 'feira', 'acougue', 'hortifruti']],
  ['Moradia', ['aluguel', 'condominio', 'luz', 'energia', 'agua', 'gas', 'internet', 'iptu', 'casa', 'faxina', 'diarista']],
  ['Transporte', ['uber', 'gasolina', 'combustivel', 'estacionamento', 'onibus', 'metro', 'pedagio', 'ipva', 'oficina', 'mecanico']],
  ['Saúde e bem-estar', ['farmacia', 'remedio', 'plano de saude', 'plano saude', 'medico', 'dentista', 'academia', 'welhub', 'wellhub', 'gympass', 'terapia', 'exame']],
  ['Assinaturas', ['spotify', 'netflix', 'gpt', 'chatgpt', 'google', 'youtube', 'icloud', 'prime', 'disney', 'hbo', 'revayah', 'canva', 'notion', 'claude', 'adobe', 'assinatura']],
  ['Cartões', ['cartao', 'fatura']],
  ['Dívidas', ['emprestimo', 'parcela', 'parcelamento', 'serasa', 'financiamento', 'acordo', 'divida']],
  ['Comunicação', ['telefone', 'celular', 'tim', 'vivo', 'claro']],
  ['Impostos', ['imposto', 'inss', 'darf', 'irpf', 'contador', 'contabilidade', 'simples nacional']],
  ['Marketing', ['anuncio', 'anuncios', 'ads', 'trafego', 'impulsionamento']],
  ['Educação', ['curso', 'escola', 'faculdade', 'livro', 'mentoria']],
  ['Lazer', ['cinema', 'viagem', 'bar', 'show', 'passeio', 'hotel']],
  ['Pessoal', ['mae', 'pai', 'presente', 'roupa', 'cabelo', 'salao']],
];

// Gastos que costumam ser da empresa, mesmo sem dizer "pj".
const DICAS_PJ = ['gpt', 'chatgpt', 'google', 'canva', 'notion', 'claude', 'adobe', 'imposto', 'inss', 'darf',
  'contador', 'contabilidade', 'simples nacional', 'anuncio', 'anuncios', 'ads', 'trafego', 'impulsionamento',
  'cliente', 'nota fiscal'];

const ENTRADA = ['recebi', 'receber', 'recebido', 'recebida', 'recebimento', 'receita', 'entrada', 'entrou', 'faturei', 'vendi', 'venda', 'salario', 'reembolso'];
const PAGO = ['paguei', 'pago', 'paga', 'recebi', 'recebido', 'recebida', 'quitado', 'quitei', 'gastei', 'comprei', 'entrou'];
const PREVISTO = ['previsto', 'prevista', 'vou', 'vence', 'vencimento', 'agendado', 'agendar', 'receber', 'pagar'];
const SAIDA = ['paguei', 'pagar', 'gastei', 'comprei', 'saida', 'despesa', 'gasto', 'conta'];
const CONTA_PJ = ['pj', 'empresa', 'cnpj', 'mei', 'firma'];
const CONTA_PF = ['pf', 'pessoal', 'cpf'];
const LIGACAO = new Set(['de', 'da', 'do', 'das', 'dos', 'no', 'na', 'nos', 'nas', 'em', 'pra', 'para', 'pro', 'com', 'o', 'a', 'os', 'as', 'e', 'um', 'uma', 'r$', 'reais', 'valor', 'ja']);

export const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const limpo = (s) => semAcento(s).replace(/^[^\p{L}\p{N}$+]+|[^\p{L}\p{N}]+$/gu, '');
const temPalavra = (texto, termo) => new RegExp(`(^|[^a-z0-9])${termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(texto);

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function lerValor(txt) {
  let s = String(txt ?? '').toLowerCase().replace(/r\$/g, '').replace(/\s/g, '');
  let mult = 1;
  if (/(mil|k)$/.test(s)) { mult = 1000; s = s.replace(/(mil|k)$/, ''); }
  if (!/^\d[\d.,]*$/.test(s)) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * mult * 100) / 100 : null;
}

function lerData(tokens, usados, hoje) {
  const desloc = { hoje: 0, ontem: -1, anteontem: -2, amanha: 1 };
  for (let i = 0; i < tokens.length; i++) {
    const t = limpo(tokens[i]);
    if (t in desloc) {
      usados.add(i);
      const d = new Date(hoje); d.setDate(d.getDate() + desloc[t]);
      return { data: iso(d), relativa: desloc[t] <= 0 };
    }
    const prox = tokens[i + 1] ? limpo(tokens[i + 1]) : '';
    const alvo = t === 'dia' && /^\d{1,2}(\/\d{1,2}(\/\d{2,4})?)?$/.test(prox) ? prox
      : /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(t) ? t : null;
    if (!alvo) continue;
    const [dd, mm, aa] = alvo.split('/').map(Number);
    const ano = aa ? (aa < 100 ? 2000 + aa : aa) : hoje.getFullYear();
    const mes = mm ? mm - 1 : hoje.getMonth();
    const d = new Date(ano, mes, dd);
    if (d.getDate() !== dd) continue;
    usados.add(i);
    if (alvo === prox) usados.add(i + 1);
    return { data: iso(d), relativa: false };
  }
  return { data: iso(hoje), relativa: false, padrao: true };
}

function lerQuantia(tokens, usados) {
  for (let i = 0; i < tokens.length; i++) {
    if (usados.has(i)) continue;
    let t = tokens[i].toLowerCase();
    if (t === 'r$' && tokens[i + 1]) { usados.add(i); continue; }
    t = t.replace(/^\+/, '');
    const prox = (tokens[i + 1] || '').toLowerCase();
    const comMil = prox === 'mil' || prox === 'k';
    const v = lerValor(comMil ? t + 'mil' : t);
    if (v == null) continue;
    usados.add(i);
    if (comMil) usados.add(i + 1);
    if (limpo(tokens[i + (comMil ? 2 : 1)] || '') === 'reais') usados.add(i + (comMil ? 2 : 1));
    return v;
  }
  return null;
}

// Procura no histórico o lançamento cuja descrição aparece na frase (a mais longa vence).
function doHistorico(texto, historico) {
  let melhor = null;
  for (const h of historico) {
    const d = semAcento(h.descricao).trim();
    if (d.length < 2) continue;
    if (temPalavra(texto, d) && (!melhor || d.length > semAcento(melhor.descricao).length)) melhor = h;
  }
  return melhor;
}

export function interpretar(frase, historico = [], hojeRef = new Date()) {
  const original = String(frase ?? '').trim();
  const hoje = new Date(hojeRef.getFullYear(), hojeRef.getMonth(), hojeRef.getDate());
  const tokens = original.split(/\s+/).filter(Boolean);
  const usados = new Set();
  const texto = semAcento(original);
  const pistas = [];

  const quando = lerData(tokens, usados, hoje);
  let valor = lerQuantia(tokens, usados);

  const sinal = original.startsWith('+') ? 'Entrada' : original.startsWith('-') ? 'Saída' : null;
  let tipo = sinal;
  let status = null;
  let conta = null;
  tokens.forEach((tok, i) => {
    const t = limpo(tok);
    if (ENTRADA.includes(t)) { tipo = tipo || 'Entrada'; usados.add(i); }
    else if (SAIDA.includes(t) && t !== 'conta') { tipo = tipo || 'Saída'; usados.add(i); }
    if (PAGO.includes(t)) { status = status || 'Pago/Recebido'; usados.add(i); }
    else if (PREVISTO.includes(t)) { status = status || 'Previsto'; usados.add(i); }
    if (CONTA_PJ.includes(t)) { conta = 'PJ'; usados.add(i); }
    else if (CONTA_PF.includes(t)) { conta = 'PF'; usados.add(i); }
  });

  const hist = doHistorico(texto, historico);
  let categoria = null;
  let descricao = null;
  if (hist) {
    categoria = hist.categoria;
    descricao = hist.descricao;
    tipo = tipo || hist.tipo;
    if (!conta) conta = hist.conta;
    if (valor == null && hist.previsto) { valor = hist.previsto; pistas.push(`Valor de “${hist.descricao}” na planilha`); }
    pistas.push(`Classificado como “${hist.descricao}” da planilha`);
  }

  tipo = tipo || 'Saída';
  if (!categoria) {
    const regra = REGRAS.find(([, termos]) => termos.some((t) => temPalavra(texto, t)));
    if (regra && !(tipo === 'Entrada' && regra[0] !== 'Impostos')) categoria = regra[0];
    else if (/\bDAS\b/.test(original)) categoria = 'Impostos';
    else categoria = tipo === 'Entrada' ? 'Receitas' : 'Outros';
  }
  if (!conta) {
    if (DICAS_PJ.some((t) => temPalavra(texto, t)) || /\bDAS\b/.test(original)) { conta = 'PJ'; pistas.push('Parece ser da empresa'); }
    else conta = tipo === 'Entrada' ? 'PJ' : 'PF';
  }
  if (!status) status = quando.relativa ? 'Pago/Recebido' : 'Previsto';

  if (!descricao) {
    let resto = tokens.map((t, i) => (usados.has(i) ? null : t.replace(/[,;.]+$/, '')));
    resto = resto.filter((t) => t && !/^[+-]$/.test(t));
    const ligacao = (t) => t !== 'DAS' && LIGACAO.has(limpo(t));
    while (resto.length && ligacao(resto[0])) resto.shift();
    while (resto.length && ligacao(resto[resto.length - 1])) resto.pop();
    descricao = resto.join(' ').replace(/^[+-]/, '');
    descricao = descricao ? descricao.charAt(0).toUpperCase() + descricao.slice(1) : categoria;
  }

  return { tipo, conta, categoria, descricao, valor, data: quando.data, status, pistas };
}
