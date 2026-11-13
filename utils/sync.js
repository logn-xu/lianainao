// 同步引擎：本地缓存 + 待上传队列，云端为准做合并
const store = require('./store')
const cloud = require('./cloud')

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
      // 自己的昵称头像以本机为准，只补上 openid
      profile.me.openid = member.openid
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
  // 只有本人改过的昵称/头像才同步，避免把「我 / 🐻」这种默认值推给对方
  await cloud.saveProfile({
    settings: { startDate: profile.startDate || '', cycle: profile.cycle || 28 },
    name: profile.me.nameSet ? profile.me.name : '',
    emoji: profile.me.emojiSet ? profile.me.emoji : ''
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

    // 已上传过的记录走更新，没上传过的走新增
    if (item.serverId) {
      await cloud.updateRecord(item.serverId, {
        type: item.type,
        date: item.date,
        time: item.time,
        amount: item.amount,
        note: item.note,
        images: item.images || [],
        authorOpenid: author.openid || ''
      })
      store.markClean(item.id)
      continue
    }

    const res = await cloud.addRecord({
      clientId: item.clientId || item.id,
      type: item.type,
      date: item.date,
      time: item.time,
      amount: item.amount,
      note: item.note,
      images: item.images || [],
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
    lastSyncAt = Date.now()
    syncing = false
    // 最后一步会触发页面刷新，此时应已不在同步中
    store.applyServerRecords(res.records || [], store.getProfile())
    return { ok: true, count: (res.records || []).length }
  } catch (err) {
    syncing = false
    return { ok: false, reason: (err && err.code) || 'FAILED', detail: err && err.detail }
  }
}

function auto() {
  const profile = store.getProfile()
  if (!profile.coupleId || syncing) return
  syncNow()
}

// 换手机 / 重装后：本地没记住情侣空间，但云端有，就自动恢复绑定
function restore() {
  if (!cloud.init()) return Promise.resolve()
  return cloud
    .state()
    .then(function (state) {
      if (state && state.bound) {
        applyState(state)
        return syncNow()
      }
      return null
    })
    .catch(function () {
      return null
    })
}

function bootstrap() {
  if (!cloud.init()) return
  const profile = store.getProfile()
  if (profile.coupleId) {
    auto()
    return
  }
  restore()
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
