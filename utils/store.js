// 本地数据层：页面只和这里打交道，云端同步（utils/sync.js）也只是读写这一层
const RECORDS_KEY = 'couple_records_v1'
const PROFILE_KEY = 'couple_profile_v1'

const DEFAULT_PROFILE = {
  startDate: '',
  me: { name: '我', emoji: '🐻', openid: '', nameSet: false, emojiSet: false },
  ta: { name: 'TA', emoji: '🐰', openid: '' },
  cycle: 28,
  coupleId: '',
  inviteCode: '',
  profileDirty: false
}

const listeners = []

function clone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function subscribe(fn) {
  if (typeof fn !== 'function') return function () {}
  listeners.push(fn)
  return function () {
    const index = listeners.indexOf(fn)
    if (index >= 0) listeners.splice(index, 1)
  }
}

function notify() {
  listeners.slice().forEach(function (fn) {
    try {
      fn()
    } catch (e) {
      console.error('[store] listener error', e)
    }
  })
}

/* ---------- 资料 ---------- */

function getProfile() {
  const saved = wx.getStorageSync(PROFILE_KEY)
  if (!saved) return clone(DEFAULT_PROFILE)
  return Object.assign(clone(DEFAULT_PROFILE), saved, {
    me: Object.assign({}, DEFAULT_PROFILE.me, saved.me || {}),
    ta: Object.assign({}, DEFAULT_PROFILE.ta, saved.ta || {})
  })
}

// silent: 来自云端的覆盖，不标记为待上传
function saveProfile(profile, options) {
  const opts = options || {}
  const next = Object.assign({}, profile)
  next.profileDirty = opts.silent ? false : true
  wx.setStorageSync(PROFILE_KEY, next)
  notify()
}

/* ---------- 记录 ---------- */

function sortRecords(list) {
  return list.slice().sort(function (a, b) {
    if (a.date === b.date) return (b.createdAt || 0) - (a.createdAt || 0)
    return a.date < b.date ? 1 : -1
  })
}

function getRawRecords() {
  const list = wx.getStorageSync(RECORDS_KEY)
  return Array.isArray(list) ? list : []
}

function saveRawRecords(list) {
  wx.setStorageSync(RECORDS_KEY, list)
}

function getRecords() {
  return sortRecords(
    getRawRecords().filter(function (item) {
      return !item.deleted
    })
  )
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function addRecord(record) {
  const list = getRawRecords()
  const clientId = record.clientId || record.id || genId()
  const item = Object.assign({}, record, {
    id: clientId,
    clientId: clientId,
    serverId: '',
    pending: true,
    deleted: false,
    images: record.images || []
  })
  item.createdAt = record.createdAt || Date.now()
  list.push(item)
  saveRawRecords(list)
  notify()
  return item
}

// 未上传的记录直接移除，已上传的打删除标记等同步
function removeRecord(id) {
  const list = getRawRecords()
  const target = list.filter(function (item) {
    return item.id === id
  })[0]
  if (!target) return

  if (!target.serverId) {
    saveRawRecords(
      list.filter(function (item) {
        return item.id !== id
      })
    )
  } else {
    target.deleted = true
    target.pending = true
    saveRawRecords(list)
  }
  notify()
}

function markSynced(localId, serverId) {
  const list = getRawRecords()
  let changed = false
  list.forEach(function (item) {
    if (item.id === localId) {
      item.serverId = serverId
      item.id = serverId
      item.pending = false
      changed = true
    }
  })
  if (changed) saveRawRecords(list)
}

// 已上传的记录编辑后只清 pending，不动 id
function markClean(id) {
  const list = getRawRecords()
  let changed = false
  list.forEach(function (item) {
    if (item.id === id && item.pending) {
      item.pending = false
      changed = true
    }
  })
  if (changed) saveRawRecords(list)
}

function updateRecord(id, patch) {
  const list = getRawRecords()
  const target = list.filter(function (item) {
    return item.id === id && !item.deleted
  })[0]
  if (!target) return null

  // createdAt 保持不变，记录仍在原来的时间位置
  Object.assign(target, patch, { pending: true })
  saveRawRecords(list)
  notify()
  return target
}

function dropRecord(id) {
  saveRawRecords(
    getRawRecords().filter(function (item) {
      return item.id !== id
    })
  )
}

function markAllPending() {
  const list = getRawRecords()
  list.forEach(function (item) {
    if (!item.deleted) item.pending = true
  })
  saveRawRecords(list)
}

// 解绑后保留本地记录，但断开与云端的对应关系
function detachSyncIds() {
  const list = getRawRecords()
  list.forEach(function (item) {
    item.serverId = ''
    item.pending = false
  })
  saveRawRecords(list)
}

function fromServer(doc, profile) {
  const isMe = !!doc.authorOpenid && doc.authorOpenid === profile.me.openid
  return {
    id: doc._id,
    clientId: doc.clientId || doc._id,
    serverId: doc._id,
    type: doc.type,
    date: doc.date,
    time: doc.time || '12:00',
    amount: doc.amount || 1,
    note: doc.note || '',
    images: doc.images || [],
    authorId: isMe ? 'me' : 'ta',
    authorOpenid: doc.authorOpenid || '',
    createdAt: doc.createdAt || Date.now(),
    pending: false,
    deleted: false
  }
}

// 用云端结果覆盖缓存，未上传成功的本地记录保留
function applyServerRecords(docs, profile) {
  const pending = getRawRecords().filter(function (item) {
    return item.pending && !item.deleted
  })
  const merged = {}
  pending.forEach(function (item) {
    merged[item.id] = item
  })
  ;(docs || []).forEach(function (doc) {
    if (!doc || !doc._id) return
    const mapped = fromServer(doc, profile)
    if (!merged[mapped.id]) merged[mapped.id] = mapped
  })
  saveRawRecords(
    sortRecords(
      Object.keys(merged).map(function (key) {
        return merged[key]
      })
    )
  )
  notify()
}

function countRecords() {
  return getRecords().length
}

function clearRecords() {
  wx.removeStorageSync(RECORDS_KEY)
  notify()
}

module.exports = {
  DEFAULT_PROFILE: DEFAULT_PROFILE,
  subscribe: subscribe,
  notify: notify,
  getProfile: getProfile,
  saveProfile: saveProfile,
  getRawRecords: getRawRecords,
  getRecords: getRecords,
  addRecord: addRecord,
  removeRecord: removeRecord,
  updateRecord: updateRecord,
  markSynced: markSynced,
  markClean: markClean,
  dropRecord: dropRecord,
  markAllPending: markAllPending,
  detachSyncIds: detachSyncIds,
  applyServerRecords: applyServerRecords,
  countRecords: countRecords,
  clearRecords: clearRecords
}
