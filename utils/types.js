// 记录类型的统一定义
const TYPES = [
  {
    key: 'milktea',
    name: '奶茶',
    fullName: '奶茶',
    emoji: '🧋',
    color: '#B98253',
    bg: '#F8EBDC',
    count: true,
    unit: '杯',
    placeholder: '例如：珍珠奶茶三分糖',
    hint: '今天喝了哪一杯'
  },
  {
    key: 'snack',
    name: '放纵',
    fullName: '放纵餐',
    emoji: '🍗',
    color: '#D2794E',
    bg: '#FBE8DE',
    count: true,
    unit: '次',
    placeholder: '例如：炸鸡 + 可乐',
    hint: '炸鸡、烧烤、火锅…'
  },
  {
    key: 'period',
    name: '姨妈',
    fullName: '姨妈',
    emoji: '🌸',
    color: '#DE7891',
    bg: '#FCE7EC',
    count: false,
    unit: '',
    placeholder: '例如：有点痛，喝了红糖水',
    hint: '建议记在开始的第一天'
  },
  {
    key: 'sport',
    name: '运动',
    fullName: '运动',
    emoji: '🏃',
    color: '#4E9D80',
    bg: '#E3F1EA',
    count: true,
    unit: '次',
    placeholder: '例如：跑步 3 公里',
    hint: '今天动了多少'
  },
  {
    key: 'note',
    name: '小事',
    fullName: '小事',
    emoji: '✏️',
    color: '#8B84D7',
    bg: '#EDEBFA',
    count: false,
    unit: '',
    placeholder: '例如：一起看了场电影',
    hint: '想记住的一句话、一件小事'
  }
]

const TYPE_MAP = {}
TYPES.forEach(function (item) {
  TYPE_MAP[item.key] = item
})

const AVATAR_OPTIONS = ['🐻', '🐰', '🐱', '🐶', '🦊', '🐧', '🐨', '🍑', '🍓', '🌻', '🌙', '⭐']

module.exports = {
  TYPES: TYPES,
  TYPE_MAP: TYPE_MAP,
  AVATAR_OPTIONS: AVATAR_OPTIONS
}
