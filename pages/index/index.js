const store = require('../../utils/store')
const sync = require('../../utils/sync')
const stats = require('../../utils/stats')
const { TYPES, TYPE_MAP } = require('../../utils/types')
const { todayStr, dayDiff, relativeDayLabel, weekdayLabel } = require('../../utils/util')

Page({
  data: {
    types: TYPES,
    profile: store.DEFAULT_PROFILE,
    days: 0,
    heroSub: '',
    groups: [],
    empty: true,
    summary: { milktea: 0, snack: 0, total: 0 },
    composerShow: false,
    composerType: 'milktea'
  },

  onLoad: function () {
    const that = this
    // 云端数据变更后自动刷新页面
    this.unsubscribe = store.subscribe(function () {
      that.refresh()
    })
  },

  onUnload: function () {
    if (this.unsubscribe) this.unsubscribe()
  },

  onShow: function () {
    this.refresh()
    sync.auto()
  },

  refresh: function () {
    const profile = store.getProfile()
    const records = store.getRecords()
    const now = new Date()
    const monthList = stats.monthRecords(records, now.getFullYear(), now.getMonth() + 1)
    const monthSummary = stats.summarize(monthList)

    const groups = []
    const groupMap = {}

    records.forEach(function (record) {
      if (!groupMap[record.date]) {
        groupMap[record.date] = {
          date: record.date,
          label: relativeDayLabel(record.date),
          weekday: weekdayLabel(record.date),
          records: []
        }
        groups.push(groupMap[record.date])
      }
      const meta = TYPE_MAP[record.type] || TYPE_MAP.note
      groupMap[record.date].records.push(
        Object.assign({}, record, {
          meta: meta,
          authorEmoji: record.authorId === 'ta' ? profile.ta.emoji : profile.me.emoji
        })
      )
    })

    const days = profile.startDate ? dayDiff(profile.startDate, todayStr()) + 1 : 0

    this.setData({
      profile: profile,
      days: days,
      heroSub: days
        ? '在一起的第 ' + days + ' 天 · ' + relativeDayLabel(todayStr())
        : '去「我的」填上在一起的日子',
      groups: groups,
      empty: groups.length === 0,
      summary: {
        milktea: monthSummary.milktea,
        snack: monthSummary.snack,
        total: monthSummary.total
      }
    })
  },

  openComposer: function (type) {
    const that = this
    // 先同步类型，再弹出，避免组件 observer 读到旧类型
    this.setData({ composerType: type }, function () {
      that.setData({ composerShow: true })
    })
  },

  onQuickAdd: function (e) {
    this.openComposer(e.currentTarget.dataset.key)
  },

  onFabTap: function () {
    this.openComposer('milktea')
  },

  onComposerClose: function () {
    this.setData({ composerShow: false })
  },

  onComposerSubmit: function (e) {
    store.addRecord(e.detail.record)
    this.setData({ composerShow: false })
    this.refresh()
    sync.auto()
    wx.showToast({ title: '记下来啦', icon: 'none' })
  },

  onRecordLongPress: function (e) {
    const id = e.currentTarget.dataset.id
    const that = this
    wx.showActionSheet({
      itemList: ['删除这条记录'],
      itemColor: '#D9535C',
      success: function (res) {
        if (res.tapIndex !== 0) return
        store.removeRecord(id)
        that.refresh()
        sync.auto()
      }
    })
  }
})
