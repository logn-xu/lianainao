const { TYPES, TYPE_MAP } = require('../../utils/types')
const store = require('../../utils/store')
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
    }
  },

  data: {
    types: TYPES,
    current: TYPE_MAP.milktea,
    profile: store.DEFAULT_PROFILE,
    maxDate: '',
    form: {
      type: 'milktea',
      date: '',
      dateLabel: '今天',
      time: '00:00',
      amount: 1,
      note: '',
      authorId: 'me'
    }
  },

  lifetimes: {
    attached: function () {
      this.setData({ maxDate: todayStr() })
    }
  },

  methods: {
    initForm: function () {
      const type = TYPE_MAP[this.data.defaultType] ? this.data.defaultType : 'milktea'
      this.setData({
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
          authorId: 'me'
        }
      })
    },

    noop: function () {},

    onClose: function () {
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

    onSubmit: function () {
      const form = this.data.form
      const record = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        type: form.type,
        date: form.date,
        time: form.time,
        amount: this.data.current.count ? form.amount : 1,
        note: (form.note || '').trim(),
        authorId: form.authorId,
        createdAt: Date.now()
      }
      this.triggerEvent('submit', { record: record })
    }
  }
})
