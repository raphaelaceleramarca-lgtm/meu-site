// Dados fictícios para ver o site sem conectar uma planilha.
export function dadosExemplo(hoje = new Date()) {
  const a = hoje.getFullYear();
  const m = String(hoje.getMonth() + 1).padStart(2, '0');
  const d = (dia) => `${a}-${m}-${String(dia).padStart(2, '0')}`;
  const ant = new Date(a, hoje.getMonth() - 1, 1);
  const da = (dia) => `${ant.getFullYear()}-${String(ant.getMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  const linhas = [
    [d(5), 'Entrada', 'Receitas', 'Cliente Alfa', 4200, 4200, 'Pago/Recebido', '', 'PJ'],
    [d(15), 'Entrada', 'Receitas', 'Cliente Beta', 2800, null, 'Previsto', '', 'PJ'],
    [d(20), 'Entrada', 'Receitas', 'Consultoria', 1500, null, 'Previsto', '1ª parcela', 'PJ'],
    [d(2), 'Saída', 'Assinaturas', 'Spotify', 23.9, 23.9, 'Pago/Recebido', '', 'PF'],
    [d(5), 'Saída', 'Moradia', 'Aluguel', 2100, 2100, 'Pago/Recebido', '', 'PF'],
    [d(10), 'Saída', 'Moradia', 'Luz', 260, null, 'Previsto', '', 'PF'],
    [d(10), 'Saída', 'Moradia', 'Internet', 99, null, 'Previsto', '', 'PF'],
    [d(5), 'Saída', 'Cartões', 'Fatura Bradesco', 1350, null, 'Previsto', '', 'PF', 'Bradesco'],
    [d(6), 'Saída', 'Alimentação', 'Restaurante', 180, null, 'Previsto', 'Compra em 20/' + String(ant.getMonth() + 1).padStart(2, '0'), 'PF', 'Infinity Pay'],
    [d(6), 'Saída', 'Assinaturas', 'Google Workspace', 80.61, null, 'Previsto', '', 'PJ', 'Infinity Pay'],
    [d(5), 'Saída', 'Transporte', 'Uber', 42.5, 42.5, 'Pago/Recebido', '', 'PF', 'C6 Bank'],
    [d(14), 'Saída', 'Assinaturas', 'ChatGPT', 100, null, 'Previsto', '', 'PJ'],
    [d(20), 'Saída', 'Impostos', 'DAS', 210, null, 'Previsto', '', 'PJ'],
    [d(22), 'Saída', 'Marketing', 'Anúncios', 600, null, 'Previsto', '', 'PJ'],
    [d(25), 'Saída', 'Saúde e bem-estar', 'Plano de saúde', 480, null, 'Previsto', '', 'PF'],
    [null, 'Saída', 'Alimentação', 'Mercado', 1400, null, 'Previsto', 'Sem data definida', 'PF'],
    [da(5), 'Entrada', 'Receitas', 'Cliente Alfa', 4200, 4200, 'Pago/Recebido', '', 'PJ'],
    [da(5), 'Saída', 'Moradia', 'Aluguel', 2100, 2100, 'Pago/Recebido', '', 'PF'],
    [da(5), 'Saída', 'Cartões', 'Fatura Bradesco', 1180, 1180, 'Pago/Recebido', '', 'PF', 'Bradesco'],
    [da(20), 'Saída', 'Impostos', 'DAS', 210, 210, 'Pago/Recebido', '', 'PJ'],
  ];
  return linhas.map(([data, tipo, categoria, descricao, previsto, realizado, status, observacao, conta, cartao = ''], i) => (
    { linha: i + 2, data, tipo, categoria, descricao, previsto, realizado, status, observacao, conta, cartao }
  ));
}

export function investimentosExemplo(hoje = new Date()) {
  const data = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
  return [
    ['Reserva no CDB', 'Reserva de emergência', 'Banco A', 'PF', 8000, 8420],
    ['Tesouro Selic', 'Tesouro Direto', 'Corretora B', 'PF', 5000, 5310],
    ['Ações', 'Ações', 'Corretora B', 'PF', 3000, 2780],
    ['Caixa da empresa', 'Renda fixa', 'Banco C', 'PJ', 10000, 10350],
  ].map(([nome, tipo, instituicao, conta, aplicado, saldo], i) => (
    { linha: i + 2, data, nome, tipo, instituicao, conta, aplicado, saldo, observacao: '' }
  ));
}
