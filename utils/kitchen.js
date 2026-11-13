// 御膳房客户端接口与状态文案
const cloud = require('./cloud')

const STATUS = {
  pending: { label: '待制作', tone: 'pending' },
  cooking: { label: '制作中', tone: 'cooking' },
  served: { label: '待用餐', tone: 'served' },
  completed: { label: '已完成', tone: 'completed' },
  cancelled: { label: '已取消', tone: 'cancelled' }
}

const ERROR_TEXT = {
  CLOUD_UNAVAILABLE: '请先开通云开发环境',
  CALL_FAILED: '云函数未部署或网络异常',
  NO_COUPLE: '请先在「我的」绑定情侣空间',
  PARTNER_REQUIRED: '等 TA 加入情侣空间后就能开厨房啦',
  BAD_DISH: '先给菜品起个名字',
  DISH_OFF: '这道菜已经下架了',
  FORBIDDEN: '这一步只能由对方来操作',
  BAD_STATUS: '订单状态已变化，请刷新后重试',
  RATING_REQUIRED: '先给这次用餐打个分',
  NOT_FOUND: '内容不存在或已被删除',
  SERVER_ERROR: '云函数出错了，请稍后再试',
  UNKNOWN_ACTION: '云函数未更新：请重新上传部署 cloudfunctions/api（含 kitchen.js）',
  FAILED: '操作失败，请稍后再试'
}

function pad(value) {
  return ('0' + value).slice(-2)
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(Number(timestamp))
  return date.getMonth() + 1 + '月' + date.getDate() + '日 ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}

// 新增菜品时可选的模板，与云函数 seedPresets 里的 PRESETS 保持同步。
// 只存填表需要的字段：选中后预填表单，之后仍可随意改，保存走的是同一条自定义路径。
const TEMPLATES = [
  { name: '番茄炒蛋', kind: 'dish', description: '酸甜下饭，十分钟就能端上桌', image: '/images/dishes/dish-01.jpg' },
  { name: '可乐鸡翅', kind: 'dish', description: '甜咸入味，新手也不容易翻车', image: '/images/dishes/dish-02.jpg' },
  { name: '蛋炒饭', kind: 'dish', description: '冰箱剩饭的救星，加个蛋就很香', image: '/images/dishes/dish-03.jpg' },
  { name: '阳春面', kind: 'dish', description: '一碗清汤面，热乎乎地哄你开心', image: '/images/dishes/dish-04.jpg' },
  { name: '红烧肉', kind: 'dish', description: '周末慢慢炖一锅，配米饭刚好', image: '/images/dishes/dish-05.jpg' },
  { name: '银耳莲子羹', kind: 'dish', description: '睡前一小碗甜汤，润润的', image: '/images/dishes/dish-06.jpg' },
  { name: '一起散步半小时', kind: 'favor', description: '不带手机，慢慢走，只聊天', image: '/images/dishes/idea-01.jpg' },
  { name: '给 TA 泡杯热茶', kind: 'favor', description: '什么都不用说，把杯子递过去就好', image: '/images/dishes/idea-02.jpg' },
  { name: '酸辣土豆丝', kind: 'dish', description: '爽脆开胃，五分钟就能出锅', image: '/images/dishes/dish-07.jpg' },
  { name: '蒜蓉西兰花', kind: 'dish', description: '清清爽爽，吃多了也不腻', image: '/images/dishes/dish-08.jpg' },
  { name: '番茄牛腩', kind: 'dish', description: '慢慢炖到软烂，汤汁别浪费', image: '/images/dishes/dish-09.jpg' },
  { name: '葱油拌面', kind: 'dish', description: '葱香一拌，懒人也有仪式感', image: '/images/dishes/dish-10.jpg' },
  { name: '冬瓜排骨汤', kind: 'dish', description: '一锅热汤，从胃暖到心里', image: '/images/dishes/dish-11.jpg' },
  { name: '香煎饺子', kind: 'dish', description: '底部焦脆，蘸一点点醋', image: '/images/dishes/dish-12.jpg' },
  { name: '红豆沙', kind: 'dish', description: '饭后一小碗甜的，慢慢喝', image: '/images/dishes/dish-13.jpg' },
  { name: '麻婆豆腐', kind: 'dish', description: '麻辣鲜香，米饭要多盛一碗', image: '/images/dishes/dish-14.jpg' },
  { name: '帮 TA 按肩 15 分钟', kind: 'favor', description: '加班后的专属福利，力道随你', image: '/images/dishes/idea-03.jpg' },
  { name: '一起看一部老电影', kind: 'favor', description: '你选片，我负责零食和毯子', image: '/images/dishes/idea-04.jpg' },
  { name: '早起做一次早餐', kind: 'favor', description: '煎蛋烤面包，不赶时间地吃完', image: '/images/dishes/idea-05.jpg' },
  { name: '写一张小纸条', kind: 'favor', description: '塞进包里，等 TA 自己发现', image: '/images/dishes/idea-06.jpg' }
]

module.exports = {
  STATUS: STATUS,
  ERROR_TEXT: ERROR_TEXT,
  TEMPLATES: TEMPLATES,
  formatTime: formatTime,
  load: function () {
    return cloud.call('getKitchen')
  },
  initDb: function () {
    return cloud.call('initDb')
  },
  saveDish: function (dish) {
    return cloud.call('saveDish', { dish: dish })
  },
  deleteDish: function (id) {
    return cloud.call('deleteDish', { id: id })
  },
  createOrder: function (order) {
    return cloud.call('createOrder', { order: order })
  },
  startCooking: function (id) {
    return cloud.call('startCooking', { id: id })
  },
  saveCooking: function (id, cooking) {
    return cloud.call('saveCooking', { id: id, cooking: cooking })
  },
  cancelOrder: function (id) {
    return cloud.call('cancelOrder', { id: id })
  },
  reviewOrder: function (id, review) {
    return cloud.call('reviewOrder', { id: id, review: review })
  }
}
