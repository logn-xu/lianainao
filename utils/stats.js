// 统计分析
const { pad2, dayDiff, todayStr, addDays } = require('./util')

function monthRecords(records, year, month) {
  const prefix = year + '-' + pad2(month)
  return records.filter(function (item) {
    return String(item.date).indexOf(prefix) === 0
  })
}

function summarize(list) {
  const result = { milktea: 0, snack: 0, sport: 0, note: 0, period: 0, total: list.length }
  list.forEach(function (item) {
    const amount = item.amount || 1
    if (item.type === 'milktea') result.milktea += amount
    else if (item.type === 'snack') result.snack += amount
    else if (item.type === 'sport') result.sport += amount
    else if (item.type === 'period') result.period += 1
    else result.note += 1
  })
  return result
}

// 每天的记录次数 -> 热力等级 1~3
function heatmap(list) {
  const map = {}
  list.forEach(function (item) {
    if (!map[item.date]) map[item.date] = { count: 0, level: 0, period: false }
    map[item.date].count += 1
    if (item.type === 'period') map[item.date].period = true
  })
  Object.keys(map).forEach(function (key) {
    const count = map[key].count
    map[key].level = count >= 3 ? 3 : count === 2 ? 2 : 1
  })
  return map
}

// 姨妈周期：7 天内的多条记录视为同一次
function periodInfo(records, fallbackCycle) {
  const starts = records
    .filter(function (item) {
      return item.type === 'period'
    })
    .map(function (item) {
      return item.date
    })
    .sort()

  if (!starts.length) return { has: false }

  const unique = []
  starts.forEach(function (date) {
    if (!unique.length || dayDiff(unique[unique.length - 1], date) > 7) unique.push(date)
  })

  const gaps = []
  for (let i = 1; i < unique.length; i++) {
    gaps.push(dayDiff(unique[i - 1], unique[i]))
  }
  const recent = gaps.slice(-4)
  const avg = recent.length
    ? Math.round(recent.reduce(function (sum, n) { return sum + n }, 0) / recent.length)
    : (fallbackCycle || 28)

  const last = unique[unique.length - 1]
  const next = addDays(last, avg)
  const today = todayStr()

  return {
    has: true,
    last: last,
    next: next,
    cycle: avg,
    sinceLast: dayDiff(last, today),
    untilNext: dayDiff(today, next),
    times: unique.length,
    history: unique.slice(-5)
  }
}

function longestRun(dateSet) {
  const dates = Object.keys(dateSet).sort()
  let longest = 0
  let run = 0
  let prev = ''
  dates.forEach(function (date) {
    run = prev && dayDiff(prev, date) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = date
  })
  return longest
}

// 连续记录天数（今天没记则从昨天算起，不算断）
function streak(records) {
  const dateSet = {}
  records.forEach(function (item) {
    dateSet[item.date] = true
  })

  const longest = longestRun(dateSet)
  let cursor = todayStr()
  if (!dateSet[cursor]) {
    cursor = addDays(cursor, -1)
    if (!dateSet[cursor]) return { current: 0, longest: longest }
  }

  let current = 0
  while (dateSet[cursor]) {
    current += 1
    cursor = addDays(cursor, -1)
  }
  return { current: current, longest: longest }
}

module.exports = {
  monthRecords: monthRecords,
  summarize: summarize,
  heatmap: heatmap,
  periodInfo: periodInfo,
  streak: streak
}
