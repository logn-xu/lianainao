const store = require('../../utils/store')
const sync = require('../../utils/sync')
const images = require('../../utils/images')
const { todayStr, dayDiff, shortDate, weekdayLabel } = require('../../utils/util')

Page({
  data: {
    tabs: [
      { key: 'feed', label: '时光记录' },
      { key: 'stats', label: '小统计' }
    ],
    tab: 'feed',
    profile: store.DEFAULT_PROFILE,
    records: [],
    days: 0,
    heroSub: '',
    composerShow: false,
    composerType: 'milktea',
    editingRecord: null
  },

  onLoad: function () {
    const that = this
    // 云端数据变更后自动刷新，子组件共用这一份数据
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
    const days = profile.startDate ? dayDiff(profile.startDate, todayStr()) + 1 : 0

    this.setData({
      profile: profile,
      records: store.getRecords(),
      days: days,
      heroSub: days
        ? shortDate(todayStr()) + ' · ' + weekdayLabel(todayStr())
        : '去「我的」填上在一起的日子'
    })
  },

  onSwitchTab: function (e) {
    this.setData({ tab: e.currentTarget.dataset.key })
  },

  openComposer: function (type) {
    const that = this
    // 先同步类型，再弹出，避免组件 observer 读到旧类型
    this.setData({ composerType: type, editingRecord: null }, function () {
      that.setData({ composerShow: true })
    })
  },

  openEditor: function (id) {
    const that = this
    const target = store.getRecords().filter(function (item) {
      return item.id === id
    })[0]
    if (!target) return
    this.setData({ editingRecord: target }, function () {
      that.setData({ composerShow: true })
    })
  },

  onFeedAdd: function (e) {
    this.openComposer(e.detail.key)
  },

  onFeedEdit: function (e) {
    this.openEditor(e.detail.id)
  },

  onFeedPreview: function (e) {
    const detail = e.detail || {}
    images.preview(detail.images || [], detail.current)
  },

  onFeedRemove: function (e) {
    const id = e.detail.id
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
  },

  onFabTap: function () {
    this.openComposer('milktea')
  },

  onComposerClose: function () {
    this.setData({ composerShow: false })
  },

  onComposerSubmit: function (e) {
    store.addRecord(e.detail.record)
    images.removeFiles(e.detail.removedImages)
    this.setData({ composerShow: false })
    this.refresh()
    sync.auto()
    wx.showToast({ title: '记下来啦', icon: 'none' })
  },

  onComposerEdit: function (e) {
    store.updateRecord(e.detail.id, e.detail.record)
    images.removeFiles(e.detail.removedImages)
    this.setData({ composerShow: false })
    this.refresh()
    sync.auto()
    wx.showToast({ title: '改好啦', icon: 'none' })
  }
})
