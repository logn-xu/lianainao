// 图片工具：原图选择、按 yyyymmdd 归档到统一云目录、大图预览
const cloud = require('./cloud')

const ROOT = 'daily'
const MAX_COUNT = 9
const MAX_SIZE = 50 * 1024 * 1024

const urlCache = {}

function todayFolder() {
  const d = new Date()
  return (
    String(d.getFullYear()) +
    ('0' + (d.getMonth() + 1)).slice(-2) +
    ('0' + d.getDate()).slice(-2)
  )
}

// '2026-11-13' -> '20261113'
function folderOf(date) {
  const digits = String(date || '').replace(/\D/g, '')
  return digits.length >= 8 ? digits.slice(0, 8) : todayFolder()
}

function pick(count) {
  const left = Math.max(1, Math.min(count, MAX_COUNT))

  // sizeType: ['original'] 表示取原图，不做微信默认压缩
  if (wx.chooseMedia) {
    return new Promise(function (resolve, reject) {
      wx.chooseMedia({
        count: left,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['original'],
        success: function (res) {
          resolve(
            (res.tempFiles || []).map(function (file) {
              return { path: file.tempFilePath, size: file.size || 0 }
            })
          )
        },
        fail: reject
      })
    })
  }

  return new Promise(function (resolve, reject) {
    wx.chooseImage({
      count: left,
      sizeType: ['original'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        resolve(
          (res.tempFilePaths || []).map(function (path) {
            return { path: path, size: 0 }
          })
        )
      },
      fail: reject
    })
  })
}

function uploadOne(path, folder) {
  const matched = String(path).match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/)
  const ext = matched ? matched[1].toLowerCase() : 'jpg'
  const cloudPath =
    ROOT +
    '/' +
    folder +
    '/' +
    Date.now() +
    '-' +
    Math.random().toString(36).slice(2, 8) +
    '.' +
    ext

  // uploadFile 直接上传原始文件字节，不做压缩
  return wx.cloud.uploadFile({ cloudPath: cloudPath, filePath: path }).then(function (res) {
    return res.fileID
  })
}

// 串行上传，避免多张大图同时占满带宽
function uploadAll(paths, date) {
  if (!cloud.init()) return Promise.reject(new Error('CLOUD_UNAVAILABLE'))
  const folder = folderOf(date)
  let chain = Promise.resolve([])
  ;(paths || []).forEach(function (path) {
    chain = chain.then(function (list) {
      return uploadOne(path, folder).then(function (fileID) {
        return list.concat([fileID])
      })
    })
  })
  return chain
}

function resolve(fileIDs) {
  const ids = (fileIDs || []).filter(Boolean)
  if (!ids.length) return Promise.resolve([])
  if (!cloud.init()) return Promise.resolve(ids.slice())

  const cached = {}
  const missing = []
  ids.forEach(function (id) {
    if (urlCache[id] && urlCache[id].expire > Date.now()) {
      cached[id] = urlCache[id].url
    } else {
      missing.push(id)
    }
  })
  if (!missing.length) {
    return Promise.resolve(
      ids.map(function (id) {
        return cached[id]
      })
    )
  }

  return wx.cloud
    .getTempFileURL({ fileList: missing.slice(0, 50) })
    .then(function (res) {
      ;(res.fileList || []).forEach(function (item) {
        if (item.tempFileURL) {
          cached[item.fileID] = item.tempFileURL
          urlCache[item.fileID] = {
            url: item.tempFileURL,
            expire: Date.now() + 2 * 60 * 60 * 1000
          }
        } else {
          cached[item.fileID] = item.fileID
        }
      })
      return ids.map(function (id) {
        return cached[id] || id
      })
    })
    .catch(function () {
      return ids.slice()
    })
}

function preview(fileIDs, current) {
  const ids = (fileIDs || []).filter(function (id) {
    return typeof id === 'string' && id.length > 0
  })
  if (!ids.length) return

  const index = Math.max(0, ids.indexOf(current))
  const showError = function () {
    wx.showToast({ title: '图片预览失败，请稍后重试', icon: 'none' })
  }

  // 基础库 2.2.3+ 的 wx.previewImage 原生支持云文件 ID。
  // 在点按回调里同步调用，不先等 getTempFileURL：异步换链接会造成预览拉起失败，
  // 临时链接过期或换取失败时也会出现空白图。
  wx.previewImage({
    current: ids[index],
    urls: ids,
    fail: function () {
      // 兜底：个别环境无法直接预览 cloud:// 时改用临时 https 链接
      resolve(ids).then(function (urls) {
        if (!urls.length || urls[index] === ids[index]) {
          showError()
          return
        }
        wx.previewImage({ current: urls[index], urls: urls, fail: showError })
      })
    }
  })
}

// 移除图片时清理云端文件（尽力而为，失败不影响记录）
function removeFiles(fileIDs) {
  const ids = (fileIDs || []).filter(Boolean)
  if (!ids.length || !cloud.init()) return Promise.resolve()
  ids.forEach(function (id) {
    delete urlCache[id]
  })
  return wx.cloud.deleteFile({ fileList: ids }).catch(function () {
    return null
  })
}

module.exports = {
  ROOT: ROOT,
  MAX_COUNT: MAX_COUNT,
  MAX_SIZE: MAX_SIZE,
  folderOf: folderOf,
  pick: pick,
  uploadAll: uploadAll,
  resolve: resolve,
  preview: preview,
  removeFiles: removeFiles
}
