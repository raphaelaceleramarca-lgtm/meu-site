// Dados fictícios para ver o site sem conectar uma planilha.
export function dadosExemplo(hoje = new Date()) {
  const a = hoje.getFullYear();
  const m = String(hoje.getMonth() + 1).padStart(2, '0');
  const d = (dia) => `${a}-${m}-${String(dia).padStart(2, '0')}`;
  const linhas = [
    [d(5), 'Entrada', 'Receitas', 'Cliente Alfa', 4200, 4200, 'Pago/Recebido', '', 'PJ'],
    [d(15), 'Entrada', 'Receitas', 'Cliente Beta', 2800, null, 'Previsto', '', 'PJ'],
    [d(20), 'Entrada', 'Receitas', 'Consultoria', 1500, null, 'Previsto', '1ª parcela', 'PJ'],
    [d(2), 'Saída', 'Assinaturas', 'Spotify', 23.9, 23.9, 'Pago/Recebido', '', 'PF'],
    [d(5), 'Saída', 'Moradia', 'Aluguel', 2100, 2100, 'Pago/Recebido', '', 'PF'],
    [d(10), 'Saída', 'Moradia', 'Luz', 260, null, 'Previsto', '', 'PF'],
    [d(10), 'Saída', 'Moradia', 'Internet', 99, null, 'Previsto', '', 'PF'],
    [d(12), 'Saída', 'Cartões', 'Fatura do cartão', 1350, null, 'Previsto', '', 'PF'],
    [d(14), 'Saída', 'Assinaturas', 'ChatGPT', 100, null, 'Previsto', '', 'PJ'],
    [d(20), 'Saída', 'Impostos', 'DAS', 210, null, 'Previsto', '', 'PJ'],
    [d(22), 'Saída', 'Marketing', 'Anúncios', 600, null, 'Previsto', '', 'PJ'],
    [d(25), 'Saída', 'Saúde e bem-estar', 'Plano de saúde', 480, null, 'Previsto', '', 'PF'],
    [null, 'Saída', 'Alimentação', 'Mercado', 1400, null, 'Previsto', 'Sem data definida', 'PF'],
  ];
  return linhas.map(([data, tipo, categoria, descricao, previsto, realizado, status, observacao, conta], i) => (
    { linha: i + 2, data, tipo, categoria, descricao, previsto, realizado, status, observacao, conta }
  ));
}
