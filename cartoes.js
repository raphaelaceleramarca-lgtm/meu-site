// Cartões de crédito: quais existem, quando vence cada fatura e como reconhecer
// o cartão de um lançamento.
//
// Uma compra no cartão entra na planilha com a data de vencimento da fatura
// (é quando o dinheiro sai de verdade). A data da compra vai na observação.

export const CARTOES = [
  { nome: 'Bradesco', vence: 11, termos: ['bradesco'] },
  { nome: 'Itaú', vence: 11, termos: ['itau'] },
  { nome: 'Infinity Pay', vence: 11, termos: ['infinity pay', 'infinitypay', 'infinite pay', 'infinitepay', 'infinity'] },
  { nome: 'C6 Bank', vence: 11, termos: ['c6 bank', 'c6bank', 'c6'] },
];

// A fatura fecha alguns dias antes de vencer. Compra feita depois do
// fechamento vai para a fatura do mês seguinte.
export const DIAS_FECHAMENTO = 7;

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').toLowerCase();
const temPalavra = (texto, termo) => new RegExp(`(^|[^a-z0-9])${termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(texto);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Nome do cartão citado num texto livre ("rodízio no c6", "Fatura itaú"), ou null.
export function cartaoNoTexto(txt) {
  const t = semAcento(txt);
  if (!t) return null;
  const c = CARTOES.find((x) => x.termos.some((termo) => temPalavra(t, termo)));
  return c ? c.nome : null;
}

// Palavras que, sozinhas, apontam um cartão (para o parser tirar da descrição).
export const PALAVRAS_CARTAO = new Set(['bradesco', 'itau', 'infinity', 'infinite', 'infinitypay', 'infinitepay', 'c6', 'c6bank']);

// Cartão de um lançamento: a coluna "Cartão" da planilha; se estiver vazia,
// uma fatura ("Cartão Bradesco", "Fatura itaú") ou uma observação "Cartão X".
export function cartaoDe(l) {
  if (!l) return null;
  if (l.cartao) return cartaoNoTexto(l.cartao) || String(l.cartao).trim();
  if (l.categoria === 'Cartões') {
    const c = cartaoNoTexto(l.descricao);
    if (c) return c;
  }
  const m = semAcento(l.observacao).match(/cartao\s+(.+)/);
  return m ? cartaoNoTexto(m[1]) : null;
}

// Vencimento da fatura em que cai uma compra feita em `compraISO` (aaaa-mm-dd).
export function vencimentoPara(nome, compraISO) {
  const c = CARTOES.find((x) => x.nome === nome);
  const m = String(compraISO || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!c || !m) return compraISO || null;
  const compra = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  for (let k = 0; k < 3; k++) {
    const ultimoDia = new Date(compra.getFullYear(), compra.getMonth() + k + 1, 0).getDate();
    const venc = new Date(compra.getFullYear(), compra.getMonth() + k, Math.min(c.vence, ultimoDia));
    const fecha = new Date(venc);
    fecha.setDate(fecha.getDate() - DIAS_FECHAMENTO);
    if (compra < fecha) return iso(venc);
  }
  return compraISO;
}
