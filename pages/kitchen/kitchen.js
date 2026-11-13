const store = require('../../utils/store')
const kitchen = require('../../utils/kitchen')
const images = require('../../utils/images')
const { todayStr } = require('../../utils/util')

const ACTIVE_STATUS = ['pending', 'cooking', 'served']

Page({
  data: {
    tabs: [
      { key: 'menu', label: '点餐' },
      { key: 'orders', label: '订单' },
      { key: 'manage', label: '菜单管理' }
    ],
    orderRoles: [
      { key: 'mine', label: '我点的' },
      { key: 'cook', label: '我为 TA 做' }
    ],
    kindOptions: [
      { key: 'dish', label: '具体菜' },
      { key: 'favor', label: '一件小事' }
    ],
    stars: [1, 2, 3, 4, 5],
    profile: store.DEFAULT_PROFILE,
    viewState: 'loading',
    errorText: '',
    collectionsReady: true,
    hasPartner: false,
    myOpenid: '',
    tab: 'menu',
    orderRole: 'mine',
    menuDishes: [],
    managedDishes: [],
    orders: [],
    activeOrders: [],
    historyOrders: [],
    working: false,
    uploading: false,
    sheet: '',
    templateFilter: 'all',
    templateTotal: kitchen.TEMPLATES.length,
    visibleTemplates: kitchen.TEMPLATES,
    selectedDish: null,
    orderForm: { quantity: 1, note: '' },
    dishForm: { id: '', name: '', kind: 'dish', description: '', image: '', available: true },
    cookForm: { id: '', dishName: '', note: '', images: [] },
    reviewForm: { id: '', dishName: '', rating: 5, review: '' },
    addedImages: [],
    removedImages: []
  },

  onShow: function () {
    this.load()
  },

  onPullDownRefresh: function () {
    const stop = function () {
      wx.stopPullDownRefresh()
    }
    this.load().then(stop, stop)
  },

  load: function () {
    const that = this
    const seq = (this._loadSeq || 0) + 1
    this._loadSeq = seq
    this.setData({ profile: store.getProfile() })

    return kitchen.load().then(function (res) {
      // onShow / 下拉 / 操作后刷新可能叠加，丢弃迟到的旧结果
      if (seq !== that._loadSeq) return
      that.setData({
        viewState: 'ready',
        errorText: '',
        collectionsReady: res.collectionsReady !== false,
        hasPartner: !!res.partnerOpenid,
        myOpenid: res.openid
      })
      that.applyData(res.dishes || [], res.orders || [])
      if (res.seeded) {
        wx.showToast({ title: '已备好 ' + res.seeded + ' 道预置菜单', icon: 'none' })
      }
    }).catch(function (err) {
      if (seq !== that._loadSeq) return
      const code = (err && err.code) || 'FAILED'
      const detail = String((err && err.detail) || '').slice(0, 60)
      console.error('[kitchen] load failed', code, err)
      that.setData({
        viewState: code === 'NO_COUPLE' ? 'unbound' : 'error',
        errorText: (kitchen.ERROR_TEXT[code] || kitchen.ERROR_TEXT.FAILED) +
          (detail ? '（' + detail + '）' : '')
      })
    })
  },

  applyData: function (dishes, orders) {
    const myOpenid = this.data.myOpenid
    const that = this
    this._dishes = dishes

    const menuDishes = dishes.filter(function (dish) {
      return dish.dinerOpenid === myOpenid && dish.available
    })
    const managedDishes = dishes.filter(function (dish) {
      return dish.chefOpenid === myOpenid
    })
    const decoratedOrders = orders.map(function (order) {
      return that.decorateOrder(order)
    })

    this.setData({
      menuDishes: menuDishes,
      managedDishes: managedDishes,
      orders: decoratedOrders
    }, function () {
      that.filterOrders()
    })
  },

  decorateOrder: function (order) {
    const myOpenid = this.data.myOpenid
    const isMine = order.dinerOpenid === myOpenid
    const status = kitchen.STATUS[order.status] || kitchen.STATUS.pending
    const rating = Math.max(0, Math.min(5, Number(order.rating) || 0))

    return Object.assign({}, order, {
      cookImages: order.cookImages || [],
      statusLabel: status.label,
      statusTone: status.tone,
      createdText: kitchen.formatTime(order.createdAt),
      servedText: kitchen.formatTime(order.servedAt),
      canStart: !isMine && order.status === 'pending',
      canCook: !isMine && order.status === 'cooking',
      canReview: isMine && order.status === 'served',
      canCancel: isMine && order.status === 'pending',
      ratingText: rating ? new Array(rating + 1).join('★') + new Array(6 - rating).join('☆') : ''
    })
  },

  filterOrders: function () {
    const myOpenid = this.data.myOpenid
    const showMine = this.data.orderRole === 'mine'
    const list = this.data.orders.filter(function (order) {
      return showMine ? order.dinerOpenid === myOpenid : order.chefOpenid === myOpenid
    })

    this.setData({
      activeOrders: list.filter(function (order) {
        return ACTIVE_STATUS.indexOf(order.status) >= 0
      }),
      historyOrders: list.filter(function (order) {
        return ACTIVE_STATUS.indexOf(order.status) < 0
      })
    })
  },

  onSwitchTab: function (e) {
    this.setData({ tab: e.currentTarget.dataset.key })
  },

  onSwitchOrderRole: function (e) {
    const that = this
    this.setData({ orderRole: e.currentTarget.dataset.key }, function () {
      that.filterOrders()
    })
  },

  onGoMine: function () {
    wx.switchTab({ url: '/pages/mine/mine' })
  },

  onRetry: function () {
    this.setData({ viewState: 'loading' })
    this.load()
  },

  onInitDb: function () {
    const that = this
    if (this.data.working) return
    this.setData({ working: true })
    wx.showLoading({ title: '正在初始化', mask: true })

    kitchen.initDb().then(function (res) {
      wx.hideLoading()
      that.setData({ working: false })
      const failed = (res.collections || []).filter(function (item) {
        return item.status === 'failed'
      })
      const envText = res.env ? '云环境：' + res.env + '\n' : ''
      const seedNote = res.seedError ? '\n预置菜单失败：' + String(res.seedError).slice(0, 120) : ''
      wx.showModal({
        title: failed.length ? '集合创建失败' : '数据库已就绪',
        content: envText + (failed.length
          ? failed.map(function (item) {
              return item.name + '：' + String(item.message || '').slice(0, 120)
            }).join('\n') + '\n\n也可以在云开发控制台手动新建 kitchenDishes、kitchenOrders。'
          : '集合已就绪' + (res.seeded ? '，已备好 ' + res.seeded + ' 道预置菜单' : '') + '，正在重新加载厨房。') + seedNote,
        showCancel: false,
        success: function () {
          if (!failed.length) that.load()
        }
      })
    }).catch(function (err) {
      wx.hideLoading()
      that.setData({ working: false })
      const code = (err && err.code) || 'FAILED'
      wx.showModal({
        title: '初始化失败',
        content: (kitchen.ERROR_TEXT[code] || kitchen.ERROR_TEXT.FAILED) +
          (err && err.detail ? '\n' + String(err.detail).slice(0, 120) : ''),
        showCancel: false
      })
    })
  },

  showError: function (err) {
    const code = (err && err.code) || 'FAILED'
    wx.showToast({
      title: kitchen.ERROR_TEXT[code] || kitchen.ERROR_TEXT.FAILED,
      icon: 'none',
      duration: 2400
    })
  },

  perform: function (promise, successText) {
    const that = this
    if (this.data.working) return Promise.resolve(false)
    this.setData({ working: true })
    wx.showLoading({ title: '请稍等', mask: true })

    return promise.then(function () {
      wx.hideLoading()
      that.setData({ working: false, sheet: '', addedImages: [], removedImages: [] })
      if (successText) wx.showToast({ title: successText, icon: 'none' })
      return that.load().then(function () {
        return true
      })
    }).catch(function (err) {
      wx.hideLoading()
      that.setData({ working: false })
      that.showError(err)
      return false
    })
  },

  findDish: function (id) {
    return (this._dishes || []).filter(function (dish) {
      return dish._id === id
    })[0]
  },

  findOrder: function (id) {
    return this.data.orders.filter(function (order) {
      return order._id === id
    })[0]
  },

  noop: function () {},

  closeSheet: function () {
    if (this.data.working || this.data.uploading) return
    if (this.data.addedImages.length) images.removeFiles(this.data.addedImages)
    this.setData({ sheet: '', addedImages: [], removedImages: [], selectedDish: null })
  },

  chooseImages: function (count) {
    const that = this
    if (this.data.uploading) return Promise.resolve(null)

    return images.pick(count).then(function (files) {
      const selected = files.filter(function (file) {
        return !file.size || file.size <= images.MAX_SIZE
      }).slice(0, count)
      if (files.length > selected.length) {
        wx.showToast({ title: '有图片超过 50MB，已跳过', icon: 'none' })
      }
      if (!selected.length) return null

      that.setData({ uploading: true })
      wx.showLoading({ title: '原图上传中', mask: true })
      return images.uploadAll(selected.map(function (file) {
        return file.path
      }), todayStr()).then(function (fileIDs) {
        wx.hideLoading()
        that.setData({ uploading: false })
        return fileIDs
      })
    }).catch(function (err) {
      wx.hideLoading()
      that.setData({ uploading: false })
      const message = String((err && (err.errMsg || err.message)) || '')
      if (message.indexOf('cancel') < 0) that.showError(err)
      return null
    })
  },

  onPreviewImage: function (e) {
    const data = e.currentTarget.dataset
    const current = data.current || ''
    const list = data.images && data.images.length ? data.images : (current ? [current] : [])
    images.preview(list, current)
  },

  /* 点餐 */
  onOpenOrder: function (e) {
    const dish = this.findDish(e.currentTarget.dataset.id)
    if (!dish) return
    this.setData({
      sheet: 'order',
      selectedDish: dish,
      orderForm: { quantity: 1, note: '' },
      addedImages: [],
      removedImages: []
    })
  },

  onOrderMinus: function () {
    const quantity = this.data.orderForm.quantity
    if (quantity <= 1) return
    this.setData({ 'orderForm.quantity': quantity - 1 })
  },

  onOrderPlus: function () {
    const quantity = this.data.orderForm.quantity
    if (quantity >= 9) return
    this.setData({ 'orderForm.quantity': quantity + 1 })
  },

  onOrderNote: function (e) {
    this.setData({ 'orderForm.note': e.detail.value })
  },

  onSubmitOrder: function () {
    const dish = this.data.selectedDish
    if (!dish || this.data.working) return
    this.perform(kitchen.createOrder({
      dishId: dish._id,
      quantity: this.data.orderForm.quantity,
      note: this.data.orderForm.note
    }), '下单成功，等 TA 下厨')
  },

  /* 菜单定制 */
  emptyDishForm: function () {
    return { id: '', name: '', kind: 'dish', description: '', image: '', available: true }
  },

  onOpenDishEditor: function (e) {
    const id = e.currentTarget.dataset.id || ''
    const dish = id ? this.findDish(id) : null
    if (dish) {
      this.setData({
        sheet: 'dish',
        dishForm: {
          id: dish._id,
          name: dish.name,
          kind: dish.kind || 'dish',
          description: dish.description || '',
          image: dish.image || '',
          available: dish.available !== false
        },
        addedImages: [],
        removedImages: []
      })
      return
    }

    // 新增时先选模板，也可以直接从空白开始
    this.setData({
      sheet: 'template',
      templateFilter: 'all',
      visibleTemplates: kitchen.TEMPLATES,
      dishForm: this.emptyDishForm(),
      addedImages: [],
      removedImages: []
    })
  },

  onSwitchTemplateFilter: function (e) {
    const key = e.currentTarget.dataset.key
    const list = key === 'all'
      ? kitchen.TEMPLATES
      : kitchen.TEMPLATES.filter(function (item) {
          return item.kind === key
        })
    this.setData({ templateFilter: key, visibleTemplates: list })
  },

  onPickTemplate: function (e) {
    const item = this.data.visibleTemplates[Number(e.currentTarget.dataset.index)]
    if (!item) return
    this.setData({
      sheet: 'dish',
      dishForm: {
        id: '',
        name: item.name,
        kind: item.kind,
        description: item.description,
        image: item.image,
        available: true
      },
      addedImages: [],
      removedImages: []
    })
  },

  onCustomDish: function () {
    this.setData({
      sheet: 'dish',
      dishForm: this.emptyDishForm(),
      addedImages: [],
      removedImages: []
    })
  },

  onDishName: function (e) {
    this.setData({ 'dishForm.name': e.detail.value })
  },

  onDishKind: function (e) {
    this.setData({ 'dishForm.kind': e.currentTarget.dataset.key })
  },

  onDishDescription: function (e) {
    this.setData({ 'dishForm.description': e.detail.value })
  },

  onDishAvailable: function (e) {
    this.setData({ 'dishForm.available': e.detail.value })
  },

  onDishImage: function () {
    const that = this
    this.chooseImages(1).then(function (fileIDs) {
      if (!fileIDs || !fileIDs.length) return
      const previous = that.data.dishForm.image
      const removed = previous ? that.data.removedImages.concat([previous]) : that.data.removedImages
      that.setData({
        'dishForm.image': fileIDs[0],
        addedImages: that.data.addedImages.concat(fileIDs),
        removedImages: removed
      })
    })
  },

  onRemoveDishImage: function () {
    const previous = this.data.dishForm.image
    if (!previous) return
    this.setData({
      'dishForm.image': '',
      removedImages: this.data.removedImages.concat([previous])
    })
  },

  onSubmitDish: function () {
    const form = this.data.dishForm
    if (this.data.working || this.data.uploading) return
    if (!String(form.name || '').trim()) {
      wx.showToast({ title: '先起个名字吧', icon: 'none' })
      return
    }
    const removed = this.data.removedImages.slice()
    this.perform(kitchen.saveDish(form), form.id ? '菜单已更新' : '已加入 TA 的菜单').then(function (ok) {
      if (ok) images.removeFiles(removed)
    })
  },

  onDeleteDish: function (e) {
    const id = e.currentTarget.dataset.id
    const that = this
    wx.showModal({
      title: '删除这道菜？',
      content: '删除后 TA 的菜单里就看不到了，已经产生的订单会保留。',
      confirmText: '删除',
      confirmColor: '#D9535C',
      success: function (res) {
        if (res.confirm && !that.data.working) that.perform(kitchen.deleteDish(id), '已删除')
      }
    })
  },

  /* 制作与出餐 */
  onStartCooking: function (e) {
    if (this.data.working) return
    this.perform(kitchen.startCooking(e.currentTarget.dataset.id), '开始制作啦')
  },

  onOpenCook: function (e) {
    const order = this.findOrder(e.currentTarget.dataset.id)
    if (!order) return
    this.setData({
      sheet: 'cook',
      cookForm: {
        id: order._id,
        dishName: order.dishName,
        note: order.cookNote || '',
        images: (order.cookImages || []).slice()
      },
      addedImages: [],
      removedImages: []
    })
  },

  onCookNote: function (e) {
    this.setData({ 'cookForm.note': e.detail.value })
  },

  onCookImage: function () {
    const that = this
    const left = images.MAX_COUNT - this.data.cookForm.images.length
    if (left <= 0) return
    this.chooseImages(left).then(function (fileIDs) {
      if (!fileIDs || !fileIDs.length) return
      that.setData({
        'cookForm.images': that.data.cookForm.images.concat(fileIDs),
        addedImages: that.data.addedImages.concat(fileIDs)
      })
    })
  },

  onRemoveCookImage: function (e) {
    const index = Number(e.currentTarget.dataset.index)
    const list = this.data.cookForm.images.slice()
    const removed = list.splice(index, 1)[0]
    if (!removed) return
    this.setData({
      'cookForm.images': list,
      removedImages: this.data.removedImages.concat([removed])
    })
  },

  submitCooking: function (serve) {
    const form = this.data.cookForm
    if (!form.id || this.data.working || this.data.uploading) return
    const removed = this.data.removedImages.slice()
    this.perform(kitchen.saveCooking(form.id, {
      note: form.note,
      images: form.images,
      serve: serve
    }), serve ? '出餐啦，等 TA 来用餐' : '制作内容已保存').then(function (ok) {
      if (ok) images.removeFiles(removed)
    })
  },

  onSaveCooking: function () {
    this.submitCooking(false)
  },

  onServeOrder: function () {
    this.submitCooking(true)
  },

  onCancelOrder: function (e) {
    const id = e.currentTarget.dataset.id
    const that = this
    wx.showModal({
      title: '取消这个订单？',
      content: 'TA 还没有开始制作，取消后不可恢复。',
      confirmText: '取消订单',
      confirmColor: '#D9535C',
      success: function (res) {
        if (res.confirm && !that.data.working) that.perform(kitchen.cancelOrder(id), '订单已取消')
      }
    })
  },

  /* 用餐评价 */
  onOpenReview: function (e) {
    const order = this.findOrder(e.currentTarget.dataset.id)
    if (!order) return
    this.setData({
      sheet: 'review',
      reviewForm: { id: order._id, dishName: order.dishName, rating: 5, review: '' },
      addedImages: [],
      removedImages: []
    })
  },

  onPickRating: function (e) {
    this.setData({ 'reviewForm.rating': Number(e.currentTarget.dataset.value) })
  },

  onReviewInput: function (e) {
    this.setData({ 'reviewForm.review': e.detail.value })
  },

  onSubmitReview: function () {
    const form = this.data.reviewForm
    if (!form.id || this.data.working) return
    this.perform(kitchen.reviewOrder(form.id, {
      rating: form.rating,
      review: form.review
    }), '评价已收到，合作愉快')
  }
})
