// 同步引擎：本地缓存 + 待上传队列，云端为准做合并
const store = require('./store')
const cloud = require('./cloud')

const DEFAULT_ME_NAME = '我'
const DEFAULT_ME_EMOJI = '🐻'

let syncing = false
let lastSyncAt = 0

function busy() {
  return syncing
}

function getLastSync() {
  return lastSyncAt
}

/* ---------- 云端状态 -> 本地资料 ---------- */

function applyState(state) {
  const profile = store.getProfile()

  if (!state || !state.bound || !state.couple) {
    profile.coupleId = ''
    profile.inviteCode = ''
    profile.ta.openid = ''
    if (state && state.openid) profile.me.openid = state.openid
    store.saveProfile(profile, { silent: true })
    return
  }

  const couple = state.couple
  const settings = couple.settings || {}

  profile.coupleId = couple._id
  profile.inviteCode = couple.inviteCode
  if (settings.startDate) profile.startDate = settings.startDate
  if (settings.cycle) profile.cycle = settings.cycle
  profile.ta.openid = ''

  ;(couple.members || []).forEach(function (member) {
    if (!member || !member.openid) return
    if (member.openid === state.openid) {
      profile.me.openid = member.openid
      if (!profile.me.name || profile.me.name === DEFAULT_ME_NAME) {
        profile.me.name = member.name || profile.me.name
      }
      if (!profile.me.emoji || profile.me.emoji === DEFAULT_ME_EMOJI) {
        profile.me.emoji = member.emoji || profile.me.emoji
      }
    } else {
      profile.ta.openid = member.openid
      if (member.name) profile.ta.name = member.name
      if (member.emoji) profile.ta.emoji = member.emoji
    }
  })

  store.saveProfile(profile, { silent: true })
}

/* ---------- 推送 ---------- */

async function pushProfile(profile) {
  if (!profile.profileDirty || !profile.coupleId) return
  await cloud.saveProfile({
    settings: { startDate: profile.startDate || '', cycle: profile.cycle || 28 },
    name: profile.me.name,
    emoji: profile.me.emoji
  })
  const next = store.getProfile()
  next.profileDirty = false
  store.saveProfile(next, { silent: true })
}

async function pushPending(profile) {
  const items = store.getRawRecords().filter(function (item) {
    return item.pending
  })

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    if (item.deleted) {
      if (item.serverId) await cloud.deleteRecord(item.serverId)
      store.dropRecord(item.id)
      continue
    }

    const author = profile[item.authorId] || profile.me
    const res = await cloud.addRecord({
      type: item.type,
      date: item.date,
      time: item.time,
      amount: item.amount,
      note: item.note,
      authorOpenid: author.openid || '',
      createdAt: item.createdAt
    })
    if (res && res.id) store.markSynced(item.id, res.id)
  }
}

/* ---------- 主流程 ---------- */

async function syncNow() {
  const profile = store.getProfile()
  if (!profile.coupleId) return { ok: false, reason: 'UNBOUND' }
  if (syncing) return { ok: false, reason: 'BUSY' }
  if (!cloud.init()) return { ok: false, reason: 'CLOUD_UNAVAILABLE' }

  syncing = true
  try {
    await pushProfile(profile)
    await pushPending(store.getProfile())

    const state = await cloud.state()
    applyState(state)

    const res = await cloud.listRecords()
    store.applyServerRecords(res.records || [], store.getProfile())
    lastSyncAt = Date.now()
    return { ok: true, count: (res.records || []).length }
  } catch (err) {
    return { ok: false, reason: (err && err.code) || 'FAILED', detail: err && err.detail }
  } finally {
    syncing = false
  }
}

function auto() {
  const profile = store.getProfile()
  if (!profile.coupleId || syncing) return
  syncNow()
}

function bootstrap() {
  cloud.init()
  auto()
}

/* ---------- 绑定 ---------- */

async function createCouple() {
  if (!cloud.init()) return { ok: false, reason: 'CLOUD_UNAVAILABLE' }
  try {
    const state = await cloud.createCouple()
    applyState(state)

    const profile = store.getProfile()
    profile.profileDirty = true
    store.saveProfile(profile)

    store.markAllPending()
    const result = await syncNow()
    return { ok: true, inviteCode: store.getProfile().inviteCode, sync: result }
  } catch (err) {
    return { ok: false, reason: (err && err.code) || 'FAILED' }
  }
}

async function joinCouple(code) {
  if (!cloud.init()) return { ok: false, reason: 'CLOUD_UNAVAILABLE' }
  try {
    const state = await cloud.joinCouple(code)
    applyState(state)

    const profile = store.getProfile()
    profile.profileDirty = true
    store.saveProfile(profile)

    store.markAllPending()
    const result = await syncNow()
    return { ok: true, inviteCode: store.getProfile().inviteCode, sync: result }
  } catch (err) {
    return { ok: false, reason: (err && err.code) || 'FAILED' }
  }
}

// 清空记录：已绑定时连云端一起清，避免下次同步又拉回来
async function clearAll() {
  const profile = store.getProfile()
  if (profile.coupleId && cloud.init()) {
    try {
      await cloud.clearRecords()
    } catch (e) {
      return { ok: false, reason: (e && e.code) || 'FAILED' }
    }
  }
  store.clearRecords()
  return { ok: true }
}

async function unbind() {
  const profile = store.getProfile()
  if (profile.coupleId && cloud.init()) {
    try {
      await cloud.unbind()
    } catch (e) {
      // 网络异常也允许本地解绑
    }
  }

  const next = store.getProfile()
  next.coupleId = ''
  next.inviteCode = ''
  next.me.openid = ''
  next.ta.openid = ''
  next.profileDirty = false
  store.saveProfile(next, { silent: true })
  store.detachSyncIds()
  lastSyncAt = 0
  return { ok: true }
}

module.exports = {
  busy: busy,
  getLastSync: getLastSync,
  syncNow: syncNow,
  auto: auto,
  bootstrap: bootstrap,
  createCouple: createCouple,
  joinCouple: joinCouple,
  clearAll: clearAll,
  unbind: unbind
}
