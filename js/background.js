chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.i18n.getMessage('tutorial') })
  }
})

// 启动时加载设置
chrome.runtime.onStartup.addListener(async () => createCheckAlarm)

chrome.action.onClicked.addListener(function (tab) {
  chrome.tabs.create({
    url: 'https://raz1ner.com/Extension/Background-Color-Post/'
  })
})

/**
 * @description 自定义延迟时间
 * @param {number} num - 秒数
 */
const delay = num => new Promise(resolve => setTimeout(resolve, num * 1000))

async function getToken () {
  // 获取库存信息
  const config = await new Promise(resolve =>
    chrome.storage.local.get(null, config => {
      resolve(config)
    })
  )
  const { value, time } = config?.token ?? {}
  // 近 1 小时获取过 token 就不重复获取了，避免太频繁导致账号受限
  if (new Date().getTime() - time < 3600000) {
    return value
  }
  const newToken = await fetch('https://www.facebook.com/ajax/dtsg/?__a=true')
    .then(response => response.text())
    .then(text => JSON.parse(text.replace('for (;;);', '')).payload.token)
  chrome.storage.local.set({
    token: {
      value: newToken,
      time: new Date().getTime()
    }
  })
  return newToken
}

// 函数列表
const functionMap = {
  lang: async () => {
    const obj = {}
    const langCode = chrome.i18n.getMessage('lang')
    const json = await fetch(`/_locales/${langCode}/messages.json`).then(response => response.json())
    for (const [key, value] of Object.entries(json)) {
      obj[key] = value.message
    }
    return obj
  },
  // base64 转换 blob
  base64ToBlob: base64 => {
    // 查找 MIME 类型的起始位置
    const mimeTypeMatch = base64.match(/^data:(.+);base64,/)
    // 提取 MIME 类型
    const mimeType = mimeTypeMatch[1]
    // 去除 MIME 类型前缀
    const base64Data = base64.replace(/^data:.+;base64,/, '')
    // 解码 Base64 字符串
    const byteCharacters = atob(base64Data)
    // 创建一个 Uint8Array 来存储字节数据
    const byteArrays = []
    // 将每个字符的字节数据存储到 Uint8Array 中
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512)
      const byteNumbers = new Array(slice.length)
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      byteArrays.push(byteArray)
    }
    // 创建 Blob 对象
    const blob = new Blob(byteArrays, { type: mimeType })
    return blob
  },
  // 获取用户 ID
  userID: async () => {
    const text = await fetch('https://www.facebook.com/me').then(response => response.text())
    return text.match(/(?<=actorId":").*?(?=")/g)[0]
  },
  // 获取 token
  getToken: async () => {
    return await fetch('https://www.facebook.com/ajax/dtsg/?__a=true')
      .then(response => response.text())
      .then(text => JSON.parse(text.replace('for (;;);', '')).payload.token)
  },
  // 获取小组列表
  groupHTML: async () => {
    const config = await new Promise(resolve => chrome.storage.local.get(null, resolve))
    return config.groupHTML || ''
  },
  // 保存小组列表
  saveHTML: async param => {
    await new Promise(resolve => chrome.storage.local.set({ groupHTML: param.html }, resolve))
    return 'HTML saved successfully'
  },
  // 上传图片
  uploadImage: async param => {
    const obj = {
      av: param.myID,
      __user: param.myID,
      __a: 1,
      fb_dtsg: await getToken()
    }
    const body = new FormData()
    body.append('file', functionMap.base64ToBlob(param.base64))
    body.append('upload_id', param.uuid)
    const json = await fetch(`https://www.facebook.com/life_event/composer/upload/?${new URLSearchParams(obj).toString()}`, {
      body,
      method: 'POST'
    })
      .then(response => response.text())
      .then(text => JSON.parse(text.replace('for (;;);', '')))
    return json.payload.photoID
  },
  // 获取小组
  getGroups: async param => {
    const body = new FormData()
    body.append('fb_dtsg', await getToken())
    body.append('fb_api_req_friendly_name', 'GroupsCometAllJoinedGroupsSectionPaginationQuery')
    body.append('variables', JSON.stringify(param.variables))
    body.append('doc_id', '6009728632468556')
    const json = await fetch('https://www.facebook.com/api/graphql/', {
      body,
      method: 'POST',
      credentials: 'include'
    }).then(response => response.json())
    const info = json.data.viewer.all_joined_groups.tab_groups_list
    return info
  },
  // 发布小组贴文
  postGroup: async param => {
    const body = new FormData()
    body.append('fb_dtsg', await getToken())
    body.append('fb_api_req_friendly_name', 'ComposerStoryCreateMutation')
    body.append('variables', JSON.stringify(param.variables))
    body.append('doc_id', '9132198736792632')
    const text = await fetch('https://www.facebook.com/api/graphql/', {
      body,
      method: 'POST'
    }).then(response => response.text())
    const json = JSON.parse(text.split('\n')[0])
    return json
  },
  // 发布时间线贴文
  postTimeline: async param => {
    const body = new FormData()
    body.append('fb_dtsg', await getToken())
    body.append('fb_api_req_friendly_name', 'ComposerStoryCreateMutation')
    body.append('variables', JSON.stringify(param.variables))
    body.append('doc_id', '9132198736792632')
    const json = await fetch('https://www.facebook.com/api/graphql/', {
      body,
      method: 'POST'
    }).then(response => response.json())
    return json
  },
  // 获取分享预览图参数
  getSharePreview: async param => {
    const body = new FormData()
    body.append('fb_dtsg', await getToken())
    body.append('fb_api_req_friendly_name', 'ComposerLinkAttachmentPreviewQuery')
    body.append('variables', JSON.stringify(param.variables))
    body.append('doc_id', '24758306610448322')
    const text = await fetch('https://www.facebook.com/api/graphql/', {
      body,
      method: 'POST'
    }).then(response => response.text())
    try {
      const json = JSON.parse(text.split('\n')[0])
      const shareParam = json.data.link_preview.share_scrape_data
      return shareParam || '无法获取'
    } catch (error) {
      return '无法获取'
    }
  },
  // 发布分享帖
  sharePost: async param => {
    const body = new FormData()
    body.append('fb_dtsg', await getToken())
    body.append('fb_api_req_friendly_name', 'ComposerStoryCreateMutation')
    body.append('variables', JSON.stringify(param.variables))
    body.append('doc_id', '25066596746316496')
    const text = await fetch('https://www.facebook.com/api/graphql/', {
      body: body,
      method: 'POST'
    }).then(response => response.text())
    const json = JSON.parse(text.split('\n')[0])
    try {
      return json
    } catch (error) {
      return '无法获取'
    }
  },
  // 保存定时任务
  scheduledTasks: async param => {
    const config = await new Promise(resolve =>
      chrome.storage.local.get(null, config => {
        resolve(config)
      })
    )
    const origData = config?.schedule ?? {}
    origData[param.scheduleTime] = {
      type: param.type, // 发帖类型
      targetType: param.targetType, // 发帖场地
      content: param.content, // 发帖内容
      bgId: param.bgId, // 彩色背景
      postParam: param.postParam, // 发帖参数
      group: param.group || [], // 小组
      status: 'pending' // 状态
    }
    console.log('origData', origData)
    chrome.storage.local.set({
      schedule: origData
    })
    createCheckAlarm()
  },
  getConfig: async () => {
    return await new Promise(resolve =>
      chrome.storage.local.get(null, config => {
        resolve(config)
      })
    )
  },
  setConfig: param => chrome.storage.local.set(param),
  // 请求数据
  fetchData: async (url, options) => {
    try {
      const response = await fetch(url, options)
      return await response.text()
    } catch (error) {
      return error.message
    }
  }
}

chrome.runtime.onMessageExternal.addListener(async (message, sender, sendResponse) => {
  console.log(message)
  const { action, param } = message
  try {
    const result = await functionMap[action](param)
    sendResponse(result)
  } catch (error) {
    sendResponse(error.message)
  }
  return true
})

// 创建定时检查任务
async function createCheckAlarm () {
  const alarm = await chrome.alarms.get('scheduledTasks')
  console.log('alarm', alarm)
  // 如果 alarm 不存在，则创建
  if (!alarm) {
    chrome.alarms.create('scheduledTasks', {
      periodInMinutes: 0.5
    })
  }
}

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'scheduledTasks') {
    runTask()
  }
})

const EXPIRE_LIMIT = 10 * 60 * 1000

async function runTask () {
  const config = await new Promise(resolve =>
    chrome.storage.local.get(null, config => {
      resolve(config)
    })
  )
  const origData = config?.schedule ?? {}
  for (const time in origData) {
    const info = origData[time]
    const now = new Date().getTime()
    const scheduleTime = new Date(Number(time)).getTime()
    const status = info.status || 'pending'

    // 跳过所有非等待中的任务
    if (status !== 'pending') continue

    const diff = now - scheduleTime

    // 逾期任务
    if (diff > EXPIRE_LIMIT) {
      info.status = 'expired'
      functionMap.setConfig({ schedule: origData })
      continue
    }

    // 还没到执行时间的任务
    if (diff < 0) continue

    // 需要执行的任务
    info.status = 'processing'
    // 保存正在进行中的状态
    functionMap.setConfig({ schedule: origData })

    let index = 0
    for (const param of info.postParam) {
      console.log(param)
      try {
        const json = await functionMap[info.type]({ variables: param })
        const postUrl = json.data.story_create.story.url
        console.log(postUrl)
      } catch (error) {
        // 存在异常情况，停止执行当前任务
        console.error(error)
        info.status = 'failed'
        functionMap.setConfig({ schedule: origData })
        break
      }

      index++
      // 如果最后一个发完就不再等待
      if (info.postParam.length === index) break

      // 倒计时
      const randomNum = Math.floor(Math.random() * (60 - 45 + 1)) + 45
      for (let i = randomNum; i >= 0; i--) {
        await delay(1)
      } // End for
    }
    // 运行完成，保存完成状态
    info.status = 'success'
    functionMap.setConfig({ schedule: origData })
  }
}
