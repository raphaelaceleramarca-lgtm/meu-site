import { interpretar, lerValor, CATEGORIAS_PADRAO } from './parser.js?v=2026-11-09';
import { dadosExemplo, investimentosExemplo } from './exemplo.js?v=2026-11-09';
import { CARTOES, cartaoDe, vencimentoPara } from './cartoes.js?v=2026-11-09';

const $ = (s) => document.querySelector(s);
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const BRL_CURTO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const PCT = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const brl = (v) => BRL.format(v || 0);
const PAGO = 'Pago/Recebido';
const TIPOS_INV = ['Reserva de emergência', 'Renda fixa', 'Tesouro Direto', 'Ações', 'Fundos imobiliários', 'Fundos', 'Previdência', 'Cripto', 'Exterior', 'Outros'];

// ---------- guardado no navegador ----------
const guardar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
const ler = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

const st = {
  cfg: ler('financas.cfg'),
  conta: ler('financas.conta') || 'Todos',
  mes: ler('financas.mes'),
  lista: 'aberto',
  busca: '',
  lancs: [],
  invs: null,
  invConta: 'PF',
  invEditando: null,
  planilha: '',
  rascunho: null,
  ajustes: {},
  ocupado: false,
  temCartao: false, // o Apps Script já grava a coluna "Cartão"
};

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const diaMes = (iso) => (iso ? { dia: iso.slice(8, 10), mes: MESES[Number(iso.slice(5, 7)) - 1] } : null);
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');
// ---------- meses ----------
// Cada lançamento pertence ao mês da sua data. Os sem data ficam em "Sem data".
const SEM_DATA = 'sem-data';
const MESES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const mesDe = (l) => (l.data ? l.data.slice(0, 7) : SEM_DATA);
const rotuloMes = (m) => (m === SEM_DATA ? 'Sem data' : `${MESES_NOME[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`);
const rotuloCurto = (m) => (m === SEM_DATA ? 'Sem data' : `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`);
const rotuloTitulo = (m) => (m === SEM_DATA ? 'Sem data' : `${MESES_NOME[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`);
const mesDeCalendario = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m || '');
function listaMeses() {
  const ms = new Set(st.lancs.map(mesDe));
  ms.add(hojeISO().slice(0, 7));
  // Um mês escolhido no seletor aparece mesmo sem lançamentos.
  if (mesDeCalendario(st.mes)) ms.add(st.mes);
  return [...ms].sort((a, b) => (a === SEM_DATA ? 1 : b === SEM_DATA ? -1 : a.localeCompare(b)));
}
function mesAtivo() {
  return st.mes && listaMeses().includes(st.mes) ? st.mes : hojeISO().slice(0, 7);
}
const doMes = (ls, mes = mesAtivo()) => ls.filter((l) => mesDe(l) === mes);
function escolherMes(mes) {
  st.mes = mes;
  guardar('financas.mes', mes);
  desenhar();
}

const pago = (l) => l.realizado != null;
const atrasado = (l) => !pago(l) && l.data && l.data < hojeISO();

// ---------- conversa com a planilha ----------
let demo = null;
let demoInv = null;
async function api(acao, extra = {}) {
  if (st.cfg?.exemplo) return apiExemplo(acao, extra);
  let r;
  try {
    r = await fetch(st.cfg.url, { method: 'POST', body: JSON.stringify({ senha: st.cfg.senha, acao, ...extra }) });
  } catch {
    throw new Error('A planilha não liberou o acesso ao site. No Apps Script, em Implantar → Gerenciar implantações, deixe "Executar como: Eu" e "Quem pode acessar: Qualquer pessoa" (sem "com Conta do Google") e implante uma nova versão.');
  }
  if (!r.ok) throw new Error(`A planilha respondeu com erro ${r.status}. Confira se a implantação está como "Qualquer pessoa".`);
  let j;
  try { j = await r.json(); } catch { throw new Error('A resposta não veio da ponte certa. Confira a URL (ela termina em /exec).'); }
  if (!j.ok) throw new Error(j.erro || 'A planilha recusou o pedido.');
  st.lancs = j.lancamentos || [];
  st.invs = Array.isArray(j.investimentos) ? j.investimentos : null;
  st.planilha = j.planilha || '';
  st.temCartao = Number(j.versao) >= 2;
  return j;
}

function apiExemplo(acao, extra) {
  if (!demo) demo = dadosExemplo();
  if (acao === 'adicionar') demo.push({ ...extra.lancamento, linha: Math.max(1, ...demo.map((l) => l.linha)) + 1 });
  if (acao === 'atualizar') Object.assign(demo.find((l) => l.linha === extra.linha), extra.campos);
  if (acao === 'excluir') demo = demo.filter((l) => l.linha !== extra.linha);
  if (!demoInv) demoInv = investimentosExemplo();
  if (acao === 'inv_adicionar') demoInv.push({ ...extra.investimento, linha: Math.max(1, ...demoInv.map((l) => l.linha)) + 1 });
  if (acao === 'inv_atualizar') Object.assign(demoInv.find((l) => l.linha === extra.linha), extra.campos);
  if (acao === 'inv_excluir') demoInv = demoInv.filter((l) => l.linha !== extra.linha);
  st.lancs = demo.map((l) => ({ ...l }));
  st.invs = demoInv.map((l) => ({ ...l }));
  st.planilha = 'Dados de exemplo';
  st.temCartao = true;
  return Promise.resolve({ ok: true });
}

// ---------- contas ----------
function resumo(conta, mes = mesAtivo()) {
  const ls = doMes(st.lancs, mes).filter((l) => conta === 'Todos' || l.conta === conta);
  const soma = (f) => ls.filter(f).reduce((s, l) => s + (l.previsto || 0), 0);
  const somaReal = (f) => ls.filter(f).reduce((s, l) => s + (l.realizado || 0), 0);
  const ent = (l) => l.tipo === 'Entrada';
  const sai = (l) => l.tipo !== 'Entrada';
  const e = soma(ent), s = soma(sai);
  return {
    entradas: e, saidas: s, saldo: e - s,
    recebido: somaReal(ent), pagoSaidas: somaReal(sai),
    aReceber: soma((l) => ent(l) && !pago(l)), aPagar: soma((l) => sai(l) && !pago(l)),
    cobertura: s ? e / s : null,
  };
}

function resumoInv(conta) {
  const ls = (st.invs || []).filter((i) => conta === 'Todos' || i.conta === conta);
  const saldo = ls.reduce((s, i) => s + (i.saldo || 0), 0);
  const aplicado = ls.reduce((s, i) => s + (i.aplicado || 0), 0);
  return { n: ls.length, saldo, aplicado, rendimento: saldo - aplicado, pct: aplicado ? (saldo - aplicado) / aplicado : null };
}

// ---------- desenho ----------
function setTexto(sel, txt, classe) {
  const el = $(sel);
  el.textContent = txt;
  el.classList.remove('pos', 'neg');
  if (classe) el.classList.add(classe);
}

function desenhar() {
  document.querySelectorAll('#seg-conta button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.conta === st.conta)));
  document.querySelectorAll('#seg-lista button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.lista)));
  $('#planilha-nome').textContent = st.planilha || 'PF e PJ';
  $('#aviso-exemplo').hidden = !st.cfg?.exemplo;
  desenharMeses();

  const r = resumo(st.conta);
  setTexto('#k-saldo', brl(r.saldo), r.saldo < 0 ? 'neg' : 'pos');
  setTexto('#k-saldo-sub', r.cobertura == null
    ? 'Sem saídas previstas.'
    : r.cobertura >= 1
      ? `As entradas superam as saídas em ${brl(r.entradas - r.saidas)}.`
      : `As entradas cobrem ${PCT.format(r.cobertura)} das saídas.`);
  $('#k-cobertura-barra').style.width = `${Math.min(100, (r.cobertura ?? 1) * 100)}%`;
  $('#k-cobertura-barra').style.background = r.cobertura != null && r.cobertura < 1 ? 'var(--neg)' : 'var(--pos)';
  setTexto('#k-entradas', brl(r.entradas));
  setTexto('#k-entradas-sub', `${brl(r.recebido)} recebido · ${brl(r.aReceber)} a receber`);
  setTexto('#k-saidas', brl(r.saidas));
  setTexto('#k-saidas-sub', `${brl(r.pagoSaidas)} pago · ${brl(r.aPagar)} a pagar`);
  const iv = resumoInv(st.conta);
  setTexto('#k-investido', st.invs ? brl(iv.saldo) : '—');
  setTexto('#k-investido-sub', !st.invs ? 'Atualize o Apps Script'
    : !iv.n ? 'Nenhum investimento lançado'
      : `${iv.rendimento >= 0 ? '+' : '−'}${brl(Math.abs(iv.rendimento))} de rendimento`, st.invs && iv.n ? (iv.rendimento >= 0 ? 'pos' : 'neg') : null);

  desenharPfPj();
  desenharCartoes();
  desenharMesAMes();
  desenharInvestimentos();
  desenharCategorias();
  desenharFluxo();
  desenharLista();
}

function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const f of filhos.flat()) if (f != null) e.append(f);
  return e;
}

function desenharPfPj() {
  const box = $('#pfpj');
  box.replaceChildren();
  const pf = resumo('PF'), pj = resumo('PJ');
  for (const [nome, r, cor] of [['PF', pf, 'var(--pf)'], ['PJ', pj, 'var(--pj)']]) {
    box.append(el('div', { class: 'conta-box' },
      el('div', { class: 'conta-tit' }, el('span', { class: 'ponto', style: `background:${cor}` }), nome === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'),
      el('div', { class: `conta-saldo ${r.saldo < 0 ? 'neg' : 'pos'}` }, brl(r.saldo)),
      el('div', { class: 'conta-linha' }, 'Entradas', el('b', {}, brl(r.entradas))),
      el('div', { class: 'conta-linha' }, 'Saídas', el('b', {}, brl(r.saidas))),
    ));
  }
  const frase = $('#retirada');
  frase.replaceChildren();
  const falta = Math.max(0, -pf.saldo);
  if (!falta) {
    frase.append('O PF fecha o mês sem precisar de dinheiro da PJ.');
    return;
  }
  const depois = pj.saldo - falta;
  frase.append('Para fechar o PF, a PJ precisa transferir ', el('b', {}, brl(falta)), ' (pró-labore ou lucros). ');
  if (depois >= 0) frase.append('Depois disso, sobram ', el('b', { class: 'pos' }, brl(depois)), ' na PJ.');
  else frase.append('A PJ não tem isso tudo: ainda faltariam ', el('b', { class: 'neg' }, brl(-depois)), ' no mês.');
}

function desenharCartoes() {
  const grade = $('#cartoes-grade');
  grade.replaceChildren();
  $('#cartoes-aviso').hidden = st.temCartao;
  const mes = mesAtivo();
  const saidas = doMes(st.lancs, mes).filter((l) => l.tipo !== 'Entrada');
  const soma = (ls, f) => ls.reduce((s, l) => s + (f(l) || 0), 0);
  for (const c of CARTOES) {
    const ls = saidas.filter((l) => cartaoDe(l) === c.nome)
      .sort((a, b) => (a.data || '').localeCompare(b.data || '') || a.linha - b.linha);
    const total = soma(ls, (l) => l.previsto);
    const abertos = ls.filter((l) => !pago(l));
    const aberto = soma(abertos, (l) => l.previsto);
    const pagoV = soma(ls.filter(pago), (l) => l.realizado);
    const pj = soma(ls.filter((l) => l.conta === 'PJ'), (l) => l.previsto);
    const vencido = mes !== SEM_DATA && aberto > 0 && `${mes}-${String(c.vence).padStart(2, '0')}` < hojeISO();

    const caixa = el('div', { class: 'cartao-box' },
      el('div', { class: 'cartao-topo' },
        el('span', { class: 'cartao-nome' }, c.nome),
        el('span', { class: `cartao-venc${vencido ? ' atraso' : ''}` }, vencido ? `venceu dia ${c.vence}` : `vence dia ${c.vence}`)),
      el('div', { class: 'cartao-total' }, brl(total)));

    if (!ls.length) {
      caixa.append(el('div', { class: 'cartao-vazio' }, 'Nada neste mês.'));
      grade.append(caixa);
      continue;
    }
    caixa.append(...[
      el('div', { class: 'cat-barra' }, el('i', { style: `width:${total ? (Math.min(pagoV, total) / total) * 100 : 0}%;background:var(--pos)` })),
      el('div', { class: 'conta-linha' }, 'Pago', el('b', {}, brl(pagoV))),
      el('div', { class: 'conta-linha' }, 'Em aberto', el('b', { class: aberto ? (vencido ? 'atraso-txt' : '') : 'pos' }, brl(aberto))),
      pj ? el('div', { class: 'cartao-nota' }, `Inclui ${brl(pj)} da PJ.`) : null,
      el('details', { class: 'cartao-itens' },
        el('summary', {}, ls.length === 1 ? '1 lançamento' : `${ls.length} lançamentos`),
        el('ul', {}, ls.map((l) => el('li', {},
          el('span', { class: 'ci-data' }, l.data ? ddmm(l.data) : '—'),
          el('span', { class: 'ci-desc', title: l.descricao }, l.descricao),
          el('span', { class: `ci-valor${pago(l) ? ' pos' : ''}` }, brl(l.previsto))))),
      ),
    ].filter(Boolean));
    if (!aberto) caixa.querySelector('.cartao-venc').replaceChildren('fatura paga'), caixa.querySelector('.cartao-venc').classList.add('pos');
    if (abertos.length) {
      const btn = el('button', { type: 'button', class: 'btn cartao-pagar' }, 'Paguei a fatura');
      let timer;
      btn.addEventListener('click', () => {
        if (btn.classList.contains('confirmar')) { clearTimeout(timer); pagarFatura(c, abertos); return; }
        btn.classList.add('confirmar');
        btn.textContent = `Confirmar ${brl(aberto)}`;
        timer = setTimeout(() => { btn.classList.remove('confirmar'); btn.textContent = 'Paguei a fatura'; }, 3500);
      });
      caixa.append(btn);
    }
    grade.append(caixa);
  }
}

function desenharMeses() {
  const ms = listaMeses();
  const mes = mesAtivo();
  const i = ms.indexOf(mes);
  $('#mes-titulo').textContent = rotuloTitulo(mes);
  $('#mes-botao').setAttribute('aria-label', `${rotuloMes(mes)}. Escolher outro mês`);
  if (!$('#mes-pop').hidden) desenharSeletor();
  $('#mes-ant').disabled = i <= 0;
  $('#mes-prox').disabled = i >= ms.length - 1;
  $('#seg-mes').replaceChildren(...ms.map((m) => el('button', { type: 'button', 'data-mes': m, 'aria-pressed': String(m === mes) }, rotuloCurto(m))));
}

function desenharMesAMes() {
  const corpo = $('#meses-corpo');
  corpo.replaceChildren();
  const mes = mesAtivo();
  const ms = listaMeses().filter((m) => m === mes || st.lancs.some((l) => mesDe(l) === m));
  for (const m of ms) {
    const r = resumo(st.conta, m);
    const tr = el('tr', { 'data-mes': m, tabindex: '0', 'aria-current': String(m === mes) },
      el('td', {}, rotuloMes(m)),
      el('td', { class: 'pos' }, brl(r.entradas)),
      el('td', {}, brl(r.saidas)),
      el('td', { class: r.saldo < 0 ? 'neg' : 'pos' }, brl(r.saldo)),
      el('td', {}, brl(r.aPagar)));
    corpo.append(tr);
  }
}

function desenharCategorias() {
  const ul = $('#cats');
  ul.replaceChildren();
  const ls = doMes(st.lancs).filter((l) => l.tipo !== 'Entrada' && (st.conta === 'Todos' || l.conta === st.conta));
  const mapa = new Map();
  for (const l of ls) {
    const c = mapa.get(l.categoria) || { previsto: 0, pago: 0 };
    c.previsto += l.previsto || 0;
    c.pago += l.realizado || 0;
    mapa.set(l.categoria, c);
  }
  const cats = [...mapa].sort((a, b) => b[1].previsto - a[1].previsto);
  if (!cats.length) { ul.append(el('li', { class: 'vazio' }, 'Nenhuma saída neste mês.')); return; }
  const max = cats[0][1].previsto || 1;
  const cor = st.conta === 'PJ' ? 'var(--pj)' : st.conta === 'PF' ? 'var(--pf)' : 'var(--ink)';
  for (const [nome, c] of cats) {
    ul.append(el('li', {},
      el('div', { class: 'cat-topo' }, el('span', {}, nome), el('span', {}, brl(c.previsto))),
      el('div', { class: 'cat-barra' },
        el('i', { style: `width:${(c.previsto / max) * 100}%;background:${cor};opacity:.22` }),
        el('i', { style: `width:${(Math.min(c.pago, c.previsto) / max) * 100}%;background:${cor}` })),
    ));
  }
}

function desenharFluxo() {
  const box = $('#fluxo');
  box.replaceChildren();
  const mes = mesAtivo();
  const ls = doMes(st.lancs, mes).filter((l) => l.data && (st.conta === 'Todos' || l.conta === st.conta));
  const semData = st.lancs.filter((l) => !l.data && (st.conta === 'Todos' || l.conta === st.conta)).length;
  $('#fluxo-sub').textContent = 'Saldo acumulado dentro do mês, começando do zero, se tudo sair na data prevista.'
    + (semData && mes !== SEM_DATA ? ` ${semData === 1 ? '1 lançamento sem data está' : `${semData} lançamentos sem data estão`} em “Sem data”.` : '');
  const dias = [...new Set(ls.map((l) => l.data))].sort();
  if (!dias.length) {
    box.append(el('p', { class: 'vazio' }, mes === SEM_DATA
      ? 'Lançamentos sem data não entram no fluxo. Coloque a data na planilha para eles irem para o mês certo.'
      : 'Nenhum lançamento com data neste mês.'));
    return;
  }
  let saldo = 0;
  const pts = dias.map((data) => {
    const doDia = ls.filter((l) => l.data === data);
    const e = doDia.filter((l) => l.tipo === 'Entrada').reduce((s, l) => s + l.previsto, 0);
    const s = doDia.filter((l) => l.tipo !== 'Entrada').reduce((s2, l) => s2 + l.previsto, 0);
    saldo += e - s;
    return { data, e, s, saldo };
  });

  const W = Math.max(300, box.clientWidth), H = 220, mt = 16, mb = 26;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Saldo acumulado por dia');
  box.append(svg);
  const add = (tag, a) => { const n = document.createElementNS(NS, tag); for (const k in a) n.setAttribute(k, a[k]); svg.append(n); return n; };
  const medir = (txt) => { const t = add('text', {}); t.textContent = txt; const w = t.getComputedTextLength(); t.remove(); return w; };

  let lo = Math.min(0, ...pts.map((p) => p.saldo)), hi = Math.max(0, ...pts.map((p) => p.saldo));
  if (lo === hi) hi = lo + 1000;
  const passo = escalaBonita((hi - lo) / 4);
  lo = Math.floor(lo / passo) * passo; hi = Math.ceil(hi / passo) * passo;
  const ticks = [];
  for (let v = lo; v <= hi + passo / 2; v += passo) ticks.push(Math.round(v));
  const ml = Math.max(...ticks.map((t) => medir(BRL_CURTO.format(t)))) + 10;
  const ultimo = pts[pts.length - 1];
  const mr = medir(brl(ultimo.saldo)) + 14;
  const t0 = Date.parse(dias[0]), t1 = Date.parse(dias[dias.length - 1]);
  const span = t1 - t0 || 86400000;
  const x = (iso) => ml + ((Date.parse(iso) - t0 + (t1 === t0 ? span / 2 : 0)) / span) * (W - ml - mr);
  const y = (v) => mt + (1 - (v - lo) / (hi - lo)) * (H - mt - mb);

  for (const t of ticks) {
    add('line', { x1: ml, x2: W - mr, y1: y(t), y2: y(t), stroke: t === 0 ? 'var(--muted)' : 'var(--line)', 'stroke-width': 1, 'stroke-dasharray': t === 0 ? '3 3' : '' });
    add('text', { x: ml - 8, y: y(t), 'text-anchor': 'end', 'dominant-baseline': 'middle' }).textContent = BRL_CURTO.format(t);
  }
  const nx = Math.max(2, Math.min(dias.length, Math.floor((W - ml - mr) / 70)));
  const passoX = Math.ceil(dias.length / nx);
  const ultimoRotulado = Math.floor((dias.length - 1) / passoX) * passoX;
  dias.forEach((d, i) => {
    const fim = i === dias.length - 1;
    if (i % passoX && !(fim && i - ultimoRotulado >= passoX * 0.6)) return;
    const m = diaMes(d);
    add('text', { x: x(d), y: H - 6, 'text-anchor': 'middle' }).textContent = `${m.dia} ${m.mes}`;
  });

  const cor = st.conta === 'PJ' ? 'var(--pj)' : 'var(--pf)';
  const caminho = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.data).toFixed(1)},${y(p.saldo).toFixed(1)}`).join('');
  const area = `${caminho}L${x(ultimo.data).toFixed(1)},${y(0).toFixed(1)}L${x(pts[0].data).toFixed(1)},${y(0).toFixed(1)}Z`;
  add('path', { d: area, fill: cor, opacity: 0.08 });
  add('path', { d: caminho, fill: 'none', stroke: cor, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  for (const p of pts) add('circle', { cx: x(p.data), cy: y(p.saldo), r: 3, fill: p.saldo < 0 ? 'var(--neg)' : cor });
  add('text', { x: x(ultimo.data) + 8, y: y(ultimo.saldo), 'dominant-baseline': 'middle', style: `fill:${ultimo.saldo < 0 ? 'var(--neg)' : 'var(--ink)'};font-weight:500` }).textContent = brl(ultimo.saldo);

  const anel = add('circle', { r: 6, fill: 'none', stroke: cor, 'stroke-width': 2, visibility: 'hidden' });
  const dica = el('div', { class: 'dica', hidden: '' });
  box.append(dica);
  const alvo = add('rect', { x: ml, y: 0, width: Math.max(1, W - ml - mr), height: H, fill: 'transparent' });
  alvo.addEventListener('pointermove', (ev) => {
    const r = svg.getBoundingClientRect();
    const sx = ((ev.clientX - r.left) / r.width) * W;
    const p = pts.reduce((a, b) => (Math.abs(x(b.data) - sx) < Math.abs(x(a.data) - sx) ? b : a));
    anel.setAttribute('cx', x(p.data)); anel.setAttribute('cy', y(p.saldo)); anel.setAttribute('visibility', 'visible');
    const m = diaMes(p.data);
    dica.replaceChildren(
      el('div', { class: 'dica-tit' }, `${m.dia} ${m.mes}`),
      p.e ? el('div', {}, `Entradas: ${brl(p.e)}`) : null,
      p.s ? el('div', {}, `Saídas: ${brl(p.s)}`) : null,
      el('div', {}, el('b', {}, `Saldo: ${brl(p.saldo)}`)),
    );
    dica.hidden = false;
    const k = r.width / W;
    let px = x(p.data) * k + 12, py = y(p.saldo) * k - dica.offsetHeight - 8;
    if (px + dica.offsetWidth > box.clientWidth) px = x(p.data) * k - dica.offsetWidth - 12;
    if (py < 0) py = y(p.saldo) * k + 12;
    dica.style.left = `${Math.max(0, px)}px`; dica.style.top = `${py}px`;
  });
  alvo.addEventListener('pointerleave', () => { dica.hidden = true; anel.setAttribute('visibility', 'hidden'); });
}

function desenharInvestimentos() {
  $('#inv-aviso').hidden = st.invs !== null;
  $('#btn-novo-inv').disabled = st.invs === null;
  const resumoBox = $('#inv-resumo');
  const ul = $('#inv-lista');
  resumoBox.replaceChildren();
  ul.replaceChildren();
  if (st.invs === null) return;

  const r = resumoInv(st.conta);
  const pctTxt = r.pct == null ? '' : ` (${r.pct >= 0 ? '+' : ''}${(r.pct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)`;
  resumoBox.append(el('div', {},
    el('div', { class: 'rotulo' }, st.conta === 'Todos' ? 'Total investido' : `Investido em ${st.conta}`),
    el('div', { class: 'inv-total' }, brl(r.saldo)),
    el('div', { class: `kpi-sub ${r.n ? (r.rendimento >= 0 ? 'pos' : 'neg') : ''}` },
      r.n ? `${r.rendimento >= 0 ? '+' : '−'}${brl(Math.abs(r.rendimento))}${pctTxt} sobre ${brl(r.aplicado)} aplicados` : 'Nenhum investimento ainda.'),
  ));
  if (st.conta === 'Todos') {
    const split = el('div', { class: 'inv-split' });
    for (const [c, cor] of [['PF', 'var(--pf)'], ['PJ', 'var(--pj)']]) {
      const x = resumoInv(c);
      split.append(el('div', { class: 'conta-box' },
        el('div', { class: 'conta-tit' }, el('span', { class: 'ponto', style: `background:${cor}` }), c),
        el('div', { class: 'conta-saldo' }, brl(x.saldo))));
    }
    resumoBox.append(split);
  }
  const ls = (st.invs || []).filter((i) => st.conta === 'Todos' || i.conta === st.conta);
  const porTipo = new Map();
  for (const i of ls) porTipo.set(i.tipo, (porTipo.get(i.tipo) || 0) + (i.saldo || 0));
  const tipos = [...porTipo].sort((a, b) => b[1] - a[1]);
  if (tipos.length && r.saldo > 0) {
    const cor = st.conta === 'PJ' ? 'var(--pj)' : st.conta === 'PF' ? 'var(--pf)' : 'var(--ink)';
    resumoBox.append(el('ul', { class: 'inv-tipos' }, tipos.map(([t, v]) => el('li', {},
      el('div', { class: 'cat-topo' }, el('span', {}, t), el('span', {}, `${brl(v)} · ${PCT.format(v / r.saldo)}`)),
      el('div', { class: 'cat-barra' }, el('i', { style: `width:${(v / r.saldo) * 100}%;background:${cor}` }))))));
  }

  if (!ls.length) {
    ul.append(el('li', { class: 'vazio' }, 'Clique em “Adicionar investimento” para lançar o primeiro.'));
    return;
  }
  for (const i of [...ls].sort((a, b) => b.saldo - a.saldo)) {
    const rend = (i.saldo || 0) - (i.aplicado || 0);
    const pct = i.aplicado ? rend / i.aplicado : null;
    const meta = [el('span', { class: `tag ${i.conta}` }, i.conta), el('span', {}, i.tipo)];
    if (i.instituicao) meta.push(el('span', { 'aria-hidden': 'true' }, '·'), el('span', {}, i.instituicao));
    if (i.data) { const m = diaMes(i.data); meta.push(el('span', { 'aria-hidden': 'true' }, '·'), el('span', {}, `atualizado ${m.dia} ${m.mes}`)); }
    const acoes = el('div', { class: 'i-acoes' });
    const li = el('li', { class: 'item inv-item' },
      el('div', { class: 'i-main' }, el('div', { class: 'i-desc', title: i.nome }, i.nome), el('div', { class: 'i-meta' }, meta)),
      el('div', { class: 'inv-valor' }, el('b', {}, brl(i.saldo)),
        el('small', { class: rend >= 0 ? 'pos' : 'neg' }, `${rend >= 0 ? '+' : '−'}${brl(Math.abs(rend))}${pct == null ? '' : ` · ${(pct * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}`)),
      acoes);
    if (st.invEditando === i.linha) {
      const inp = el('input', { inputmode: 'decimal', 'aria-label': `Novo saldo de ${i.nome}`, value: i.saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) });
      const salvar = () => {
        const v = lerValor(inp.value) ?? (inp.value.trim() === '0' ? 0 : null);
        if (v == null) { aviso('Digite o saldo, por exemplo 10.250,90.', true); return; }
        st.invEditando = null;
        rodar(() => api('inv_atualizar', { linha: i.linha, nome: i.nome, campos: { saldo: v, data: hojeISO() } }), `${i.nome}: saldo atualizado.`);
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') { st.invEditando = null; desenharInvestimentos(); } });
      li.append(el('div', { class: 'inv-editar' }, 'Saldo hoje:', inp,
        el('button', { type: 'button', class: 'btn primario', onclick: salvar }, 'Salvar'),
        el('button', { type: 'button', class: 'btn fantasma', onclick: () => { st.invEditando = null; desenharInvestimentos(); } }, 'Cancelar')));
      setTimeout(() => { inp.focus(); inp.select(); });
    } else {
      acoes.append(el('button', { type: 'button', onclick: () => { st.invEditando = i.linha; desenharInvestimentos(); } }, 'Atualizar saldo'));
    }
    const btnExcluir = el('button', { type: 'button', 'aria-label': `Excluir ${i.nome}` }, 'Excluir');
    let timer;
    btnExcluir.addEventListener('click', () => {
      if (btnExcluir.classList.contains('confirmar')) { clearTimeout(timer); rodar(() => api('inv_excluir', { linha: i.linha, nome: i.nome }), `${i.nome} excluído.`); return; }
      btnExcluir.classList.add('confirmar');
      btnExcluir.textContent = 'Confirmar';
      timer = setTimeout(() => { btnExcluir.classList.remove('confirmar'); btnExcluir.textContent = 'Excluir'; }, 3000);
    });
    acoes.append(btnExcluir);
    ul.append(li);
  }
}

function escalaBonita(bruto) {
  const p = 10 ** Math.floor(Math.log10(Math.max(bruto, 1)));
  const n = bruto / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function desenharLista() {
  const ul = $('#lista');
  ul.replaceChildren();
  const q = st.busca.toLowerCase();
  let ls = doMes(st.lancs).filter((l) => (st.conta === 'Todos' || l.conta === st.conta)
    && (st.lista === 'todos' || !pago(l))
    && (!q || `${l.descricao} ${l.categoria} ${l.observacao} ${cartaoDe(l) || ''}`.toLowerCase().includes(q)));
  ls = ls.sort((a, b) => {
    if (!a.data && !b.data) return a.linha - b.linha;
    if (!a.data) return 1;
    if (!b.data) return -1;
    return st.lista === 'todos' ? b.data.localeCompare(a.data) || b.linha - a.linha : a.data.localeCompare(b.data) || a.linha - b.linha;
  });
  if (!ls.length) {
    ul.append(el('li', { class: 'vazio' }, st.lista === 'aberto' && !q ? 'Nada em aberto neste mês. Tudo pago e recebido.' : 'Nenhum lançamento encontrado neste mês.'));
    return;
  }
  for (const l of ls) {
    const m = diaMes(l.data);
    const entrada = l.tipo === 'Entrada';
    const meta = [el('span', { class: `tag ${l.conta}` }, l.conta), l.categoria];
    const cart = cartaoDe(l);
    if (cart) meta.push(el('span', { class: 'tag cartao' }, cart));
    if (atrasado(l)) meta.push(el('span', { class: 'tag atraso' }, 'Vencido'));
    if (pago(l)) meta.push(el('span', { class: 'tag ok' }, entrada ? 'Recebido' : 'Pago'));
    if (l.observacao) meta.push(l.observacao);
    const acoes = el('div', { class: 'i-acoes' });
    if (!pago(l)) {
      acoes.append(el('button', { type: 'button', onclick: () => marcarPago(l) }, entrada ? 'Recebi' : 'Paguei'));
    }
    const btnExcluir = el('button', { type: 'button', 'aria-label': `Excluir ${l.descricao}` }, 'Excluir');
    let timer;
    btnExcluir.addEventListener('click', () => {
      if (btnExcluir.classList.contains('confirmar')) { clearTimeout(timer); excluir(l); return; }
      btnExcluir.classList.add('confirmar');
      btnExcluir.textContent = 'Confirmar';
      timer = setTimeout(() => { btnExcluir.classList.remove('confirmar'); btnExcluir.textContent = 'Excluir'; }, 3000);
    });
    acoes.append(btnExcluir);
    ul.append(el('li', { class: `item${atrasado(l) ? ' atrasado' : ''}` },
      el('div', { class: 'i-data' }, m ? [el('b', {}, m.dia), m.mes] : 'sem data'),
      el('div', { class: 'i-main' },
        el('div', { class: 'i-desc', title: l.descricao }, l.descricao),
        el('div', { class: 'i-meta' }, ...meta.flatMap((x, i) => (i && typeof x === 'string' ? [el('span', { 'aria-hidden': 'true' }, '·'), el('span', {}, x)] : [x])))),
      el('div', { class: `i-valor ${entrada ? 'pos' : ''}` }, `${entrada ? '+' : '−'} ${brl(l.previsto)}`),
      acoes,
    ));
  }
}

// ---------- ações ----------
let toastTimer;
function aviso(msg, erro = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('erro-toast', erro);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, erro ? 6000 : 2600);
}

async function rodar(fn, msgOk) {
  if (st.ocupado) return;
  st.ocupado = true;
  document.body.classList.add('carregando');
  $('#btn-sync').classList.add('girando');
  try {
    await fn();
    desenhar();
    atualizarRascunho();
    if (msgOk) aviso(msgOk);
  } catch (e) {
    aviso(e.message, true);
  } finally {
    st.ocupado = false;
    document.body.classList.remove('carregando');
    $('#btn-sync').classList.remove('girando');
  }
}

const sincronizar = (msg) => rodar(() => api('listar'), msg);
const marcarPago = (l) => rodar(() => api('atualizar', { linha: l.linha, descricao: l.descricao, campos: { realizado: l.previsto, status: PAGO } }),
  `${l.descricao}: marcado como ${l.tipo === 'Entrada' ? 'recebido' : 'pago'}.`);
const pagarFatura = (c, abertos) => rodar(async () => {
  for (const l of abertos) {
    await api('atualizar', { linha: l.linha, descricao: l.descricao, campos: { realizado: l.previsto, status: PAGO } });
  }
}, `Fatura ${c.nome} marcada como paga.`);
const excluir = (l) => rodar(() => api('excluir', { linha: l.linha, descricao: l.descricao }), `${l.descricao} excluído.`);

// ---------- lançamento rápido ----------
function categorias() {
  return [...new Set([...st.lancs.map((l) => l.categoria), ...CATEGORIAS_PADRAO])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function atualizarRascunho() {
  const frase = $('#q').value.trim();
  if (!frase) {
    st.rascunho = null; st.ajustes = {};
    $('#previa').hidden = true;
    $('#btn-lancar').disabled = true;
    $('#pista').textContent = 'Escreva do seu jeito. Eu separo valor, data, categoria e se é PF ou PJ. Você confere antes de lançar.';
    return;
  }
  const auto = interpretar(frase, st.lancs);
  const r = { ...auto, ...st.ajustes };
  // Compra no cartão: vai para o vencimento da fatura e fica como prevista.
  r.compra = null;
  if (r.cartao && r.tipo !== 'Entrada' && r.categoria !== 'Cartões') {
    r.compra = auto.data;
    if (!('data' in st.ajustes)) r.data = vencimentoPara(r.cartao, auto.data);
    if (!('status' in st.ajustes)) r.status = 'Previsto';
  }
  st.rascunho = r;
  $('#previa').hidden = false;
  document.querySelectorAll('#previa .seg').forEach((s) => {
    s.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === r[s.dataset.campo])));
  });
  const sel = $('#p-categoria');
  const cats = categorias();
  if (!cats.includes(r.categoria)) cats.unshift(r.categoria);
  if (sel.dataset.lista !== cats.join('|')) {
    sel.replaceChildren(...cats.map((c) => new Option(c, c)));
    sel.dataset.lista = cats.join('|');
  }
  sel.value = r.categoria;
  if (document.activeElement !== $('#p-descricao')) $('#p-descricao').value = r.descricao;
  if (document.activeElement !== $('#p-valor')) $('#p-valor').value = r.valor != null ? r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  if (document.activeElement !== $('#p-data')) $('#p-data').value = r.data || '';
  const ok = r.valor > 0 && r.descricao;
  $('#btn-lancar').disabled = !ok;
  const pista = $('#pista');
  pista.replaceChildren();
  if (!(r.valor > 0)) pista.append('Falta o valor. Escreva um número, como 120 ou 1.250,90.');
  else if (r.compra) pista.append(el('b', {}, `${r.tipo} de ${brl(r.valor)}`), ` em ${r.conta}, ${r.categoria}, no cartão ${r.cartao}.`,
    r.data ? ` Entra na fatura de ${diaMes(r.data).dia} ${diaMes(r.data).mes}.` : '', ' Enter para lançar.');
  else pista.append(el('b', {}, `${r.tipo} de ${brl(r.valor)}`), ` em ${r.conta}, ${r.categoria}`, r.cartao ? `, cartão ${r.cartao}` : '', r.data ? `, ${diaMes(r.data).dia} ${diaMes(r.data).mes}` : '', '.', auto.pistas.length && !Object.keys(st.ajustes).length ? ` ${auto.pistas[auto.pistas.length - 1]}.` : '', ' Enter para lançar.');
}

async function lancar() {
  const r = st.rascunho;
  if (!r || !(r.valor > 0) || !r.descricao || st.ocupado) return;
  const lancamento = {
    data: r.data || null,
    tipo: r.tipo,
    categoria: r.categoria,
    descricao: r.descricao,
    previsto: r.valor,
    realizado: r.status === PAGO ? r.valor : null,
    status: r.status,
    observacao: '',
    conta: r.conta,
    cartao: r.cartao || '',
  };
  const notas = [];
  // Sem a coluna "Cartão" no Apps Script, o cartão vai na observação para não se perder.
  if (r.cartao && !st.temCartao) notas.push(`Cartão ${r.cartao}`);
  if (r.compra && r.compra !== lancamento.data) notas.push(`compra em ${ddmm(r.compra)}`);
  lancamento.observacao = notas.join(' · ').replace(/^c/, 'C');
  await rodar(async () => {
    await api('adicionar', { lancamento });
    $('#q').value = '';
    st.ajustes = {};
  }, `Lançado: ${r.descricao}, ${brl(r.valor)} (${r.conta})`
    + (mesDe(lancamento) !== mesAtivo() ? `, em ${rotuloMes(mesDe(lancamento))}.` : '.'));
  $('#q').focus();
}

// ---------- eventos ----------
$('#q').addEventListener('input', () => { st.ajustes = {}; atualizarRascunho(); });
$('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lancar(); } });
$('#btn-lancar').addEventListener('click', lancar);
document.querySelectorAll('#previa .seg').forEach((s) => s.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  st.ajustes[s.dataset.campo] = b.dataset.v;
  atualizarRascunho();
}));
$('#p-categoria').addEventListener('change', (e) => { st.ajustes.categoria = e.target.value; atualizarRascunho(); });
$('#p-descricao').addEventListener('input', (e) => { st.ajustes.descricao = e.target.value.trim(); atualizarRascunho(); });
$('#p-valor').addEventListener('input', (e) => { st.ajustes.valor = lerValor(e.target.value); atualizarRascunho(); });
$('#p-data').addEventListener('change', (e) => { st.ajustes.data = e.target.value || null; atualizarRascunho(); });
['#p-descricao', '#p-valor'].forEach((s) => $(s).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lancar(); } }));

$('#seg-conta').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-conta]');
  if (!b) return;
  st.conta = b.dataset.conta;
  guardar('financas.conta', st.conta);
  desenhar();
});
$('#seg-mes').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mes]');
  if (b) escolherMes(b.dataset.mes);
});
const passarMes = (passo) => {
  const ms = listaMeses();
  const novo = ms[ms.indexOf(mesAtivo()) + passo];
  if (novo) escolherMes(novo);
};
$('#mes-ant').addEventListener('click', () => passarMes(-1));
$('#mes-prox').addEventListener('click', () => passarMes(1));

// ---------- seletor de mês e ano ----------
let anoSeletor = null;
function desenharSeletor() {
  const ativo = mesAtivo();
  const hoje = hojeISO().slice(0, 7);
  const comLancamentos = new Set(st.lancs.map(mesDe));
  $('#ano-titulo').textContent = anoSeletor;
  $('#mes-grade').replaceChildren(...MESES.map((nome, i) => {
    const m = `${anoSeletor}-${String(i + 1).padStart(2, '0')}`;
    const classes = [comLancamentos.has(m) ? 'tem' : '', m === hoje ? 'hoje' : ''].filter(Boolean).join(' ');
    return el('button', {
      type: 'button', 'data-mes': m, class: classes,
      'aria-pressed': String(m === ativo),
      'aria-label': `${MESES_NOME[i]} de ${anoSeletor}${comLancamentos.has(m) ? ', com lançamentos' : ''}`,
    }, nome);
  }));
}
function abrirSeletor() {
  const ativo = mesAtivo();
  anoSeletor = Number((ativo === SEM_DATA ? hojeISO() : ativo).slice(0, 4));
  desenharSeletor();
  $('#mes-pop').hidden = false;
  $('#mes-botao').setAttribute('aria-expanded', 'true');
  ($('#mes-grade [aria-pressed="true"]') || $('#mes-grade button')).focus();
}
function fecharSeletor(devolverFoco = false) {
  if ($('#mes-pop').hidden) return;
  $('#mes-pop').hidden = true;
  $('#mes-botao').setAttribute('aria-expanded', 'false');
  if (devolverFoco) $('#mes-botao').focus();
}
$('#mes-botao').addEventListener('click', () => ($('#mes-pop').hidden ? abrirSeletor() : fecharSeletor()));
$('#ano-ant').addEventListener('click', () => { anoSeletor -= 1; desenharSeletor(); });
$('#ano-prox').addEventListener('click', () => { anoSeletor += 1; desenharSeletor(); });
$('#mes-grade').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mes]');
  if (!b) return;
  fecharSeletor(true);
  escolherMes(b.dataset.mes);
});
$('#mes-hoje').addEventListener('click', () => { fecharSeletor(true); escolherMes(hojeISO().slice(0, 7)); });
document.addEventListener('click', (e) => { if (!e.target.closest('.mes-escolha')) fecharSeletor(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharSeletor(true); });
$('#meses-corpo').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-mes]');
  if (tr) escolherMes(tr.dataset.mes);
});
$('#meses-corpo').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const tr = e.target.closest('tr[data-mes]');
  if (tr) { e.preventDefault(); escolherMes(tr.dataset.mes); }
});
$('#seg-lista').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  st.lista = b.dataset.v;
  desenhar();
});
$('#busca').addEventListener('input', (e) => { st.busca = e.target.value.trim(); desenharLista(); });
$('#btn-sync').addEventListener('click', () => sincronizar('Atualizado.'));
$('#btn-ajustes').addEventListener('click', () => {
  $('#dlg-info').textContent = st.cfg?.exemplo
    ? 'Você está usando dados de exemplo.'
    : `Conectado a: ${st.planilha || 'sua planilha'}. A URL e a senha ficam guardadas só neste navegador.`;
  $('#dlg-ajustes').showModal();
});
$('#btn-desconectar').addEventListener('click', () => {
  guardar('financas.cfg', null);
  st.cfg = null; st.lancs = []; st.invs = null; demo = null; demoInv = null;
  $('#dlg-ajustes').close();
  mostrar();
});

// O código é baixado antes do clique: alguns navegadores só deixam copiar
// se a cópia acontece logo no clique, sem esperar um download no meio.
let codigoScript = null;
fetch('apps-script/Codigo.gs').then((r) => r.text()).then((t) => { codigoScript = t; }).catch(() => {});
const copiarCodigo = () => {
  if (!codigoScript) { window.open('apps-script/Codigo.gs', '_blank', 'noopener'); return; }
  navigator.clipboard.writeText(codigoScript)
    .then(() => aviso('Código copiado. Cole no Apps Script.'))
    .catch(() => window.open('apps-script/Codigo.gs', '_blank', 'noopener'));
};
$('#btn-copiar-codigo').addEventListener('click', copiarCodigo);
$('#btn-copiar-codigo-2').addEventListener('click', copiarCodigo);

$('#btn-conectar').addEventListener('click', async () => {
  const url = $('#cfg-url').value.trim();
  const senha = $('#cfg-senha').value;
  const erro = $('#cfg-erro');
  erro.hidden = true;
  if (!/^https:\/\/script\.google(usercontent)?\.com\/.+/.test(url)) {
    erro.textContent = 'A URL deve começar com https://script.google.com/macros/s/ e terminar em /exec.';
    erro.hidden = false; return;
  }
  if (!senha) { erro.textContent = 'Digite a senha que você colocou no código.'; erro.hidden = false; return; }
  const btn = $('#btn-conectar');
  btn.disabled = true; btn.textContent = 'Conectando…';
  st.cfg = { url, senha };
  try {
    await api('listar');
    guardar('financas.cfg', st.cfg);
    mostrar();
    aviso('Planilha conectada.');
  } catch (e) {
    st.cfg = null;
    erro.textContent = e.message; erro.hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = 'Conectar';
  }
});
$('#btn-exemplo').addEventListener('click', () => { st.cfg = { exemplo: true }; guardar('financas.cfg', st.cfg); mostrar(); sincronizar(); });
$('#btn-sair-exemplo').addEventListener('click', () => $('#btn-desconectar').click());

// ---------- investimentos: formulário ----------
$('#inv-tipo').replaceChildren(...TIPOS_INV.map((t) => new Option(t, t)));
const abrirFormInv = (abrir) => {
  $('#inv-form').hidden = !abrir;
  $('#btn-novo-inv').setAttribute('aria-expanded', String(abrir));
  if (abrir) {
    st.invConta = st.conta === 'PJ' ? 'PJ' : 'PF';
    document.querySelectorAll('#inv-conta button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === st.invConta)));
    $('#inv-nome').focus();
  }
};
$('#btn-novo-inv').addEventListener('click', () => abrirFormInv($('#inv-form').hidden));
$('#inv-cancelar').addEventListener('click', () => abrirFormInv(false));
$('#inv-conta').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  st.invConta = b.dataset.v;
  document.querySelectorAll('#inv-conta button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
});
$('#inv-salvar').addEventListener('click', () => {
  const nome = $('#inv-nome').value.trim();
  const saldo = lerValor($('#inv-saldo').value) ?? ($('#inv-saldo').value.trim() === '0' ? 0 : null);
  const aplicadoTxt = $('#inv-aplicado').value.trim();
  const aplicado = aplicadoTxt ? lerValor(aplicadoTxt) : null;
  if (!nome) { aviso('Dê um nome ao investimento.', true); $('#inv-nome').focus(); return; }
  if (saldo == null && aplicado == null) { aviso('Informe o saldo atual ou o valor aplicado.', true); $('#inv-saldo').focus(); return; }
  if (aplicadoTxt && aplicado == null) { aviso('O valor aplicado não está num formato válido. Ex.: 5.000,00', true); return; }
  const investimento = {
    data: hojeISO(), nome, tipo: $('#inv-tipo').value, instituicao: $('#inv-inst').value.trim(),
    conta: st.invConta, aplicado: aplicado ?? saldo, saldo: saldo ?? aplicado, observacao: '',
  };
  rodar(async () => {
    await api('inv_adicionar', { investimento });
    ['#inv-nome', '#inv-inst', '#inv-aplicado', '#inv-saldo'].forEach((s) => { $(s).value = ''; });
    abrirFormInv(false);
  }, `${nome} adicionado aos investimentos.`);
});
['#inv-nome', '#inv-inst', '#inv-aplicado', '#inv-saldo'].forEach((s) => $(s).addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#inv-salvar').click(); }));

let largura = window.innerWidth;
window.addEventListener('resize', () => {
  if (Math.abs(window.innerWidth - largura) < 20 || !st.lancs.length) return;
  largura = window.innerWidth;
  desenharFluxo();
});

function mostrar() {
  const conectado = !!st.cfg;
  $('#tela-conectar').hidden = conectado;
  $('#tela-painel').hidden = !conectado;
  $('#topo-acoes').hidden = !conectado;
  if (conectado) desenhar();
  else $('#planilha-nome').textContent = 'PF e PJ';
}

mostrar();
if (st.cfg) sincronizar();
