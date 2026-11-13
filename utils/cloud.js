// 云开发调用封装：未开通云环境时不会抛错，由上层回退到本地存储
let ready = false

function available() {
  return typeof wx !== 'undefined' && !!wx.cloud && typeof wx.cloud.callFunction === 'function'
}

function init() {
  if (ready) return true
  // wx.cloud 在启动初期可能尚未注入，失败不缓存，下次调用（含重试）还能再试
  if (!available()) return false
  let env = ''
  try {
    const app = getApp()
    env = (app && app.globalData && app.globalData.cloudEnv) || ''
  } catch (e) {
    env = ''
  }
  try {
    wx.cloud.init(env ? { env: env, traceUser: true } : { traceUser: true })
    ready = true
  } catch (e) {
    console.warn('[cloud] init failed', e)
    ready = false
  }
  return ready
}

function call(action, data) {
  if (!init()) {
    const err = new Error('cloud_unavailable')
    err.code = 'CLOUD_UNAVAILABLE'
    return Promise.reject(err)
  }

  return wx.cloud
    .callFunction({
      name: 'api',
      data: Object.assign({ action: action }, data || {})
    })
    .then(
      function (res) {
        const result = res && res.result
        if (!result) {
          const err = new Error('empty_result')
          err.code = 'FAILED'
          throw err
        }
        if (result.error) {
          const err = new Error(result.error)
          err.code = result.error
          err.detail = result.message
          throw err
        }
        return result
      },
      function (reason) {
        const err = new Error('call_failed')
        err.code = 'CALL_FAILED'
        err.detail = String((reason && (reason.errMsg || reason.message)) || '')
        throw err
      }
    )
}

module.exports = {
  available: available,
  init: init,
  call: call,
  state: function () {
    return call('state')
  },
  createCouple: function () {
    return call('createCouple')
  },
  joinCouple: function (code) {
    return call('joinCouple', { code: code })
  },
  listRecords: function () {
    return call('listRecords')
  },
  addRecord: function (record) {
    return call('addRecord', { record: record })
  },
  deleteRecord: function (id) {
    return call('deleteRecord', { id: id })
  },
  updateRecord: function (id, record) {
    return call('updateRecord', { id: id, record: record })
  },
  clearRecords: function () {
    return call('clearRecords')
  },
  saveProfile: function (payload) {
    return call('saveProfile', payload)
  },
  unbind: function () {
    return call('unbind')
  }
}
