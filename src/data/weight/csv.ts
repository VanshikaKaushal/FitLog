import { isCalendarDate } from '../nutrition'
import { activeAverage } from './calculations'
import { fromKg, toKg, validWeight, type WeightEntry, type WeightUnit } from './model'

const header = ['Date', 'Recorded', 'Moving Average']
export interface WeightCsvRow { date: string; recorded: number; average: number | null }

// Split only outside quotes, preserving quoted line endings and escaped quotes.
function parseFields(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let state: 'plain' | 'quoted' | 'closed' = 'plain'
  const commit = () => { row.push(field.trim()); field = ''; state = 'plain' }
  const end = () => { commit(); if (row.some(Boolean) || row.length > 1) rows.push(row); row = [] }
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (state === 'quoted') {
      if (char !== '"') field += char
      else if (input[i + 1] === '"') { field += '"'; i++ }
      else state = 'closed'
    } else if (char === ',') commit()
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && input[i + 1] === '\n') i++
      end()
    } else if (char === '"' && state === 'plain' && !field.trim()) {
      field = ''
      state = 'quoted'
    } else if (char === '"' || (state === 'closed' && !/\s/.test(char))) {
      throw new Error('Malformed CSV quoting.')
    } else if (state === 'plain') field += char
  }
  if (state === 'quoted') throw new Error('A quoted CSV field is incomplete.')
  end()
  return rows
}

export function parseWeightCsv(text: string, unit: WeightUnit) {
  const [columns, ...rows] = parseFields(text.replace(/^\uFEFF/, ''))
  if (!columns || columns.length !== 3 || !header.every((name, i) => columns[i] === name)) {
    throw new Error('Use the header Date,Recorded,Moving Average.')
  }
  const numeric = (text: string) => /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : NaN
  const dates = new Map<string, WeightCsvRow>()
  const duplicateDates = new Set<string>()
  let withAverage = 0
  for (const [i, row] of rows.entries()) {
    const [date, raw, trend] = row
    const recorded = numeric(raw ?? '')
    const average = trend === '' ? null : numeric(trend ?? '')
    if (row.length !== 3 || !isCalendarDate(date) || !validWeight(toKg(recorded, unit))
      || (average !== null && !validWeight(toKg(average, unit)))) {
      throw new Error('Invalid date or weight on CSV record ' + (i + 2) + '.')
    }
    if (average !== null) withAverage++
    if (dates.has(date)) duplicateDates.add(date)
    dates.set(date, { date, recorded, average })
  }
  if (!dates.size) throw new Error('The CSV has no weigh-ins.')
  const entries = [...dates.values()].sort((a, b) => a.date.localeCompare(b.date))
  return { entries, rowCount: rows.length, withAverage, duplicateDates: [...duplicateDates].sort() }
}

export function weightCsv(entries: WeightEntry[], unit: WeightUnit) {
  const decimals = (weight: number) => {
    const value = fromKg(weight, unit)
    const text = String(value)
    if (!/[eE]/.test(text)) return text
    const [mantissa, exponent] = text.split('e')
    const point = (mantissa.indexOf('.') === -1 ? mantissa.length : mantissa.indexOf('.')) + Number(exponent)
    const digits = mantissa.replace('.', '')
    if (point <= 0) return '0.' + '0'.repeat(-point) + digits
    return point >= digits.length ? digits.padEnd(point, '0') : digits.slice(0, point) + '.' + digits.slice(point)
  }
  return [header.join(','), ...entries.slice().sort((a, b) => a.date.localeCompare(b.date)).map(entry =>
    [entry.date, decimals(entry.recordedKg), decimals(entry.importedAverageKg ?? activeAverage(entry))].join(','))].join('\r\n') + '\r\n'
}
