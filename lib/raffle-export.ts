import ExcelJS from 'exceljs';
import type { RaffleResult, RaffleRoster, Participant } from './raffle-history';

export async function createRaffleWorkbook(history: RaffleResult[], roster: RaffleRoster) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sorteador';
  workbook.created = new Date();
  const drawn = history.flatMap(result => result.winners);
  const drawnIds = new Set(drawn.map(participant => participant.id));
  const allParticipants = new Map<string, Participant>();
  for (const participant of [...drawn, ...roster.participants]) allParticipants.set(participant.id, participant);

  function addSheet(name: string, description: string, headers: string[], widths: number[], data: ExcelJS.CellValue[][], statusColumn?: number) {
    const sheet = workbook.addWorksheet(name, {
      properties: { tabColor: { argb: name === 'Não aptos' ? 'FFF47920' : 'FF00995D' } },
      views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    });
    sheet.columns = widths.map(width => ({ width }));
    sheet.mergeCells(1, 1, 1, headers.length);
    sheet.getCell(1, 1).value = `SORTEADOR · ${name}`;
    sheet.getRow(1).height = 34;
    sheet.getRow(1).font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF006642' } };
    sheet.mergeCells(2, 1, 2, headers.length);
    sheet.getCell(2, 1).value = description;
    sheet.getRow(2).font = { name: 'Calibri', size: 11, color: { argb: 'FF52635A' } };
    sheet.getRow(2).height = 30;
    sheet.getRow(2).alignment = { vertical: 'middle', wrapText: true };
    sheet.getRow(4).values = headers;
    sheet.getRow(4).height = 28;
    sheet.getRow(4).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00995D' } };
    sheet.getRow(4).alignment = { vertical: 'middle', wrapText: true };
    for (const [index, values] of data.entries()) {
      const row = sheet.getRow(index + 5);
      row.values = values;
      const lines = Math.max(...values.map((value, column) => String(value ?? '').split('\n')
        .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / (widths[column] - 3))), 0)));
      row.height = Math.max(34, lines * 15 + 10);
      row.font = { name: 'Calibri', size: 11, color: { argb: 'FF334139' } };
      row.alignment = { vertical: 'middle', wrapText: true };
      row.eachCell({ includeEmpty: true }, cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 ? 'FFF1F6F3' : 'FFFFFFFF' } };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFDDE7E1' } } };
      });
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(1).numFmt = '0';
      if (statusColumn) {
        const cell = row.getCell(statusColumn);
        const yes = cell.value === 'Sim';
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yes ? 'FFDFF3E7' : 'FFF3F4F6' } };
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: yes ? 'FF006642' : 'FF52635A' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    }
    sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, data.length + 4), column: headers.length } };
    if (!data.length) {
      sheet.mergeCells(5, 1, 5, headers.length);
      sheet.getCell(5, 1).value = 'Nenhum registro nesta aba.';
      sheet.getRow(5).height = 28;
      sheet.getRow(5).font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF52635A' } };
    }
    sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:4' };
    return sheet;
  }

  addSheet('Ganhadores', `${drawn.length} ganhadores em ${history.length} sorteios. Horários de Manaus (UTC−4).`,
    ['Ordem', 'Nome completo', 'Setor', 'Sorteio', 'Data e hora', 'Identificador', 'Tipo'], [10, 46, 48, 12, 24, 30, 18],
    history.flatMap((result, index) => result.winners.map((winner, winnerIndex) => [
      result.startRank + winnerIndex, winner.name, winner.sector || '', index + 1,
      result.timestamp.toLocaleString('pt-BR', { timeZone: 'America/Manaus' }),
      winner.id,
      result.kind === 'final' ? 'Sorteio final' : 'Regular',
    ])));
  addSheet('Participantes', `${allParticipants.size} participantes aptos. A coluna Sorteado indica quem já foi contemplado.`,
    ['Nº', 'Nome completo', 'Setor', 'Sorteado', 'Identificador'], [10, 46, 48, 16, 30],
    [...allParticipants.values()].map((participant, index) => [index + 1, participant.name, participant.sector || '', drawnIds.has(participant.id) ? 'Sim' : 'Não', participant.id]), 4);
  addSheet('Não aptos', `${roster.ineligible.length} participantes excluídos. Regra: pagamento Aprovado e check-in Sim.`,
    ['Nº', 'Nome completo', 'Setor', 'Pagamento', 'Check-in', 'Motivo', 'Identificador'], [10, 46, 48, 20, 16, 58, 30],
    roster.ineligible.map((participant, index) => [index + 1, participant.name, participant.sector || '', participant.paymentStatus || 'Não informado', participant.checkIn || 'Não informado', participant.reason, participant.id]));
  // Keep stable identities for resuming without cluttering the visible report.
  for (const sheet of workbook.worksheets) {
    sheet.getRow(4).eachCell((cell, column) => { if (cell.value === 'Identificador') sheet.getColumn(column).hidden = true; });
  }
  return workbook;
}

export async function downloadRaffleXLSX(history: RaffleResult[], roster: RaffleRoster, signal?: AbortSignal) {
  if (!history.length) return;
  const workbook = await createRaffleWorkbook(history, roster);
  const buffer = await workbook.xlsx.writeBuffer();
  if (signal?.aborted) return;
  const blob = new Blob([new Uint8Array(buffer).buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sorteio_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

