import { interpretar, lerValor, CATEGORIAS_PADRAO } from './parser.js';
import { dadosExemplo } from './exemplo.js';

const $ = (s) => document.querySelector(s);
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const BRL_CURTO = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const PCT = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const brl = (v) => BRL.format(v || 0);
const PAGO = 'Pago/Recebido';

// ---------- guardado no navegador ----------
const guardar = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } };
const ler = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

const st = {
  cfg: ler('financas.cfg'),
  conta: ler('financas.conta') || 'Todos',
  lista: 'aberto',
  busca: '',
  lancs: [],
  planilha: '',
  rascunho: null,
  ajustes: {},
  ocupado: false,
};

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const diaMes = (iso) => (iso ? { dia: iso.slice(8, 10), mes: MESES[Number(iso.slice(5, 7)) - 1] } : null);
const pago = (l) => l.realizado != null;
const atrasado = (l) => !pago(l) && l.data && l.data < hojeISO();

// ---------- conversa com a planilha ----------
let demo = null;
async function api(acao, extra = {}) {
  if (st.cfg?.exemplo) return apiExemplo(acao, extra);
  let r;
  try {
    r = await fetch(st.cfg.url, { method: 'POST', body: JSON.stringify({ senha: st.cfg.senha, acao, ...extra }) });
  } catch {
    throw new Error('Não consegui falar com a planilha. Confira sua internet e a URL do app da Web.');
  }
  if (!r.ok) throw new Error(`A planilha respondeu com erro ${r.status}. Confira se a implantação está como "Qualquer pessoa".`);
  let j;
  try { j = await r.json(); } catch { throw new Error('A resposta não veio da ponte certa. Confira a URL (ela termina em /exec).'); }
  if (!j.ok) throw new Error(j.erro || 'A planilha recusou o pedido.');
  st.lancs = j.lancamentos || [];
  st.planilha = j.planilha || '';
  return j;
}

function apiExemplo(acao, extra) {
  if (!demo) demo = dadosExemplo();
  if (acao === 'adicionar') demo.push({ ...extra.lancamento, linha: Math.max(1, ...demo.map((l) => l.linha)) + 1 });
  if (acao === 'atualizar') Object.assign(demo.find((l) => l.linha === extra.linha), extra.campos);
  if (acao === 'excluir') demo = demo.filter((l) => l.linha !== extra.linha);
  st.lancs = demo.map((l) => ({ ...l }));
  st.planilha = 'Dados de exemplo';
  return Promise.resolve({ ok: true });
}

// ---------- contas ----------
function resumo(conta) {
  const ls = st.lancs.filter((l) => conta === 'Todos' || l.conta === conta);
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

  desenharPfPj();
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

function desenharCategorias() {
  const ul = $('#cats');
  ul.replaceChildren();
  const ls = st.lancs.filter((l) => l.tipo !== 'Entrada' && (st.conta === 'Todos' || l.conta === st.conta));
  const mapa = new Map();
  for (const l of ls) {
    const c = mapa.get(l.categoria) || { previsto: 0, pago: 0 };
    c.previsto += l.previsto || 0;
    c.pago += l.realizado || 0;
    mapa.set(l.categoria, c);
  }
  const cats = [...mapa].sort((a, b) => b[1].previsto - a[1].previsto);
  if (!cats.length) { ul.append(el('li', { class: 'vazio' }, 'Nenhuma saída aqui.')); return; }
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
  const ls = st.lancs.filter((l) => l.data && (st.conta === 'Todos' || l.conta === st.conta));
  const semData = st.lancs.filter((l) => !l.data && (st.conta === 'Todos' || l.conta === st.conta)).length;
  $('#fluxo-sub').textContent = 'Saldo acumulado se tudo sair na data prevista.'
    + (semData ? ` ${semData === 1 ? '1 lançamento sem data fica' : `${semData} lançamentos sem data ficam`} de fora.` : '');
  const dias = [...new Set(ls.map((l) => l.data))].sort();
  if (!dias.length) { box.append(el('p', { class: 'vazio' }, 'Nenhum lançamento com data.')); return; }
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
  if (lo === hi) hi = lo + 1;
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

function escalaBonita(bruto) {
  const p = 10 ** Math.floor(Math.log10(Math.max(bruto, 1)));
  const n = bruto / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function desenharLista() {
  const ul = $('#lista');
  ul.replaceChildren();
  const q = st.busca.toLowerCase();
  let ls = st.lancs.filter((l) => (st.conta === 'Todos' || l.conta === st.conta)
    && (st.lista === 'todos' || !pago(l))
    && (!q || `${l.descricao} ${l.categoria} ${l.observacao}`.toLowerCase().includes(q)));
  ls = ls.sort((a, b) => {
    if (!a.data && !b.data) return a.linha - b.linha;
    if (!a.data) return 1;
    if (!b.data) return -1;
    return st.lista === 'todos' ? b.data.localeCompare(a.data) || b.linha - a.linha : a.data.localeCompare(b.data) || a.linha - b.linha;
  });
  if (!ls.length) {
    ul.append(el('li', { class: 'vazio' }, st.lista === 'aberto' && !q ? 'Nada em aberto. Tudo pago e recebido.' : 'Nenhum lançamento encontrado.'));
    return;
  }
  for (const l of ls) {
    const m = diaMes(l.data);
    const entrada = l.tipo === 'Entrada';
    const meta = [el('span', { class: `tag ${l.conta}` }, l.conta), l.categoria];
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
  else pista.append(el('b', {}, `${r.tipo} de ${brl(r.valor)}`), ` em ${r.conta}, ${r.categoria}`, r.data ? `, ${diaMes(r.data).dia} ${diaMes(r.data).mes}` : '', '.', auto.pistas.length && !Object.keys(st.ajustes).length ? ` ${auto.pistas[auto.pistas.length - 1]}.` : '', ' Enter para lançar.');
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
  };
  await rodar(async () => {
    await api('adicionar', { lancamento });
    $('#q').value = '';
    st.ajustes = {};
  }, `Lançado: ${r.descricao}, ${brl(r.valor)} (${r.conta}).`);
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
  st.cfg = null; st.lancs = []; demo = null;
  $('#dlg-ajustes').close();
  mostrar();
});

$('#btn-copiar-codigo').addEventListener('click', async () => {
  try {
    const codigo = await (await fetch('apps-script/Codigo.gs')).text();
    await navigator.clipboard.writeText(codigo);
    aviso('Código copiado. Cole no Apps Script.');
  } catch {
    window.open('apps-script/Codigo.gs', '_blank', 'noopener');
  }
});

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
