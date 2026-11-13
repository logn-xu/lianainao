const { TYPES, TYPE_MAP } = require('../../utils/types')
const store = require('../../utils/store')
const images = require('../../utils/images')
const { todayStr, formatTime, relativeDayLabel } = require('../../utils/util')

Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    show: {
      type: Boolean,
      value: false,
      observer: function (value) {
        if (value) this.initForm()
      }
    },
    defaultType: {
      type: String,
      value: 'milktea'
    },
    editRecord: {
      type: Object,
      value: null
    }
  },

  data: {
    types: TYPES,
    current: TYPE_MAP.milktea,
    profile: store.DEFAULT_PROFILE,
    maxDate: '',
    editing: false,
    uploading: false,
    removedImages: [],
    addedImages: [],
    form: {
      type: 'milktea',
      date: '',
      dateLabel: '今天',
      time: '00:00',
      amount: 1,
      note: '',
      authorId: 'me',
      images: []
    }
  },

  lifetimes: {
    attached: function () {
      this.setData({ maxDate: todayStr() })
    }
  },

  methods: {
    initForm: function () {
      // 编辑模式：用原记录回填
      const editing = this.data.editRecord
      if (editing && editing.id) {
        const type = TYPE_MAP[editing.type] ? editing.type : 'note'
        this.setData({
          editing: true,
          uploading: false,
          removedImages: [],
          addedImages: [],
          profile: store.getProfile(),
          current: TYPE_MAP[type],
          maxDate: todayStr(),
          form: {
            type: type,
            date: editing.date,
            dateLabel: relativeDayLabel(editing.date),
            time: editing.time || formatTime(new Date()),
            amount: editing.amount || 1,
            note: editing.note || '',
            authorId: editing.authorId === 'ta' ? 'ta' : 'me',
            images: (editing.images || []).slice()
          }
        })
        return
      }

      const type = TYPE_MAP[this.data.defaultType] ? this.data.defaultType : 'milktea'
      this.setData({
        editing: false,
        uploading: false,
        removedImages: [],
        addedImages: [],
        profile: store.getProfile(),
        current: TYPE_MAP[type],
        maxDate: todayStr(),
        form: {
          type: type,
          date: todayStr(),
          dateLabel: '今天',
          time: formatTime(new Date()),
          amount: 1,
          note: '',
          authorId: 'me',
          images: []
        }
      })
    },

    noop: function () {},

    onClose: function () {
      // 取消编辑时清掉这次刚上传、还没写进记录的图片
      if (this.data.addedImages.length) images.removeFiles(this.data.addedImages)
      this.setData({ addedImages: [], removedImages: [] })
      this.triggerEvent('close')
    },

    onPickType: function (e) {
      const key = e.currentTarget.dataset.key
      const current = TYPE_MAP[key]
      if (!current) return
      this.setData({
        current: current,
        'form.type': key,
        'form.amount': 1
      })
    },

    onDateChange: function (e) {
      const date = e.detail.value
      this.setData({
        'form.date': date,
        'form.dateLabel': relativeDayLabel(date)
      })
    },

    onTimeChange: function (e) {
      this.setData({ 'form.time': e.detail.value })
    },

    onMinus: function () {
      const amount = this.data.form.amount
      if (amount <= 1) return
      this.setData({ 'form.amount': amount - 1 })
    },

    onPlus: function () {
      const amount = this.data.form.amount
      if (amount >= 20) return
      this.setData({ 'form.amount': amount + 1 })
    },

    onNoteInput: function (e) {
      this.setData({ 'form.note': e.detail.value })
    },

    onPickAuthor: function (e) {
      this.setData({ 'form.authorId': e.currentTarget.dataset.role })
    },

    onPickImage: function () {
      const that = this
      const left = images.MAX_COUNT - this.data.form.images.length
      if (left <= 0 || this.data.uploading) return

      images
        .pick(left)
        .then(function (files) {
          const selected = files
            .filter(function (file) {
              return !file.size || file.size <= images.MAX_SIZE
            })
            .slice(0, left)
          if (files.length > selected.length) {
            wx.showToast({ title: '有图片超过 50MB，已跳过', icon: 'none' })
          }
          if (!selected.length) return null

          that.setData({ uploading: true })
          wx.showLoading({ title: '原图上传中', mask: true })
          return images
            .uploadAll(
              selected.map(function (file) {
                return file.path
              }),
              that.data.form.date
            )
            .then(function (fileIDs) {
              wx.hideLoading()
              that.setData({
                uploading: false,
                'form.images': that.data.form.images.concat(fileIDs),
                addedImages: that.data.addedImages.concat(fileIDs)
              })
            })
        })
        .catch(function (err) {
          wx.hideLoading()
          that.setData({ uploading: false })
          const message = String((err && (err.errMsg || err.message)) || '')
          if (message.indexOf('cancel') >= 0) return
          wx.showToast({ title: '上传失败，请检查云开发环境', icon: 'none' })
        })
    },

    onRemoveImage: function (e) {
      const index = Number(e.currentTarget.dataset.index)
      const list = this.data.form.images.slice()
      const removed = list.splice(index, 1)[0]
      if (!removed) return
      this.setData({
        'form.images': list,
        removedImages: this.data.removedImages.concat([removed])
      })
    },

    onPreviewImage: function (e) {
      const index = Number(e.currentTarget.dataset.index)
      const list = this.data.form.images
      if (!list.length) return
      images.preview(list, list[index])
    },

    onSubmit: function () {
      const form = this.data.form
      const editing = this.data.editing ? this.data.editRecord : null
      const record = {
        type: form.type,
        date: form.date,
        time: form.time,
        amount: this.data.current.count ? form.amount : 1,
        note: (form.note || '').trim(),
        authorId: form.authorId,
        images: form.images.slice()
      }
      const detail = {
        record: record,
        removedImages: this.data.removedImages.slice()
      }
      this.setData({ addedImages: [], removedImages: [] })

      if (editing) {
        detail.id = editing.id
        this.triggerEvent('edit', detail)
        return
      }

      record.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      record.createdAt = Date.now()
      this.triggerEvent('submit', detail)
    }
  }
})
