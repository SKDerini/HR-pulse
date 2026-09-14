import XLSX from 'xlsx-js-style';

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function normalizeFullName(value) {
  return String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function monthDate(period, day) {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(year, month - 1, Number(day));
  if (date.getFullYear() !== year || date.getMonth() !== month - 1) return '';
  return `${period}-${String(day).padStart(2, '0')}`;
}

function parseExcelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const text = String(value || '').trim();
  let match = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function findHeader(rows) {
  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const normalized = rows[index].map(cell => String(cell || '').trim().toLocaleLowerCase('ru-RU'));
    const fioIndex = normalized.findIndex(cell => /(^|\s)(фио|ф\.и\.о|сотрудник|фамилия)(\s|$)/i.test(cell));
    if (fioIndex < 0) continue;
    const dateIndex = normalized.findIndex(cell => /^дата(\s|$)/i.test(cell));
    const dayColumns = normalized
      .map((cell, column) => ({ cell, column, match: cell.match(/^([1-9]|[12]\d|3[01])(?:\s|$)/) }))
      .filter(item => item.match)
      .map(item => ({ day: Number(item.match[1]), column: item.column }));
    if (dateIndex >= 0 || dayColumns.length >= 5) return { rowIndex: index, fioIndex, dateIndex, dayColumns, normalized };
  }

  throw new Error('Не найдена строка заголовков с колонкой «ФИО» и датой либо днями месяца.');
}

function aggregateRows(items) {
  const map = new Map();
  items.forEach(item => {
    const key = `${normalizeFullName(item.fullName)}|${item.date}`;
    if (!item.date || !normalizeFullName(item.fullName)) return;
    const current = map.get(key) || { fullName: item.fullName, normalizedFullName: normalizeFullName(item.fullName), date: item.date, hours: '', events: 0 };
    current.events += Number(item.events || 1);
    if (item.hours !== '' && item.hours !== null && item.hours !== undefined) current.hours = Number(item.hours);
    map.set(key, current);
  });
  return [...map.values()];
}

export function parseSkudWorkbook(dataUrl, period) {
  if (!/^\d{4}-\d{2}$/.test(period || '')) throw new Error('Выберите месяц данных СКУД.');
  const base64 = String(dataUrl || '').replace(/^data:[^;]+;base64,/, '');
  if (!base64) throw new Error('Файл СКУД пуст.');
  const workbook = XLSX.read(base64, { type: 'base64', cellDates: true, raw: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', raw: true });
  const header = findHeader(rows);
  const dataRows = rows.slice(header.rowIndex + 1).filter(row => {
    const name = String(row[header.fioIndex] || '').trim();
    return name && !/^итого\s*:?$/i.test(name);
  });

  if (header.dayColumns.length >= 5) {
    const items = [];
    dataRows.forEach(row => {
      const fullName = String(row[header.fioIndex] || '').trim();
      header.dayColumns.forEach(({ day, column }) => {
        const count = Number(String(row[column] ?? '').replace(',', '.'));
        const date = monthDate(period, day);
        if (date && Number.isFinite(count) && count > 0) items.push({ fullName, date, hours: '', events: count });
      });
    });
    return { profile: 'Матрица количества входов', sourceRows: dataRows.length, rows: aggregateRows(items) };
  }

  const hourIndex = header.normalized.findIndex(cell => /(^|\s)(часы|отработано|длительность)(\s|$)/i.test(cell));
  const items = dataRows.map(row => ({
    fullName: String(row[header.fioIndex] || '').trim(),
    date: parseExcelDate(row[header.dateIndex]),
    hours: hourIndex >= 0 && row[hourIndex] !== '' ? Number(String(row[hourIndex]).replace(',', '.')) : '',
    events: 1
  })).filter(item => item.date.slice(0, 7) === period);
  if (!items.length) throw new Error(`В журнале нет записей за ${period}. Проверьте выбранный месяц.`);
  return { profile: 'Журнал событий', sourceRows: dataRows.length, rows: aggregateRows(items) };
}

function argb(hex) {
  const clean = String(hex || '#FFFFFF').replace('#', '').toUpperCase();
  return clean.length === 6 ? `FF${clean}` : clean;
}

function toBase64(bytes) {
  let binary = '';
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let offset = 0; offset < view.length; offset += 8192) {
    binary += String.fromCharCode(...view.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}

export function buildTimesheetWorkbook({ period, rows, days, codes }) {
  const codeMap = Object.fromEntries(codes.map(item => [item.code, item]));
  const heading = `ТАБЕЛЬ РАБОЧЕГО ВРЕМЕНИ ЗА ${period}`;
  const data = [
    [heading],
    [],
    ['ФИО', 'Табельный номер', 'Должность', ...days.map(item => item.day), 'Количество дней', 'Количество часов'],
    ...rows.map(row => {
      const workCells = row.cells.map(cell => cell.code || '');
      const workDays = row.cells.filter(cell => cell.code === 'Я').length;
      const workHours = row.cells.reduce((sum, cell) => sum + Number(cell.hours || 0), 0);
      return [row.fullName, row.timesheetNumber || '', row.position || '', ...workCells, workDays, workHours];
    })
  ];
  const sheet = XLSX.utils.aoa_to_sheet(data);
  const lastColumn = 3 + days.length + 2;
  sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: lastColumn - 1 } }];
  sheet['!cols'] = [{ wch: 34 }, { wch: 15 }, { wch: 26 }, ...days.map(() => ({ wch: 4.5 })), { wch: 15 }, { wch: 16 }];
  sheet['!rows'] = [{ hpt: 27 }, { hpt: 7 }, { hpt: 36 }];

  const border = { top: { style: 'thin', color: { rgb: 'FF9CA3AF' } }, bottom: { style: 'thin', color: { rgb: 'FF9CA3AF' } }, left: { style: 'thin', color: { rgb: 'FF9CA3AF' } }, right: { style: 'thin', color: { rgb: 'FF9CA3AF' } } };
  const titleCell = sheet.A1;
  titleCell.s = { font: { bold: true, sz: 14, color: { rgb: 'FF1F2937' } }, alignment: { horizontal: 'center', vertical: 'center' } };

  for (let column = 0; column < lastColumn; column += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 2, c: column })];
    cell.s = { font: { bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: column >= 3 && column < 3 + days.length && !days[column - 3].working ? 'FF6D7882' : 'FF1F4E78' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border };
  }
  rows.forEach((row, rowIndex) => {
    const excelRow = rowIndex + 3;
    for (let column = 0; column < lastColumn; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: excelRow, c: column })];
      if (!cell) continue;
      const dayIndex = column - 3;
      const code = dayIndex >= 0 && dayIndex < days.length ? row.cells[dayIndex]?.code : '';
      const color = codeMap[code]?.color || (dayIndex >= 0 && !days[dayIndex]?.working ? '#FFFFFF' : '#FFFFFF');
      cell.s = { border, alignment: { horizontal: column < 3 ? 'left' : 'center', vertical: 'center', wrapText: column < 3 }, fill: { patternType: 'solid', fgColor: { rgb: argb(color) } }, font: { bold: dayIndex >= 0 && dayIndex < days.length } };
    }
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Табель');
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', cellStyles: true });
  return { fileName: `Табель_${period}.xlsx`, mimeType: MIME, base64: toBase64(output), rows: rows.length, savedUrl: '' };
}
