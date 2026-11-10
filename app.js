// Tela. A lógica (projeção, assistente, edição) está em logic.js.
const $ = s => document.querySelector(s);
const brl = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dm = d => d.slice(8) + '/' + d.slice(5, 7);
const dt = (d, opt) => new Date(d + 'T12:00').toLocaleDateString('pt-BR', opt);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const centavos = input => Math.round(input.valueAsNumber * 100);

let st = { nome: '', itens: [] };
try { st = JSON.parse(localStorage.getItem('contas')) || st; } catch {}
st.cartoes ??= [];
let ult;               // última situação calculada
let verTudo = false;   // extrato: mostrar meses anteriores
let edit = null;       // { id, k, rep } do lançamento em edição
let compra = null;     // última simulação de "posso comprar"
const SUGESTOES = ['Casa', 'Condomínio', 'Luz', 'Água', 'Gás', 'Telefone', 'Internet', 'Escola', 'Plano de saúde', 'Streaming'];

function salvar() {
  localStorage.setItem('contas', JSON.stringify(st));
  render();
}

function fala(s) {
  let t;
  if (s.saldo < 0) {
    t = `você está ${brl(-s.saldo)} no negativo. `;
    t += !s.volta ? 'Pela projeção, não volta ao positivo nos próximos 12 meses.'
      : `Volta ao positivo em ${dm(s.volta)}` + (s.recai ? `, mas fica negativo de novo em ${dm(s.recai)}.` : '.');
    if (s.piorDia !== s.dias[0].data) t += ` O ponto mais baixo é ${brl(-s.falta)} em ${dm(s.piorDia)}.`;
  } else if (s.negativoEm) {
    t = `você precisa arranjar ${brl(s.falta)} até ${dm(s.negativoEm)}, senão fica negativo.`;
  } else if (s.sai > s.entra) {
    t = `este mês sai ${brl(s.sai - s.entra)} a mais do que entra. O saldo aguenta, mas fique de olho.`;
  } else {
    t = 'tudo no verde pelos próximos 12 meses.';
  }
  return st.nome ? `${st.nome}, ${t}` : t[0].toUpperCase() + t.slice(1);
}

function grafico(dias) {
  const p = dias.slice(0, 183), vs = p.map(d => d.saldo);
  const lo = Math.min(0, ...vs), amp = (Math.max(0, ...vs) - lo) || 1, W = 300, H = 70;
  const y = v => (H - ((v - lo) / amp) * H).toFixed(1);
  const pts = p.map((d, i) => `${((i / (p.length - 1)) * W).toFixed(1)},${y(d.saldo)}`).join(' ');
  return `<svg viewBox="0 -3 ${W} ${H + 6}" preserveAspectRatio="none" role="img" aria-label="Saldo projetado para os próximos 6 meses">
    <line class="zero" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/><polyline points="${pts}"/></svg>`;
}

const linha = (o, comData) => `<button class="lin" data-id="${esc(o.id)}" data-k="${o.k}">
  <span>${comData ? `<small>${dm(o.data)}</small>` : ''}${esc(o.nome)}${o.cartaoId ? `<small class="tag">${esc(o.cartaoNome)}, compra em ${dm(o.compra)}</small>` : ''}</span>
  <b class="${o.valor < 0 ? 'neg' : 'pos'}">${brl(o.valor)}</b></button>`;

function extrato(ocs, hoje) {
  const de = verTudo ? '' : hoje.slice(0, 8) + '01';
  const dias = new Map();
  let s = 0;
  for (const o of ocs) {
    s += o.valor;
    if (!dias.has(o.data)) dias.set(o.data, { l: [] });
    const g = dias.get(o.data);
    g.l.push(o);
    g.saldo = s;
  }
  let html = '';
  for (const [d, g] of dias) {
    if (d < de) continue;
    html += `<div class="${d < hoje ? 'passado' : ''}">
      <div class="dia ${d === hoje ? 'eh-hoje' : ''}"><span>${dt(d, { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
      <span class="${g.saldo < 0 ? 'neg' : 'pos'}">${brl(g.saldo)}</span></div>${g.l.map(o => linha(o)).join('')}</div>`;
  }
  return html || '<p class="vazio">Nada lançado ainda. Toque em "+ Lançar" para começar.</p>';
}

function render() {
  const hoje = hojeISO(), s = (ult = situacao(st.itens, hoje, 12, st.cartoes));
  const estado = s.saldo < 0 ? 'vermelho' : s.negativoEm || s.sai > s.entra ? 'atencao' : 'verde';
  $('#hero').dataset.estado = estado;
  $('meta[name=theme-color]').content = { verde: '#14532d', atencao: '#7a4f00', vermelho: '#8f1d18' }[estado];
  $('#hoje').textContent = dt(hoje, { weekday: 'long', day: 'numeric', month: 'long' });
  $('#saldo').textContent = brl(s.saldo);
  $('#fala').textContent = fala(s);
  $('#graf').innerHTML = grafico(s.dias);

  const mes = dt(hoje, { month: 'long' }), max = Math.max(s.entra, s.sai, 1);
  $('#mes').textContent = mes[0].toUpperCase() + mes.slice(1);
  $('#bEntra').style.width = (s.entra / max) * 100 + '%';
  $('#bSai').style.width = (s.sai / max) * 100 + '%';
  $('#vEntra').textContent = brl(s.entra);
  $('#vSai').textContent = brl(s.sai);
  $('#difMes').textContent = s.sai > s.entra ? `Sai ${brl(s.sai - s.entra)} a mais do que entra.`
    : s.entra > s.sai ? `Sobra ${brl(s.entra - s.sai)} no mês.` : '';

  const prox = s.ocs.filter(o => o.data > hoje).slice(0, 6);
  $('#proximos').innerHTML = prox.map(o => linha(o, true)).join('') || '<p class="vazio">Nenhum lançamento futuro.</p>';
  $('#lista').innerHTML = extrato(s.ocs, hoje);
  $('#anteriores').textContent = verTudo ? 'Esconder meses anteriores' : 'Mostrar meses anteriores';
  $('#nomes').innerHTML = [...new Set(st.itens.filter(i => !i.aj).map(i => i.nome))].map(n => `<option value="${esc(n)}">`).join('');
  $('#nome').value = st.nome;

  // Custos fixos = saídas que repetem todo mês sem data para acabar
  const semFim = st.itens.filter(i => i.rep && i.n == null);
  const fixos = semFim.filter(i => i.valor < 0).sort((a, b) => a.data.slice(8) - b.data.slice(8));
  const totalF = fixos.reduce((a, i) => a - i.valor, 0);
  const rendaF = semFim.reduce((a, i) => a + Math.max(i.valor, 0), 0);
  $('#totalFixos').textContent = brl(totalF) + ' por mês';
  $('#pctFixos').textContent = !fixos.length ? 'Nenhum custo fixo cadastrado ainda. Escolha um abaixo para começar.'
    : rendaF ? `Isso é ${Math.round((totalF / rendaF) * 100)}% das suas entradas fixas (${brl(rendaF)} por mês).`
    : 'Lance também o salário como entrada com "Todo mês" para ver quanto os custos fixos pesam.';
  const inicioMes = hoje.slice(0, 8) + '01';
  $('#listaFixos').innerHTML = fixos.map(i => {
    const o = s.ocs.find(o => o.id === i.id && (o.compra ?? o.data) >= inicioMes); // ocorrência deste mês (ou a próxima)
    return !o ? '' : `<button class="lin" data-id="${esc(i.id)}" data-k="${o.k}" data-escopo="diante">
      <span>${esc(i.nome)}<small class="tag">todo dia ${+i.data.slice(8)}${o.cartaoNome ? ', no ' + esc(o.cartaoNome) : ''}</small></span>
      <b class="neg">${brl(i.valor)}</b></button>`;
  }).join('');
  const tem = new Set(fixos.map(i => i.nome.toLowerCase()));
  $('#sugestoes').innerHTML = SUGESTOES.filter(n => !tem.has(n.toLowerCase())).concat('Outro')
    .map(n => `<button class="chip" data-sug="${n}">+ ${n}</button>`).join('');

  // Cartões: próxima fatura de cada um, lista em "Mais" e opções de "Pagar com"
  $('#blocoFaturas').hidden = $('#comprarCartao').hidden = !st.cartoes.length;
  $('#faturas').innerHTML = st.cartoes.map(c => {
    const prox = s.ocs.filter(o => o.cartaoId === c.id && o.data >= hoje);
    if (!prox.length) return `<div class="fat"><span>${esc(c.nome)}</span><small>sem compras</small></div>`;
    const total = prox.filter(o => o.data === prox[0].data).reduce((a, o) => a + o.valor, 0);
    return `<div class="fat"><span><small>vence ${dm(prox[0].data)}</small>${esc(c.nome)}</span><b class="neg">${brl(total)}</b></div>`;
  }).join('');
  $('#listaCartoes').innerHTML = st.cartoes.map(c =>
    `<button class="fat" data-c="${esc(c.id)}"><span>${esc(c.nome)}</span><small>fecha dia ${c.fecha}, vence dia ${c.vence}</small></button>`).join('');
  const opts = '<option value="">Conta (débito, Pix, dinheiro)</option>' + st.cartoes.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('');
  for (const sel of document.querySelectorAll('select[name=cartao]')) { const v = sel.value; sel.innerHTML = opts; sel.value = v; if (sel.selectedIndex < 0) sel.value = ''; }
}

// ---- Lançar / editar ----
const f = $('#f'), dlg = $('#dlg');

function abrir(o, escopo = 'um') { // o: ocorrência existente (com id) ou pré-preenchimento
  f.reset();
  f.escopo.value = escopo;
  const it = o?.id && st.itens.find(i => i.id === o.id);
  edit = it ? { id: it.id, k: o.k, rep: !!it.rep } : null;
  f.tipo.value = (o?.valor ?? -1) < 0 ? 's' : 'e';
  f.nome.value = o?.nome ?? '';
  f.valor.value = o?.valor ? (Math.abs(o.valor) / 100).toFixed(2) : '';
  f.data.value = it ? it.data : hojeISO(); // no cartão, a data é a da compra, não a do vencimento
  f.cartao.value = (it ? it.cartao : o?.cartao) ?? '';
  if (f.cartao.selectedIndex < 0) f.cartao.value = '';
  $('#campoCartao').hidden = !st.cartoes.length || !!it?.rep;
  f.rep.value = o?.rep ?? 'n';
  f.n.value = o?.n ?? 2;
  $('#dlgTitulo').textContent = edit ? 'Editar lançamento' : 'Novo lançamento';
  $('#camposNovo').hidden = !!edit;
  $('#campoN').hidden = f.rep.value !== 'p';
  $('#campoEscopo').hidden = !edit?.rep;
  $('#campoData').hidden = !!edit?.rep;
  $('#excluir').hidden = !edit;
  dlg.showModal();
}

f.rep.onchange = () => ($('#campoN').hidden = f.rep.value !== 'p');
$('#cancelar').onclick = () => dlg.close();
$('#novoBtn').onclick = () => abrir();

f.onsubmit = () => {
  const novo = { nome: f.nome.value.trim(), valor: centavos(f.valor) * (f.tipo.value === 's' ? -1 : 1) };
  if (!edit?.rep) novo.cartao = f.cartao.value || undefined; // série repetida mantém o cartão que já tinha
  if (!edit) {
    const rep = f.rep.value;
    st.itens.push({ id: novoId(), ...novo, data: f.data.value, rep: rep !== 'n', n: rep === 'p' ? Math.max(2, +f.n.value || 2) : null });
  } else {
    if (!edit.rep) novo.data = f.data.value;
    st.itens = editar(st.itens, edit.id, edit.k, f.escopo.value, novo);
  }
  salvar();
};

$('#excluir').onclick = () => {
  st.itens = editar(st.itens, edit.id, edit.k, f.escopo.value, null);
  dlg.close();
  salvar();
};

document.addEventListener('click', e => {
  const b = e.target.closest('.lin');
  if (b) return abrir(ult.ocs.find(o => o.id === b.dataset.id && o.k === +b.dataset.k), b.dataset.escopo);
  const sug = e.target.closest('[data-sug]')?.dataset.sug;
  if (sug) abrir({ nome: sug === 'Outro' ? '' : sug, rep: 'm' });
});

// ---- Posso comprar? ----
$('#comprar').onsubmit = e => {
  e.preventDefault();
  const cartao = e.target.cartao.value || undefined;
  const valor = centavos(e.target.valor), r = possoComprar(st.itens, hojeISO(), valor, 12, st.cartoes, cartao);
  compra = r.ok ? { valor: -r.parcela, rep: r.n > 1 ? 'p' : 'n', n: r.n, cartao } : null;
  $('#lancarCompra').hidden = !compra;
  $('#resposta').textContent =
    r.jaNegativo ? `Melhor não agora: já existem dias no negativo pela frente (o pior é ${brl(-r.falta)} em ${dm(r.piorDia)}), e qualquer compra aprofunda isso. Se for inevitável, em ${r.n}x seriam ${brl(r.parcela)} por mês.`
    : !r.ok ? `Não cabe nem em 12x: faltariam ${brl(r.falta)} em ${dm(r.negativoEm)}.`
    : r.n === 1 ? `Pode comprar à vista: ${brl(valor)} cabem sem nenhum dia no negativo.`
    : `Parcele em ${r.n}x de ${brl(r.parcela)}. Com menos parcelas, algum dia fica no negativo.`;
};
$('#lancarCompra').onclick = () => abrir(compra);

// ---- Navegação ----
document.querySelectorAll('nav [data-v]').forEach(b => (b.onclick = () => {
  document.querySelectorAll('main > section').forEach(s => (s.hidden = s.id !== b.dataset.v));
  document.querySelectorAll('nav [data-v]').forEach(x => x.toggleAttribute('aria-current', x === b));
  scrollTo(0, 0);
}));
$('#anteriores').onclick = () => { verTudo = !verTudo; render(); };

// ---- Cartões ----
const fc = $('#fc');
function editarCartao(c) {
  fc.reset();
  fc.dataset.id = c?.id ?? '';
  if (c) { fc.nome.value = c.nome; fc.fecha.value = c.fecha; fc.vence.value = c.vence; }
  $('#fcTitulo').textContent = c ? 'Editar cartão' : 'Novo cartão';
  $('#excluirCartao').hidden = !c;
}
fc.onsubmit = e => {
  e.preventDefault();
  const c = { id: fc.dataset.id || novoId(), nome: fc.nome.value.trim(), fecha: +fc.fecha.value, vence: +fc.vence.value };
  st.cartoes = st.cartoes.some(x => x.id === c.id) ? st.cartoes.map(x => (x.id === c.id ? c : x)) : [...st.cartoes, c];
  editarCartao();
  salvar();
};
$('#excluirCartao').onclick = () => {
  if (!confirm('Excluir este cartão? As compras lançadas nele continuam no extrato, mas passam a contar na data da compra.')) return;
  st.cartoes = st.cartoes.filter(x => x.id !== fc.dataset.id);
  editarCartao();
  salvar();
};
$('#listaCartoes').onclick = e => {
  const b = e.target.closest('[data-c]');
  if (b) { editarCartao(st.cartoes.find(c => c.id === b.dataset.c)); fc.nome.focus(); }
};

// ---- Mais ----
$('#nome').onchange = e => { st.nome = e.target.value.trim(); salvar(); };

$('#acertar').onsubmit = e => {
  e.preventDefault();
  const dif = centavos(e.target.real) - ult.saldo;
  if (dif) st.itens.push({ id: novoId(), nome: 'Ajuste de saldo', valor: dif, data: hojeISO(), aj: true });
  e.target.reset();
  salvar();
};

$('#baixar').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(st)], { type: 'application/json' }));
  a.download = `saldo-backup-${hojeISO()}.json`;
  a.click();
};
$('#restaurarBtn').onclick = () => $('#restaurar').click();
$('#restaurar').onchange = async e => {
  try {
    const d = JSON.parse(await e.target.files[0].text());
    const ok = Array.isArray(d.itens) && d.itens.every(i =>
      typeof i.id === 'string' && typeof i.nome === 'string' && Number.isInteger(i.valor) && /^\d{4}-\d\d-\d\d$/.test(i.data));
    if (!ok) throw 0;
    if (confirm(`Substituir os dados atuais pelos ${d.itens.length} lançamentos do backup?`)) {
      const cartoes = (Array.isArray(d.cartoes) ? d.cartoes : []).filter(c =>
        typeof c.id === 'string' && typeof c.nome === 'string' && Number.isInteger(c.fecha) && Number.isInteger(c.vence));
      st = { nome: String(d.nome || ''), itens: d.itens, cartoes };
      salvar();
    }
  } catch { alert('Este arquivo não é um backup válido do app.'); }
  e.target.value = '';
};

// ---- Primeiro uso ----
$('#fb').onsubmit = e => {
  st.nome = e.target.nome.value.trim();
  const v = centavos(e.target.saldo);
  if (v) st.itens.push({ id: novoId(), nome: 'Saldo inicial', valor: v, data: hojeISO(), aj: true });
  salvar();
};
$('#boas').oncancel = e => e.preventDefault();

render();
if (!st.nome && !st.itens.length) $('#boas').showModal();
document.addEventListener('visibilitychange', () => document.hidden || render()); // virou o dia com o app aberto
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
navigator.storage?.persist?.();
