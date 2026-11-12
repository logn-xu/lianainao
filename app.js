// app.js
const sync = require('./utils/sync')

App({
  globalData: {
    // 留空则使用云开发默认环境；如有多环境，填上环境 ID，例如 'couple-3gxxxx'
    cloudEnv: ''
  },

  onLaunch: function () {
    sync.bootstrap()
  },

  onShow: function () {
    sync.auto()
  }
})
