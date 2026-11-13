// 云函数 api：情侣空间与记录的唯一数据出入口
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const REQUIRED_COLLECTIONS = ['couples', 'records', 'kitchenDishes', 'kitchenOrders']
let collectionsEnsured = false
let ensuringCollections = null

function isCollectionExists(err) {
  const code = String((err && (err.errCode || err.code)) || '')
  const message = String((err && (err.errMsg || err.message)) || err || '')
  return code === 'ALREADY_EXISTS' || /already exist|ALREADY_EXISTS|已存在/i.test(message)
}

function errorMessage(err) {
  return String((err && (err.errMsg || err.message || err.code)) || err || '')
}

// 建集合并保留结果，不再静默吞掉失败原因
async function createCollectionWithResult(name) {
  if (typeof db.createCollection !== 'function') {
    return {
      name: name,
      status: 'failed',
      message: 'wx-server-sdk 不支持 createCollection，请在云开发控制台手动新建集合'
    }
  }
  try {
    await db.createCollection(name)
    return { name: name, status: 'created' }
  } catch (err) {
    if (isCollectionExists(err)) return { name: name, status: 'exists' }
    return { name: name, status: 'failed', message: errorMessage(err) }
  }
}

function failedCollections(results) {
  return results.filter(function (item) {
    return item.status === 'failed'
  })
}

// 首次调用时自动建集合。并发请求必须共用同一次建集合任务，
// 否则 getKitchen 会跳过创建、查到还不存在的集合而整体失败。
// 只有全部创建完成才算就绪；真实失败允许下次请求重试，且不阻断业务。
async function ensureCollections() {
  if (collectionsEnsured) return
  if (ensuringCollections) return ensuringCollections

  ensuringCollections = Promise.all(
    REQUIRED_COLLECTIONS.map(function (name) {
      return createCollectionWithResult(name)
    })
  ).then(function (results) {
    const failed = failedCollections(results)
    if (failed.length) console.warn('[api] createCollection failed:', JSON.stringify(failed))
    collectionsEnsured = failed.length === 0
    ensuringCollections = null
  })

  return ensuringCollections
}

// 页面「初始化」入口：强制重新检查，逐项返回创建结果与失败原因
async function initDb(env) {
  const results = []
  for (let i = 0; i < REQUIRED_COLLECTIONS.length; i++) {
    results.push(await createCollectionWithResult(REQUIRED_COLLECTIONS[i]))
  }
  const failed = failedCollections(results)
  collectionsEnsured = failed.length === 0
  ensuringCollections = null
  return {
    ok: failed.length === 0,
    env: env || '',
    collections: results,
    message: failed.length
      ? failed.map(function (item) {
          return item.name + ': ' + item.message
        }).join('; ')
      : ''
  }
}

function normalizeImages(images) {
  if (!Array.isArray(images)) return []
  return images
    .filter(function (item) {
      if (typeof item !== 'string') return false
      // 云文件 ID，或小程序内置的预置菜单配图
      return item.indexOf('cloud://') === 0 || item.indexOf('/images/dishes/') === 0
    })
    .slice(0, 9)
}

function normalizeSettings(settings) {
  const value = settings || {}
  return {
    startDate: value.startDate || '',
    cycle: Number(value.cycle) || 28
  }
}

async function findCouple(openid) {
  const res = await db
    .collection('couples')
    .where({ memberOpenids: openid })
    .limit(1)
    .get()
  return res.data && res.data.length ? res.data[0] : null
}

const kitchenApi = require('./kitchen')({
  db: db,
  findCouple: findCouple,
  normalizeImages: normalizeImages
})

async function stateOf(openid) {
  const couple = await findCouple(openid)
  if (!couple) return { ok: true, bound: false, openid: openid }
  return {
    ok: true,
    bound: true,
    openid: openid,
    couple: {
      _id: couple._id,
      inviteCode: couple.inviteCode,
      members: couple.members || [],
      settings: normalizeSettings(couple.settings)
    }
  }
}

async function generateCode() {
  for (let i = 0; i < 8; i++) {
    let code = ''
    for (let j = 0; j < 6; j++) {
      code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length))
    }
    const res = await db.collection('couples').where({ inviteCode: code }).count()
    if (!res.total) return code
  }
  throw new Error('CODE_GEN_FAILED')
}

async function createCouple(openid) {
  const existing = await findCouple(openid)
  if (existing) return stateOf(openid)

  const now = Date.now()
  const doc = {
    inviteCode: await generateCode(),
    memberOpenids: [openid],
    members: [{ openid: openid, name: '', emoji: '', joinedAt: now }],
    settings: { startDate: '', cycle: 28 },
    createdAt: now,
    updatedAt: now
  }
  const res = await db.collection('couples').add({ data: doc })
  return {
    ok: true,
    bound: true,
    openid: openid,
    couple: {
      _id: res._id,
      inviteCode: doc.inviteCode,
      members: doc.members,
      settings: doc.settings
    }
  }
}

async function joinCouple(openid, code) {
  const mine = await findCouple(openid)
  if (mine) return stateOf(openid)

  const value = String(code || '').trim().toUpperCase()
  if (!value) return { error: 'NO_CODE' }

  const res = await db.collection('couples').where({ inviteCode: value }).limit(1).get()
  const couple = res.data && res.data.length ? res.data[0] : null
  if (!couple) return { error: 'CODE_NOT_FOUND' }
  if ((couple.memberOpenids || []).length >= 2) return { error: 'COUPLE_FULL' }

  await db
    .collection('couples')
    .doc(couple._id)
    .update({
      data: {
        memberOpenids: _.push([openid]),
        members: _.push([
          { openid: openid, name: '', emoji: '', joinedAt: Date.now() }
        ]),
        updatedAt: Date.now()
      }
    })

  return stateOf(openid)
}

async function listRecords(openid) {
  const couple = await findCouple(openid)
  if (!couple) return { error: 'NO_COUPLE' }
  const res = await db
    .collection('records')
    .where({ coupleId: couple._id })
    .orderBy('date', 'desc')
    .limit(1000)
    .get()
  return { ok: true, records: res.data || [] }
}

async function addRecord(openid, record) {
  const couple = await findCouple(openid)
  if (!couple) return { error: 'NO_COUPLE' }

  const input = record || {}
  if (!input.type || !input.date) return { error: 'BAD_RECORD' }

  const members = couple.memberOpenids || []
  const authorOpenid = members.indexOf(input.authorOpenid) >= 0 ? input.authorOpenid : openid
  const clientId = input.clientId ? String(input.clientId) : ''

  // 同一条本地记录重试时不会产生重复数据
  if (clientId) {
    const exists = await db
      .collection('records')
      .where({ coupleId: couple._id, clientId: clientId })
      .limit(1)
      .get()
    if (exists.data && exists.data.length) return { ok: true, id: exists.data[0]._id }
  }

  const doc = {
    coupleId: couple._id,
    clientId: clientId,
    type: String(input.type),
    date: String(input.date),
    time: String(input.time || '12:00'),
    amount: Number(input.amount) || 1,
    note: String(input.note || '').slice(0, 100),
    images: normalizeImages(input.images),
    authorOpenid: authorOpenid,
    createdAt: Number(input.createdAt) || Date.now(),
    updatedAt: Date.now()
  }
  const res = await db.collection('records').add({ data: doc })
  return { ok: true, id: res._id }
}

async function updateRecord(openid, id, record) {
  const couple = await findCouple(openid)
  if (!couple) return { error: 'NO_COUPLE' }
  if (!id) return { error: 'BAD_RECORD' }

  const res = await db.collection('records').doc(String(id)).get().catch(function () {
    return null
  })
  const doc = res && res.data
  if (!doc || doc.coupleId !== couple._id) return { error: 'NOT_FOUND' }

  const input = record || {}
  const members = couple.memberOpenids || []
  const authorOpenid = members.indexOf(input.authorOpenid) >= 0 ? input.authorOpenid : doc.authorOpenid

  const patch = {
    type: String(input.type || doc.type),
    date: String(input.date || doc.date),
    time: String(input.time || doc.time),
    amount: Number(input.amount) || doc.amount || 1,
    note: input.note !== undefined ? String(input.note).slice(0, 100) : doc.note,
    authorOpenid: authorOpenid,
    updatedAt: Date.now()
  }
  if (Array.isArray(input.images)) patch.images = normalizeImages(input.images)

  await db.collection('records').doc(String(id)).update({ data: patch })

  return { ok: true }
}

async function deleteRecord(openid, id) {
  const couple = await findCouple(openid)
  if (!couple) return { error: 'NO_COUPLE' }
  if (!id) return { error: 'BAD_RECORD' }

  const res = await db.collection('records').doc(String(id)).get().catch(function () {
    return null
  })
  const doc = res && res.data
  if (!doc || doc.coupleId !== couple._id) return { error: 'NOT_FOUND' }

  await db.collection('records').doc(String(id)).remove()
  return { ok: true }
}

async function saveProfile(openid, event) {
  const couple = await findCouple(openid)
  if (!couple) return { error: 'NO_COUPLE' }

  const members = (couple.members || []).map(function (member) {
    if (member.openid !== openid) return member
    return Object.assign({}, member, {
      name: event.name ? String(event.name).slice(0, 12) : member.name,
      emoji: event.emoji || member.emoji
    })
  })

  const patch = { members: members, updatedAt: Date.now() }
  if (event.settings) {
    patch.settings = normalizeSettings(Object.assign({}, couple.settings, event.settings))
  }

  await db.collection('couples').doc(couple._id).update({ data: patch })
  return { ok: true }
}

async function clearRecords(openid) {
  const couple = await findCouple(openid)
  if (!couple) return { error: 'NO_COUPLE' }
  await db.collection('records').where({ coupleId: couple._id }).remove()
  return { ok: true }
}

async function unbind(openid) {
  const couple = await findCouple(openid)
  if (!couple) return { ok: true }

  const memberOpenids = (couple.memberOpenids || []).filter(function (item) {
    return item !== openid
  })
  const members = (couple.members || []).filter(function (item) {
    return item.openid !== openid
  })

  await db
    .collection('couples')
    .doc(couple._id)
    .update({ data: { memberOpenids: memberOpenids, members: members, updatedAt: Date.now() } })

  return { ok: true }
}

exports.main = async function (event) {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const env = wxContext.ENV || wxContext.env || ''
  const action = event && event.action

  try {
    if (action !== 'initDb') await ensureCollections()

    switch (action) {
      case 'initDb': {
        const result = await initDb(env)
        const couple = await findCouple(openid)
        if (couple) {
          try {
            result.seeded = await kitchenApi.seedPresets(openid, couple)
          } catch (err) {
            result.seedError = errorMessage(err)
          }
        }
        return result
      }
      case 'state':
        return await stateOf(openid)
      case 'createCouple':
        return await createCouple(openid)
      case 'joinCouple':
        return await joinCouple(openid, event.code)
      case 'listRecords':
        return await listRecords(openid)
      case 'addRecord':
        return await addRecord(openid, event.record)
      case 'updateRecord':
        return await updateRecord(openid, event.id, event.record)
      case 'deleteRecord':
        return await deleteRecord(openid, event.id)
      case 'clearRecords':
        return await clearRecords(openid)
      case 'saveProfile':
        return await saveProfile(openid, event)
      case 'unbind':
        return await unbind(openid)
      case 'getKitchen':
        return await kitchenApi.getKitchen(openid)
      case 'saveDish':
        return await kitchenApi.saveDish(openid, event.dish)
      case 'deleteDish':
        return await kitchenApi.deleteDish(openid, event.id)
      case 'createOrder':
        return await kitchenApi.createOrder(openid, event.order)
      case 'startCooking':
        return await kitchenApi.startCooking(openid, event.id)
      case 'saveCooking':
        return await kitchenApi.saveCooking(openid, event.id, event.cooking)
      case 'cancelOrder':
        return await kitchenApi.cancelOrder(openid, event.id)
      case 'reviewOrder':
        return await kitchenApi.reviewOrder(openid, event.id, event.review)
      default:
        return { error: 'UNKNOWN_ACTION' }
    }
  } catch (err) {
    console.error('[api]', action, err)
    return { error: 'SERVER_ERROR', message: String((err && err.message) || err) }
  }
}
