// 云函数 api：情侣空间与记录的唯一数据出入口
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
let collectionsEnsured = false

// 首次调用时自动建集合，省去手动创建；失败也不影响已有集合
async function ensureCollections() {
  if (collectionsEnsured) return
  collectionsEnsured = true
  if (typeof db.createCollection !== 'function') return
  await Promise.all(
    ['couples', 'records'].map(function (name) {
      return Promise.resolve()
        .then(function () {
          return db.createCollection(name)
        })
        .catch(function () {
          return null
        })
    })
  )
}

function normalizeImages(images) {
  if (!Array.isArray(images)) return []
  return images
    .filter(function (item) {
      return typeof item === 'string' && item.indexOf('cloud://') === 0
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
  const action = event && event.action

  try {
    await ensureCollections()

    switch (action) {
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
      default:
        return { error: 'UNKNOWN_ACTION' }
    }
  } catch (err) {
    console.error('[api]', action, err)
    return { error: 'SERVER_ERROR', message: String((err && err.message) || err) }
  }
}
