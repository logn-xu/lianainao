// 日期与日历相关的工具方法
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

function formatDate(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate())
}

function formatTime(date) {
  return pad2(date.getHours()) + ':' + pad2(date.getMinutes())
}

function parseDate(str) {
  const parts = String(str).split('-')
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
}

function todayStr() {
  return formatDate(new Date())
}

function toUTC(str) {
  const parts = String(str).split('-')
  return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
}

// to - from 相差的天数
function dayDiff(fromStr, toStr) {
  return Math.round((toUTC(toStr) - toUTC(fromStr)) / 86400000)
}

function addDays(str, days) {
  const date = parseDate(str)
  date.setDate(date.getDate() + days)
  return formatDate(date)
}

function weekdayLabel(str) {
  return WEEK[parseDate(str).getDay()]
}

function shortDate(str) {
  const parts = String(str).split('-')
  return Number(parts[1]) + '月' + Number(parts[2]) + '日'
}

function relativeDayLabel(str) {
  const diff = dayDiff(str, todayStr())
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff === 2) return '前天'
  if (diff > 2 && diff < 7) return diff + '天前'
  return shortDate(str)
}

// 生成日历格子：heat 形如 { '2026-11-12': { level: 0-3, count, period } }
function buildMonthCells(year, month, heat) {
  const cells = []
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const total = new Date(year, month, 0).getDate()
  const today = todayStr()

  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ key: 'blank-' + i, day: 0, level: 0 })
  }
  for (let d = 1; d <= total; d++) {
    const dateStr = year + '-' + pad2(month) + '-' + pad2(d)
    const info = heat[dateStr]
    cells.push({
      key: dateStr,
      day: d,
      level: info ? info.level : 0,
      count: info ? info.count : 0,
      period: !!(info && info.period),
      today: dateStr === today
    })
  }
  while (cells.length % 7 !== 0) {
    cells.push({ key: 'tail-' + cells.length, day: 0, level: 0 })
  }
  return cells
}

module.exports = {
  pad2: pad2,
  formatDate: formatDate,
  formatTime: formatTime,
  parseDate: parseDate,
  todayStr: todayStr,
  dayDiff: dayDiff,
  addDays: addDays,
  weekdayLabel: weekdayLabel,
  shortDate: shortDate,
  relativeDayLabel: relativeDayLabel,
  buildMonthCells: buildMonthCells
}
