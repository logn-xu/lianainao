const store = require('../../utils/store')
const sync = require('../../utils/sync')
const cloud = require('../../utils/cloud')
const { AVATAR_OPTIONS } = require('../../utils/types')
const { dayDiff, todayStr, shortDate, formatTime } = require('../../utils/util')

const CYCLES = []
for (let i = 21; i <= 35; i++) {
  CYCLES.push(i + ' 天')
}

const ERROR_TEXT = {
  CLOUD_UNAVAILABLE: '当前微信版本不支持云开发',
  CALL_FAILED: '云函数未部署或网络异常',
  FAILED: '同步失败，稍后再试',
  SERVER_ERROR: '云函数出错了，看看控制台日志',
  UNBOUND: '还没有绑定情侣空间',
  BUSY: '正在同步中，稍等一下',
  CODE_NOT_FOUND: '邀请码不存在，再核对一下',
  COUPLE_FULL: '这个邀请码已经满员了',
  NO_COUPLE: '还没有绑定情侣空间',
  NOT_FOUND: '记录不存在'
}

Page({
  data: {
    profile: store.DEFAULT_PROFILE,
    avatars: AVATAR_OPTIONS,
    cycles: CYCLES,
    cycleIndex: 7,
    recordCount: 0,
    days: 0,
    today: todayStr(),
    startDateText: '未设置',
    cloudAvailable: true,
    bound: false,
    inviteCode: '',
    memberCount: 0,
    syncedText: '尚未同步',
    working: false
  },

  onLoad: function () {
    const that = this
    this.unsubscribe = store.subscribe(function () {
      that.refreshCloud()
    })
  },

  onUnload: function () {
    if (this.unsubscribe) this.unsubscribe()
  },

  onShow: function () {
    this.load()
    this.refreshCloud()
  },

  load: function () {
    const profile = store.getProfile()
    const days = profile.startDate ? dayDiff(profile.startDate, todayStr()) + 1 : 0
    this.setData({
      profile: profile,
      cycleIndex: Math.max(0, CYCLES.indexOf(profile.cycle + ' 天')),
      recordCount: store.countRecords(),
      days: days,
      startDateText: profile.startDate
        ? shortDate(profile.startDate) + (days ? ' · 第 ' + days + ' 天' : '')
        : '未设置'
    })
  },

  refreshCloud: function () {
    const profile = store.getProfile()
    const last = sync.getLastSync()
    this.setData({
      cloudAvailable: cloud.available(),
      bound: !!profile.coupleId,
      inviteCode: profile.inviteCode || '',
      memberCount: profile.coupleId ? (profile.ta.openid ? 2 : 1) : 0,
      syncedText: last ? '上次 ' + formatTime(new Date(last)) : '尚未同步',
      working: sync.busy()
    })
  },

  showError: function (reason) {
    wx.showToast({
      title: ERROR_TEXT[reason] || '操作失败，请稍后再试',
      icon: 'none',
      duration: 2500
    })
  },

  persist: function () {
    store.saveProfile(this.data.profile)
    sync.auto()
  },

  onCreateCouple: function () {
    if (this.data.working) return
    const that = this
    this.setData({ working: true })
    wx.showLoading({ title: '创建中', mask: true })

    sync.createCouple().then(function (res) {
      wx.hideLoading()
      that.load()
      that.refreshCloud()
      if (!res.ok) {
        that.showError(res.reason)
        return
      }
      wx.showModal({
        title: '情侣空间已创建',
        content: '邀请码 ' + res.inviteCode + '，发给 TA 就能加入，之后两边看到的是同一份记录。',
        confirmText: '复制',
        cancelText: '知道了',
        success: function (r) {
          if (r.confirm) that.copyInvite()
        }
      })
    })
  },

  onJoinCouple: function () {
    if (this.data.working) return
    const that = this
    wx.showModal({
      title: '输入邀请码',
      editable: true,
      placeholderText: '6 位邀请码，例如 AB3K9M',
      confirmText: '加入',
      success: function (res) {
        if (!res.confirm) return
        const code = (res.content || '').trim()
        if (!code) {
          wx.showToast({ title: '邀请码不能为空', icon: 'none' })
          return
        }
        that.join(code)
      }
    })
  },

  join: function (code) {
    const that = this
    this.setData({ working: true })
    wx.showLoading({ title: '加入中', mask: true })

    sync.joinCouple(code).then(function (res) {
      wx.hideLoading()
      that.load()
      that.refreshCloud()
      if (!res.ok) {
        that.showError(res.reason)
        return
      }
      wx.showToast({ title: '已经连上啦', icon: 'none' })
    })
  },

  onSyncNow: function () {
    if (this.data.working) return
    const that = this
    this.setData({ working: true })
    wx.showLoading({ title: '同步中', mask: true })

    sync.syncNow().then(function (res) {
      wx.hideLoading()
      that.setData({ working: false })
      that.load()
      that.refreshCloud()
      if (!res.ok) {
        that.showError(res.reason)
        return
      }
      wx.showToast({ title: '已是最新', icon: 'none' })
    })
  },

  onCopyInvite: function () {
    this.copyInvite()
  },

  copyInvite: function () {
    const code = this.data.inviteCode
    if (!code) return
    wx.setClipboardData({
      data: code,
      success: function () {
        wx.showToast({ title: '邀请码已复制', icon: 'none' })
      }
    })
  },

  onUnbind: function () {
    const that = this
    wx.showModal({
      title: '解除绑定',
      content: '解除后这台手机不再同步，本地已有的记录会保留。确定解除吗？',
      confirmText: '解除',
      confirmColor: '#D9535C',
      success: function (res) {
        if (!res.confirm) return
        sync.unbind().then(function () {
          that.load()
          that.refreshCloud()
          wx.showToast({ title: '已解除绑定', icon: 'none' })
        })
      }
    })
  },

  onNameBlur: function (e) {
    const role = e.currentTarget.dataset.role
    const value = (e.detail.value || '').trim()
    const patch = {}
    patch['profile.' + role + '.name'] = value || (role === 'me' ? '我' : 'TA')
    this.setData(patch, this.persist)
  },

  onPickAvatar: function (e) {
    const role = e.currentTarget.dataset.role
    const emoji = e.currentTarget.dataset.emoji
    const patch = {}
    patch['profile.' + role + '.emoji'] = emoji
    this.setData(patch, this.persist)
  },

  onStartDateChange: function (e) {
    const startDate = e.detail.value
    const days = dayDiff(startDate, todayStr()) + 1
    this.setData(
      {
        'profile.startDate': startDate,
        days: days,
        startDateText: shortDate(startDate) + ' · 第 ' + days + ' 天'
      },
      this.persist
    )
  },

  onCycleChange: function (e) {
    const index = Number(e.detail.value)
    this.setData(
      {
        cycleIndex: index,
        'profile.cycle': Number(CYCLES[index].replace(' 天', ''))
      },
      this.persist
    )
  },

  onCopyData: function () {
    const data = {
      profile: store.getProfile(),
      records: store.getRecords()
    }
    wx.setClipboardData({
      data: JSON.stringify(data),
      success: function () {
        wx.showToast({ title: '已复制到剪贴板', icon: 'none' })
      }
    })
  },

  onClearRecords: function () {
    const that = this
    wx.showModal({
      title: '清空所有记录',
      content: '聊天可以删，这些回忆确定要清空吗？操作不可恢复。',
      confirmText: '清空',
      confirmColor: '#D9535C',
      success: function (res) {
        if (!res.confirm) return
        wx.showLoading({ title: '清空中', mask: true })
        sync.clearAll().then(function (result) {
          wx.hideLoading()
          that.load()
          if (!result.ok) {
            that.showError(result.reason)
            return
          }
          wx.showToast({ title: '已清空', icon: 'none' })
        })
      }
    })
  }
})
