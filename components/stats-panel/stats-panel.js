const stats = require('../../utils/stats')
const { buildMonthCells, shortDate } = require('../../utils/util')

const now = new Date()

Component({
  properties: {
    records: {
      type: Array,
      value: [],
      observer: function () {
        this.load()
      }
    },
    profile: {
      type: Object,
      value: {},
      observer: function () {
        this.load()
      }
    }
  },

  data: {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    monthLabel: '',
    canNext: false,
    weekHead: ['日', '一', '二', '三', '四', '五', '六'],
    cells: [],
    summary: { milktea: 0, snack: 0, sport: 0, total: 0 },
    periodView: null,
    streak: { current: 0, longest: 0 }
  },

  lifetimes: {
    attached: function () {
      this.load()
    }
  },

  methods: {
    load: function () {
      const year = this.data.year
      const month = this.data.month
      if (!year || !month) return

      const records = this.data.records || []
      const profile = this.data.profile || {}
      const monthList = stats.monthRecords(records, year, month)
      const info = stats.periodInfo(records, profile.cycle)
      const today = new Date()
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
          history: info.history.map(function (date) {
            return shortDate(date)
          })
        }
      }

      this.setData({
        monthLabel: year + '年' + month + '月',
        canNext: year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth() + 1),
        cells: buildMonthCells(year, month, stats.heatmap(monthList)),
        summary: stats.summarize(monthList),
        periodView: periodView,
        streak: stats.streak(records)
      })
    },

    prevMonth: function () {
      const that = this
      let year = this.data.year
      let month = this.data.month - 1
      if (month < 1) {
        month = 12
        year -= 1
      }
      this.setData({ year: year, month: month }, function () {
        that.load()
      })
    },

    nextMonth: function () {
      if (!this.data.canNext) return
      const that = this
      let year = this.data.year
      let month = this.data.month + 1
      if (month > 12) {
        month = 1
        year += 1
      }
      this.setData({ year: year, month: month }, function () {
        that.load()
      })
    }
  }
})
