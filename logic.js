// Lógica pura do app. Valores em centavos (inteiros), datas como 'AAAA-MM-DD'.
// Item: { id, nome, valor, data, rep, n, ex, aj }
//   rep: repete todo mês | n: nº de ocorrências (null = sem fim)
//   ex: { 'AAAA-MM': valor } valor diferente só naquele mês (0 = pula o mês)
//   aj: saldo inicial / ajuste (fica fora dos totais do mês)

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hojeISO = () => iso(new Date());
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function somaDias(data, n) {
  const [y, m, d] = data.split('-').map(Number);
  return iso(new Date(y, m - 1, d + n));
}

// Mesmo dia, k meses depois; dia 31 vira o último dia em meses mais curtos.
const noMes = (y, m0, dia) => iso(new Date(y, m0, Math.min(dia, new Date(y, m0 + 1, 0).getDate())));
function somaMeses(data, k) {
  const [y, m, d] = data.split('-').map(Number);
  return noMes(y, m - 1 + k, d);
}

// Cartão: { id, nome, fecha, vence } (dias do mês).
// Dia em que uma compra no cartão sai da conta = vencimento da fatura em que ela cai.
// Compra no dia do fechamento já vai para a fatura seguinte ("melhor dia de compra").
function vencimentoFatura(data, c) {
  const [y, m, d] = data.split('-').map(Number);
  const fechaEm = m - 1 + (d < c.fecha ? 0 : 1);            // mês em que a fatura fecha
  return noMes(y, fechaEm + (c.vence > c.fecha ? 0 : 1), c.vence); // vence no mesmo mês ou no seguinte
}

// Todos os lançamentos (únicos e repetidos) até a data `ate`, em ordem.
// Compras no cartão aparecem na data do vencimento da fatura; `compra` guarda a data original.
function ocorrencias(itens, ate, cartoes = []) {
  const out = [];
  for (const it of itens) {
    const c = it.cartao && cartoes.find(c => c.id === it.cartao);
    const max = it.rep ? (it.n ?? Infinity) : 1;
    for (let k = 0; k < max; k++) {
      const data = somaMeses(it.data, k);
      if (data > ate) break;
      const valor = it.ex?.[data.slice(0, 7)] ?? it.valor;
      if (!valor) continue;
      const o = { data, valor, nome: it.nome, id: it.id, k, aj: !!it.aj };
      if (c) Object.assign(o, { data: vencimentoFatura(data, c), compra: data, cartaoId: c.id, cartaoNome: c.nome });
      out.push(o);
    }
  }
  return out.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

// Saldo ao fim de cada dia, de `de` até `ate`.
function saldos(ocs, de, ate) {
  let s = 0, i = 0;
  const out = [];
  while (i < ocs.length && ocs[i].data < de) s += ocs[i++].valor;
  for (let d = de; d <= ate; d = somaDias(d, 1)) {
    while (i < ocs.length && ocs[i].data === d) s += ocs[i++].valor;
    out.push({ data: d, saldo: s });
  }
  return out;
}

// Retrato de hoje + projeção.
//   saldo, dias, ocs, entra/sai (mês atual)
//   negativoEm, falta, piorDia: próximo trecho negativo e quanto falta para cobri-lo
//   volta, recai: só quando hoje já está negativo
function situacao(itens, hoje, meses = 12, cartoes = []) {
  const ate = somaMeses(hoje, meses);
  const ocs = ocorrencias(itens, ate, cartoes);
  const dias = saldos(ocs, hoje, ate);
  const r = { saldo: dias[0].saldo, dias, ocs, entra: 0, sai: 0 };

  const i = dias.findIndex(d => d.saldo < 0);
  if (i >= 0) {
    let pior = dias[i];
    for (let j = i; j < dias.length && dias[j].saldo < 0; j++) if (dias[j].saldo < pior.saldo) pior = dias[j];
    r.negativoEm = dias[i].data;
    r.falta = -pior.saldo;
    r.piorDia = pior.data;
  }
  if (r.saldo < 0) {
    r.volta = dias.find(d => d.saldo >= 0)?.data ?? null;
    r.recai = r.volta ? dias.find(d => d.data > r.volta && d.saldo < 0)?.data ?? null : null;
  }
  const ym = hoje.slice(0, 7);
  for (const o of ocs) {
    if (o.aj || o.data.slice(0, 7) !== ym) continue;
    if (o.valor > 0) r.entra += o.valor; else r.sai -= o.valor;
  }
  return r;
}

// "Posso comprar algo de X?" → menor nº de parcelas que não deixa nenhum dia negativo.
// Sem cartão a 1ª parcela sai hoje; com `cartao` (id), cada parcela sai no vencimento da fatura.
function possoComprar(itens, hoje, valor, max = 12, cartoes = [], cartao) {
  const base = situacao(itens, hoje, 12, cartoes);
  if (base.negativoEm) {
    const pior = base.dias.reduce((a, b) => (b.saldo < a.saldo ? b : a)); // pior dia de toda a projeção
    return { ok: false, jaNegativo: true, falta: -pior.saldo, piorDia: pior.data, n: max, parcela: Math.round(valor / max) };
  }
  let s;
  for (let n = 1; n <= max; n++) {
    // ponytail: arredonda cada parcela; a soma pode diferir do total por centavos
    const parcela = Math.round(valor / n);
    s = situacao([...itens, { id: 'sim', nome: '', valor: -parcela, data: hoje, rep: true, n, cartao }], hoje, 12, cartoes);
    if (!s.negativoEm) return { ok: true, n, parcela };
  }
  return { ok: false, falta: s.falta, negativoEm: s.negativoEm };
}

// Edita ou exclui (novo = null) a ocorrência k de um item. Devolve a nova lista.
//   escopo 'um': só aquele mês (só o valor) | 'diante': daquele mês em diante
function editar(itens, id, k, escopo, novo) {
  const it = itens.find(i => i.id === id);
  if (!it) return itens;
  if (!it.rep || (escopo === 'diante' && k === 0))
    return novo ? itens.map(i => (i === it ? { ...it, ...novo } : i)) : itens.filter(i => i !== it);
  const data = somaMeses(it.data, k);
  if (escopo === 'um')
    return itens.map(i => (i === it ? { ...it, ex: { ...it.ex, [data.slice(0, 7)]: novo ? novo.valor : 0 } } : i));
  // 'diante': encerra a série antiga em k e abre outra a partir daqui
  // ponytail: a nova série herda o dia já ajustado (31 → 28 em fev fica 28 dali em diante)
  const resto = novo ? [{ ...it, ...novo, id: novoId(), data, n: it.n == null ? null : it.n - k }] : [];
  return itens.flatMap(i => (i === it ? [{ ...it, n: k }, ...resto] : [i]));
}

if (typeof module !== 'undefined')
  module.exports = { somaDias, somaMeses, vencimentoFatura, ocorrencias, saldos, situacao, possoComprar, editar };
