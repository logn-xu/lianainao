const { TYPES, TYPE_MAP } = require('../../utils/types')
const { relativeDayLabel, weekdayLabel } = require('../../utils/util')

Component({
  properties: {
    records: {
      type: Array,
      value: [],
      observer: function () {
        this.build()
      }
    },
    profile: {
      type: Object,
      value: {},
      observer: function () {
        this.build()
      }
    }
  },

  data: {
    types: TYPES,
    groups: [],
    empty: true
  },

  lifetimes: {
    attached: function () {
      this.build()
    }
  },

  methods: {
    build: function () {
      const records = this.data.records || []
      const profile = this.data.profile || {}
      const myEmoji = (profile.me && profile.me.emoji) || '🐻'
      const taEmoji = (profile.ta && profile.ta.emoji) || '🐰'
      const groups = []
      const groupMap = {}

      records.forEach(function (record) {
        if (!groupMap[record.date]) {
          groupMap[record.date] = {
            date: record.date,
            label: relativeDayLabel(record.date),
            weekday: weekdayLabel(record.date),
            records: []
          }
          groups.push(groupMap[record.date])
        }
        const meta = TYPE_MAP[record.type] || TYPE_MAP.note
        groupMap[record.date].records.push(
          Object.assign({}, record, {
            meta: meta,
            authorEmoji: record.authorId === 'ta' ? taEmoji : myEmoji
          })
        )
      })

      this.setData({ groups: groups, empty: groups.length === 0 })
    },

    onQuickAdd: function (e) {
      this.triggerEvent('add', { key: e.currentTarget.dataset.key })
    },

    onRecordTap: function (e) {
      this.triggerEvent('edit', { id: e.currentTarget.dataset.id })
    },

    onRecordLongPress: function (e) {
      this.triggerEvent('remove', { id: e.currentTarget.dataset.id })
    },

    onPreviewImage: function (e) {
      const data = e.currentTarget.dataset
      this.triggerEvent('preview', { images: data.images || [], current: data.current || '' })
    }
  }
})
