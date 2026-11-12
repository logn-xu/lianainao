const store = require('../../utils/store')
const sync = require('../../utils/sync')
const stats = require('../../utils/stats')
const { buildMonthCells, shortDate } = require('../../utils/util')

Page({
  data: {
    year: 0,
    month: 0,
    monthLabel: '',
    canNext: false,
    weekHead: ['日', '一', '二', '三', '四', '五', '六'],
    cells: [],
    summary: { milktea: 0, snack: 0, sport: 0, note: 0, period: 0, total: 0 },
    periodView: null,
    streak: { current: 0, longest: 0 }
  },

  onLoad: function () {
    const now = new Date()
    const that = this
    this.setData({
      year: now.getFullYear(),
      month: now.getMonth() + 1
    })
    this.unsubscribe = store.subscribe(function () {
      if (that.data.year) that.load()
    })
  },

  onUnload: function () {
    if (this.unsubscribe) this.unsubscribe()
  },

  onShow: function () {
    this.load()
    sync.auto()
  },

  load: function () {
    const year = this.data.year
    const month = this.data.month
    const records = store.getRecords()
    const profile = store.getProfile()

    const monthList = stats.monthRecords(records, year, month)
    const summary = stats.summarize(monthList)
    const cells = buildMonthCells(year, month, stats.heatmap(monthList))
    const info = stats.periodInfo(records, profile.cycle)
    const now = new Date()

    let periodView = null
    if (info.has) {
      periodView = {
        lastText: shortDate(info.last),
        sinceText: info.sinceLast === 0 ? '就是今天' : info.sinceLast + ' 天前',
        nextText: shortDate(info.next),
        untilText: info.untilNext > 0
          ? '还有 ' + info.untilNext + ' 天'
          : (info.untilNext === 0 ? '预计就是今天' : '已过 ' + Math.abs(info.untilNext) + ' 天'),
        cycle: info.cycle,
        times: info.times,
        history: info.history.map(function (date) {
          return shortDate(date)
        })
      }
    }

    this.setData({
      monthLabel: year + '年' + month + '月',
      canNext: year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1),
      cells: cells,
      summary: summary,
      periodView: periodView,
      streak: stats.streak(records)
    })
  },

  prevMonth: function () {
    let year = this.data.year
    let month = this.data.month - 1
    if (month < 1) {
      month = 12
      year -= 1
    }
    this.setData({ year: year, month: month }, this.load)
  },

  nextMonth: function () {
    if (!this.data.canNext) return
    let year = this.data.year
    let month = this.data.month + 1
    if (month > 12) {
      month = 1
      year += 1
    }
    this.setData({ year: year, month: month }, this.load)
  }
})
