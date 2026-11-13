// 御膳房：双方互相当厨师/食客，订单状态由服务端校验流转
const PRESET_VERSION = 2

// 首次开伙时补齐的常用菜和小心意，配图为小程序内置资源。
// version 用于增量补齐：升级模板时只写新批次，不动用户已删掉的旧菜。
const PRESETS = [
  { version: 1, presetId: 'tomato-egg', name: '番茄炒蛋', kind: 'dish', description: '酸甜下饭，十分钟就能端上桌', image: '/images/dishes/dish-01.jpg' },
  { version: 1, presetId: 'cola-chicken', name: '可乐鸡翅', kind: 'dish', description: '甜咸入味，新手也不容易翻车', image: '/images/dishes/dish-02.jpg' },
  { version: 1, presetId: 'egg-fried-rice', name: '蛋炒饭', kind: 'dish', description: '冰箱剩饭的救星，加个蛋就很香', image: '/images/dishes/dish-03.jpg' },
  { version: 1, presetId: 'plain-noodles', name: '阳春面', kind: 'dish', description: '一碗清汤面，热乎乎地哄你开心', image: '/images/dishes/dish-04.jpg' },
  { version: 1, presetId: 'braised-pork', name: '红烧肉', kind: 'dish', description: '周末慢慢炖一锅，配米饭刚好', image: '/images/dishes/dish-05.jpg' },
  { version: 1, presetId: 'tremella-soup', name: '银耳莲子羹', kind: 'dish', description: '睡前一小碗甜汤，润润的', image: '/images/dishes/dish-06.jpg' },
  { version: 1, presetId: 'evening-walk', name: '一起散步半小时', kind: 'favor', description: '不带手机，慢慢走，只聊天', image: '/images/dishes/idea-01.jpg' },
  { version: 1, presetId: 'hot-tea', name: '给 TA 泡杯热茶', kind: 'favor', description: '什么都不用说，把杯子递过去就好', image: '/images/dishes/idea-02.jpg' },

  { version: 2, presetId: 'shredded-potato', name: '酸辣土豆丝', kind: 'dish', description: '爽脆开胃，五分钟就能出锅', image: '/images/dishes/dish-07.jpg' },
  { version: 2, presetId: 'garlic-broccoli', name: '蒜蓉西兰花', kind: 'dish', description: '清清爽爽，吃多了也不腻', image: '/images/dishes/dish-08.jpg' },
  { version: 2, presetId: 'tomato-beef', name: '番茄牛腩', kind: 'dish', description: '慢慢炖到软烂，汤汁别浪费', image: '/images/dishes/dish-09.jpg' },
  { version: 2, presetId: 'scallion-noodles', name: '葱油拌面', kind: 'dish', description: '葱香一拌，懒人也有仪式感', image: '/images/dishes/dish-10.jpg' },
  { version: 2, presetId: 'winter-melon-soup', name: '冬瓜排骨汤', kind: 'dish', description: '一锅热汤，从胃暖到心里', image: '/images/dishes/dish-11.jpg' },
  { version: 2, presetId: 'pan-fried-dumplings', name: '香煎饺子', kind: 'dish', description: '底部焦脆，蘸一点点醋', image: '/images/dishes/dish-12.jpg' },
  { version: 2, presetId: 'red-bean-soup', name: '红豆沙', kind: 'dish', description: '饭后一小碗甜的，慢慢喝', image: '/images/dishes/dish-13.jpg' },
  { version: 2, presetId: 'mapo-tofu', name: '麻婆豆腐', kind: 'dish', description: '麻辣鲜香，米饭要多盛一碗', image: '/images/dishes/dish-14.jpg' },
  { version: 2, presetId: 'shoulder-massage', name: '帮 TA 按肩 15 分钟', kind: 'favor', description: '加班后的专属福利，力道随你', image: '/images/dishes/idea-03.jpg' },
  { version: 2, presetId: 'old-movie', name: '一起看一部老电影', kind: 'favor', description: '你选片，我负责零食和毯子', image: '/images/dishes/idea-04.jpg' },
  { version: 2, presetId: 'breakfast-together', name: '早起做一次早餐', kind: 'favor', description: '煎蛋烤面包，不赶时间地吃完', image: '/images/dishes/idea-05.jpg' },
  { version: 2, presetId: 'little-note', name: '写一张小纸条', kind: 'favor', description: '塞进包里，等 TA 自己发现', image: '/images/dishes/idea-06.jpg' }
]

module.exports = function createKitchenApi(deps) {
  const db = deps.db
  const findCouple = deps.findCouple
  const normalizeImages = deps.normalizeImages

  async function contextOf(openid, partnerRequired) {
    const couple = await findCouple(openid)
    if (!couple) return { error: 'NO_COUPLE' }
    const partnerOpenid = (couple.memberOpenids || []).filter(function (id) {
      return id !== openid
    })[0] || ''
    if (partnerRequired && !partnerOpenid) return { error: 'PARTNER_REQUIRED' }
    return { couple: couple, partnerOpenid: partnerOpenid }
  }

  async function findDish(id) {
    if (!id) return null
    const res = await db.collection('kitchenDishes').doc(String(id)).get().catch(function () {
      return null
    })
    return res && res.data
  }

  async function findOrder(id) {
    if (!id) return null
    const res = await db.collection('kitchenOrders').doc(String(id)).get().catch(function () {
      return null
    })
    return res && res.data
  }

  function isCollectionMissing(err) {
    const code = String((err && (err.errCode || err.code)) || '')
    const message = String((err && (err.errMsg || err.message)) || err || '')
    return code === '-502005' ||
      /collection.*(not exist|not found)|COLLECTION_NOT_EXIST|不存在/i.test(message)
  }

  // 集合还没建好（首次启动、并发创建中）时按空列表返回，
  // 保证厨房能正常初始化，其它数据库错误仍照常抛出。
  async function listOrEmpty(query, name) {
    try {
      const res = await query
      return { data: (res && res.data) || [], ready: true }
    } catch (err) {
      if (!isCollectionMissing(err)) throw err
      console.warn('[kitchen] collection not ready:', name, err)
      return { data: [], ready: false }
    }
  }

  // 按版本增量补齐：只写新批次，用户删掉的旧菜不会被补回来；
  // 同一批次内按 presetId 去重，避免双端并发重复写入
  async function seedPresets(openid, couple) {
    const current = couple.presetSeededVersion || 0
    if (current >= PRESET_VERSION) return 0
    const partnerOpenid = (couple.memberOpenids || []).filter(function (id) {
      return id !== openid
    })[0]
    if (!partnerOpenid) return 0

    const now = Date.now()
    let created = 0
    for (let i = 0; i < PRESETS.length; i++) {
      const item = PRESETS[i]
      if (item.version <= current) continue
      const exists = await db.collection('kitchenDishes')
        .where({ coupleId: couple._id, presetId: item.presetId })
        .limit(1)
        .get()
      if (exists.data && exists.data.length) continue

      // 一半由 TA 为「我」定制（点餐菜单），一半由「我」为 TA 定制（菜单管理）
      const forMe = i % 2 === 0
      await db.collection('kitchenDishes').add({
        data: {
          coupleId: couple._id,
          presetId: item.presetId,
          name: item.name,
          kind: item.kind,
          description: item.description,
          image: item.image,
          available: true,
          chefOpenid: forMe ? partnerOpenid : openid,
          dinerOpenid: forMe ? openid : partnerOpenid,
          createdAt: now + i,
          updatedAt: now + i
        }
      })
      created++
    }

    await db.collection('couples').doc(couple._id).update({
      data: { presetSeededVersion: PRESET_VERSION }
    })
    return created
  }

  async function getKitchen(openid) {
    const ctx = await contextOf(openid, false)
    if (ctx.error) return { error: ctx.error }

    let seeded = 0
    try {
      seeded = await seedPresets(openid, ctx.couple)
    } catch (err) {
      // 预置失败不影响厨房本身可用
      console.warn('[kitchen] seed presets failed', err)
    }

    const results = await Promise.all([
      listOrEmpty(
        db.collection('kitchenDishes')
          .where({ coupleId: ctx.couple._id })
          .orderBy('createdAt', 'desc')
          .limit(500)
          .get(),
        'kitchenDishes'
      ),
      listOrEmpty(
        db.collection('kitchenOrders')
          .where({ coupleId: ctx.couple._id })
          .orderBy('createdAt', 'desc')
          .limit(500)
          .get(),
        'kitchenOrders'
      )
    ])

    return {
      ok: true,
      openid: openid,
      coupleId: ctx.couple._id,
      partnerOpenid: ctx.partnerOpenid,
      dishes: results[0].data,
      orders: results[1].data,
      collectionsReady: results[0].ready && results[1].ready,
      seeded: seeded
    }
  }

  async function saveDish(openid, input) {
    const data = input || {}
    const name = String(data.name || '').trim().slice(0, 24)
    if (!name) return { error: 'BAD_DISH' }

    const isEdit = !!data.id
    const ctx = await contextOf(openid, !isEdit)
    if (ctx.error) return { error: ctx.error }

    const image = normalizeImages(data.image ? [data.image] : [])[0] || ''
    const patch = {
      name: name,
      kind: data.kind === 'favor' ? 'favor' : 'dish',
      description: String(data.description || '').trim().slice(0, 200),
      image: image,
      available: data.available !== false,
      updatedAt: Date.now()
    }

    if (isEdit) {
      const dish = await findDish(data.id)
      if (!dish || dish.coupleId !== ctx.couple._id) return { error: 'NOT_FOUND' }
      if (dish.chefOpenid !== openid) return { error: 'FORBIDDEN' }
      await db.collection('kitchenDishes').doc(String(data.id)).update({ data: patch })
      return { ok: true, id: String(data.id) }
    }

    const doc = Object.assign({}, patch, {
      coupleId: ctx.couple._id,
      chefOpenid: openid,
      dinerOpenid: ctx.partnerOpenid,
      createdAt: Date.now()
    })
    const res = await db.collection('kitchenDishes').add({ data: doc })
    return { ok: true, id: res._id }
  }

  async function deleteDish(openid, id) {
    const ctx = await contextOf(openid, false)
    if (ctx.error) return { error: ctx.error }
    const dish = await findDish(id)
    if (!dish || dish.coupleId !== ctx.couple._id) return { error: 'NOT_FOUND' }
    if (dish.chefOpenid !== openid) return { error: 'FORBIDDEN' }
    await db.collection('kitchenDishes').doc(String(id)).remove()
    return { ok: true }
  }

  async function createOrder(openid, input) {
    const ctx = await contextOf(openid, true)
    if (ctx.error) return { error: ctx.error }

    const data = input || {}
    const dish = await findDish(data.dishId)
    if (!dish || dish.coupleId !== ctx.couple._id) return { error: 'NOT_FOUND' }
    if (!dish.available) return { error: 'DISH_OFF' }
    if (dish.dinerOpenid !== openid || dish.chefOpenid !== ctx.partnerOpenid) {
      return { error: 'FORBIDDEN' }
    }

    const quantity = Math.max(1, Math.min(9, Number(data.quantity) || 1))
    const now = Date.now()
    const doc = {
      coupleId: ctx.couple._id,
      dishId: dish._id,
      dishName: dish.name,
      dishKind: dish.kind,
      dishDescription: dish.description || '',
      dishImage: dish.image || '',
      dinerOpenid: openid,
      chefOpenid: dish.chefOpenid,
      quantity: quantity,
      orderNote: String(data.note || '').trim().slice(0, 100),
      status: 'pending',
      cookNote: '',
      cookImages: [],
      rating: 0,
      review: '',
      createdAt: now,
      updatedAt: now
    }
    const res = await db.collection('kitchenOrders').add({ data: doc })
    return { ok: true, id: res._id }
  }

  async function startCooking(openid, id) {
    const ctx = await contextOf(openid, false)
    if (ctx.error) return { error: ctx.error }
    const order = await findOrder(id)
    if (!order || order.coupleId !== ctx.couple._id) return { error: 'NOT_FOUND' }
    if (order.chefOpenid !== openid) return { error: 'FORBIDDEN' }
    if (order.status !== 'pending') return { error: 'BAD_STATUS' }

    await db.collection('kitchenOrders').doc(String(id)).update({
      data: { status: 'cooking', startedAt: Date.now(), updatedAt: Date.now() }
    })
    return { ok: true }
  }

  async function saveCooking(openid, id, input) {
    const ctx = await contextOf(openid, false)
    if (ctx.error) return { error: ctx.error }
    const order = await findOrder(id)
    if (!order || order.coupleId !== ctx.couple._id) return { error: 'NOT_FOUND' }
    if (order.chefOpenid !== openid) return { error: 'FORBIDDEN' }
    if (['pending', 'cooking'].indexOf(order.status) < 0) return { error: 'BAD_STATUS' }

    const data = input || {}
    const serve = !!data.serve
    const now = Date.now()
    const patch = {
      cookNote: String(data.note || '').trim().slice(0, 200),
      cookImages: normalizeImages(data.images),
      status: serve ? 'served' : 'cooking',
      startedAt: order.startedAt || now,
      updatedAt: now
    }
    if (serve) patch.servedAt = now

    await db.collection('kitchenOrders').doc(String(id)).update({ data: patch })
    return { ok: true }
  }

  async function cancelOrder(openid, id) {
    const ctx = await contextOf(openid, false)
    if (ctx.error) return { error: ctx.error }
    const order = await findOrder(id)
    if (!order || order.coupleId !== ctx.couple._id) return { error: 'NOT_FOUND' }
    if (order.dinerOpenid !== openid) return { error: 'FORBIDDEN' }
    if (order.status !== 'pending') return { error: 'BAD_STATUS' }

    await db.collection('kitchenOrders').doc(String(id)).update({
      data: { status: 'cancelled', cancelledAt: Date.now(), updatedAt: Date.now() }
    })
    return { ok: true }
  }

  async function reviewOrder(openid, id, input) {
    const ctx = await contextOf(openid, false)
    if (ctx.error) return { error: ctx.error }
    const order = await findOrder(id)
    if (!order || order.coupleId !== ctx.couple._id) return { error: 'NOT_FOUND' }
    if (order.dinerOpenid !== openid) return { error: 'FORBIDDEN' }
    if (order.status !== 'served') return { error: 'BAD_STATUS' }

    const data = input || {}
    const rating = Math.round(Number(data.rating))
    if (!isFinite(rating) || rating < 1 || rating > 5) return { error: 'RATING_REQUIRED' }

    await db.collection('kitchenOrders').doc(String(id)).update({
      data: {
        status: 'completed',
        rating: rating,
        review: String(data.review || '').trim().slice(0, 200),
        eatenAt: Date.now(),
        completedAt: Date.now(),
        updatedAt: Date.now()
      }
    })
    return { ok: true }
  }

  return {
    getKitchen: getKitchen,
    seedPresets: seedPresets,
    saveDish: saveDish,
    deleteDish: deleteDish,
    createOrder: createOrder,
    startCooking: startCooking,
    saveCooking: saveCooking,
    cancelOrder: cancelOrder,
    reviewOrder: reviewOrder
  }
}
