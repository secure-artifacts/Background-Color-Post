const extensionID = document.getElementById('background-color-post').outerText

// 发送到后台
const sendBg = data => {
  return new Promise(resolve =>
    chrome.runtime.sendMessage(extensionID, data, res => {
      resolve(res)
    })
  )
}

const content = document.querySelector('#content')
const tbody = document.querySelector('tbody')
const log = document.querySelector('#log')
const timeInput = document.querySelector('#scheduleTime')

/**
 * @description 自定义延迟时间
 * @param {number} num - 秒数
 */
const delay = num => new Promise(resolve => setTimeout(resolve, num * 1000))

// 随机生成 uuid
const uuid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, str => {
    const randomInt = (Math.random() * 16) | 0
    return (str === 'x' ? randomInt : (randomInt & 3) | 8).toString(16)
  })
}

/**
 * @description 检测链接是否有效
 * @param {string} str - 链接
 * @returns {boolean} 判断结果
 */
function isValidURL (str) {
  try {
    new URL(str)
    return true
  } catch {
    return false
  }
}

/**
 * @description 左下角信息通知
 * @param {string} text - 通知的文本
 */
function notify (text) {
  Toastify({
    text,
    duration: 2000,
    close: true,
    gravity: 'bottom',
    position: 'left',
    style: { background: 'linear-gradient(to right, #00b09b, #96c93d)' }
  }).showToast()
}

let myId,
  dtsgToken,
  lang,
  blobs = []
// 初始化
async function init () {
  const mainEl = document.querySelectorAll('main')
  mainEl[0].style.display = 'none'
  mainEl[1].style.display = ''
  // 获取本地化字符串
  lang = await sendBg({ action: 'lang' })
  // 获取字符元素，写入对应语言的字符
  const elements = document.querySelectorAll('main:nth-child(2) [data-localize]')
  for (const el of elements) {
    el.innerText = lang[el.getAttribute('data-localize')]
  }
  try {
    // 获取用户 ID
    myId = await sendBg({ action: 'userID' })
  } catch {
    return notify(lang.loginFail)
  }
  // 获取 token
  dtsgToken = await sendBg({ action: 'getToken' })
  // 获取储存的小组信息
  tbody.innerHTML = await sendBg({ action: 'groupHTML' })
}
init()

/**
 * @description 上传图片
 * @param {string} link - 链接
 * @returns {string} 图片ID
 */
async function uploadImage (blob) {
  const base64 = await new Promise(resolve => {
    const reader = new FileReader()
    reader.readAsDataURL(blob)
    reader.onloadend = () => {
      const base64data = reader.result
      resolve(base64data)
    }
  })

  return await sendBg({
    action: 'uploadImage',
    param: {
      myID: myId,
      dtsgToken,
      base64,
      uuid: uuid()
    }
  })
}

// 获取小组
document.getElementById('getGroup').addEventListener('click', async e => {
  // 禁用获取小组按钮
  e.target.disabled = true
  // 游标代码
  let cursor = ''
  let html = ''
  let index = 0
  notify(lang.gettingGroup)
  const variables = {
    count: 20,
    ordering: ['integrity_signals'],
    scale: 2
  }
  for (let i = 0; i < Infinity; i++) {
    if (cursor) variables.cursor = cursor
    const info = await sendBg({
      action: 'getGroups',
      param: {
        dtsgToken,
        variables,
        cursor
      }
    })
    for (const groupInfo of info.edges) {
      index++
      html += `<tr>
        <td><input type="checkbox" id="${groupInfo.node.id}"></td>
        <td><label for="${groupInfo.node.id}"><img src="${groupInfo.node.profile_picture.uri}"></label></td>
        <td><label for="${groupInfo.node.id}"><a href="${groupInfo.node.url}" target="_blank">${htmlEscape(groupInfo.node.name)}</a><label></td>
       </tr>`
    }
    notify(`${lang.retrieveGroup.replace('@', index)}`)
    // 没有下一页
    if (!info.page_info.has_next_page) break
    // 记录游标
    cursor = info.page_info.end_cursor
    await delay(1.5)
  }
  // 储存小组信息
  sendBg({
    action: 'saveHTML',
    param: { html }
  })
  // 加载到 table
  tbody.innerHTML = html
  // 隐藏按钮
  e.target.style.setProperty('display', 'none', 'important')
})

// 发布帖文
document.getElementById('sendPost').addEventListener('click', async e => {
  // 未输入内容
  if (!content.value) return notify(lang.enterContent)
  // 获取选中的小组
  const checkedGroups = [...document.querySelectorAll('td input:checked')].map(x => [x.id, x.parentNode.parentNode.outerText.trim()])
  // 获取自定义小组
  const customGroups = document.getElementById('customGroupIds').value.match(/.+/g) || []
  // 判断是选择小组列表还是自定义小组 ID
  const groups = checkedGroups.length ? checkedGroups : customGroups

  // 禁用发布帖文按钮
  e.target.disabled = true
  // 清空记录
  log.innerHTML = ''

  // 是否是小组贴
  const isGroupPost = groups.length > 0

  const isLink = isValidURL(content.value)

  try {
    if (isLink) {
      // 纯链接的情况下，使用转发贴
      isGroupPost ? await groupSharePost(groups) : await timelineSharePost()
    } else {
      isGroupPost ? await groupPost(groups) : await timelinePost()
    }
  } catch (error) {
    console.log(error)
  }

  e.target.disabled = false
})

// 小组发帖
async function groupPost (groups) {
  // 定时任务时间
  const scheduleTime = new Date(timeInput.value).getTime()
  // 当前时间
  const now = new Date().getTime()
  // 获取已选中的彩色背景
  const selectedColor = document.querySelector('input[type="radio"]:checked')
  if (!selectedColor) return notify('请选择彩色背景')

  const variables = {
    input: {
      composer_entry_point: 'inline_composer',
      composer_source_surface: 'group',
      composer_type: 'group',
      logging: { composer_session_id: uuid() },
      source: 'WWW',
      message: {
        text: content.value
      },
      inline_activities: [],
      explicit_place_id: '0',
      text_format_preset_id: selectedColor.value,
      event_share_metadata: {},
      audience: {},
      actor_id: myId,
      client_mutation_id: '2'
    },
    feedbackSource: 0,
    scale: 2,
    privacySelectorRenderLocation: 'COMET_STREAM',
    checkPhotosToReelsUpsellEligibility: false,
    useDefaultActor: false,
    isFeed: false,
    isFundraiser: false,
    isFunFactPost: false,
    isEvent: false,
    isSocialLearning: false,
    isPageNewsFeed: false,
    isProfileReviews: false,
    isWorkSharedDraft: false,
    canUserManageOffers: false,
    __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: false,
    __relay_internal__pv__IncludeCommentWithAttachmentrelayprovider: true,
    __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
    __relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider: false,
    __relay_internal__pv__IsWorkUserrelayprovider: false,
    __relay_internal__pv__IsMergQAPollsrelayprovider: false,
    __relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider: true,
    __relay_internal__pv__EventCometCardImage_prefetchEventImagerelayprovider: false
  }

  let index = 0
  const groupIds = []
  const postParams = []

  for (const groupInfo of groups) {
    const [groupId, groupName] = groupInfo
    variables.input.audience.to_id = groupId

    // 检测是否传入图片
    if (blobs.length > 0) {
      variables.input.attachments = await Promise.all(
        blobs.map(async blob => {
          const photoID = await uploadImage(blob)
          return { photo: { id: photoID } }
        }) // End map
      ) // End Promise
    } // End if

    // 定时任务
    if (scheduleToggle.checked) {
      if (scheduleTime <= now) {
        notify('定时任务禁止小于当前时间')
        break
      }

      groupIds.push(groupId)
      postParams.push(variables)
      continue
    }

    // 立即发布
    notify(lang.posting)
    const json = await sendBg({
      action: 'postGroup',
      param: { variables }
    })

    try {
      // 帖子链接
      const postUrl = json.data.story_create.story.url
      log.innerHTML += `<div>
          <strong class="bg-success-subtle py-1 px-2 rounded-3">${lang.success}</strong>
          <span>${groupName || groupId}</span>
          <br>
          <a href="${postUrl}" target="_blank">${postUrl}</a>
        </div>`
    } catch (error) {
      console.error(error)
      log.innerHTML += `<div>
          <strong class="bg-danger-subtle py-1 px-2 rounded-3">${lang.fail}</strong>
          <span>${groupName || groupId}</span>
        </div>`
    }

    index++
    notify(`${lang.published} ${groups.length} / ${index}`)
    // 如果最后一个发完就不再等待
    if (groups.length === index) break

    // 倒计时
    const randomNum = Math.floor(Math.random() * (60 - 45 + 1)) + 45
    for (let i = randomNum; i >= 0; i--) {
      notify(lang.waiting.replace('@', i))
      await delay(1)
    } // End for
  } // End for

  if (scheduleToggle.checked) {
    // 定时任务
    await sendBg({
      action: 'scheduledTasks',
      param: {
        scheduleTime,
        type: 'postGroup',
        targetType: 'group',
        content: content.value,
        bgId: selectedColor.value,
        postParam: postParams,
        group: groupIds
      }
    })
    notify('已添加到列队中')
    renderTasks()
  }
}

// 时间线发帖
async function timelinePost () {
  // 定时任务时间
  const scheduleTime = new Date(timeInput.value).getTime()
  // 当前时间
  const now = new Date().getTime()
  // 获取已选中的彩色背景
  const selectedColor = document.querySelector('input[type="radio"]:checked')
  if (!selectedColor) return notify('请选择彩色背景')

  const variables = {
    input: {
      composer_entry_point: 'inline_composer',
      composer_source_surface: 'timeline',
      logging: { composer_session_id: uuid() },
      source: 'WWW',
      message: {
        text: content.value
      },
      inline_activities: [],
      explicit_place_id: '0',
      text_format_preset_id: selectedColor.value,
      event_share_metadata: {},
      audience: {
        privacy: {
          allow: [],
          base_state: 'EVERYONE',
          deny: [],
          tag_expansion_state: 'UNSPECIFIED'
        }
      },
      actor_id: myId,
      client_mutation_id: '2'
    },
    feedbackSource: 0,
    scale: 2,
    privacySelectorRenderLocation: 'COMET_STREAM',
    checkPhotosToReelsUpsellEligibility: false,
    useDefaultActor: false,
    isFeed: false,
    isFundraiser: false,
    isFunFactPost: false,
    isEvent: false,
    isSocialLearning: false,
    isPageNewsFeed: false,
    isProfileReviews: false,
    isWorkSharedDraft: false,
    canUserManageOffers: false,
    __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: false,
    __relay_internal__pv__IncludeCommentWithAttachmentrelayprovider: true,
    __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
    __relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider: false,
    __relay_internal__pv__IsWorkUserrelayprovider: false,
    __relay_internal__pv__IsMergQAPollsrelayprovider: false,
    __relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider: true,
    __relay_internal__pv__EventCometCardImage_prefetchEventImagerelayprovider: false
  }

  // 检测是否传入图片
  if (blobs.length > 0) {
    variables.input.attachments = await Promise.all(
      blobs.map(async blob => {
        const photoID = await uploadImage(blob)
        return { photo: { id: photoID } }
      }) // End map
    ) // End Promise
  } // End if

  // 定时任务
  if (scheduleToggle.checked) {
    if (scheduleTime <= now) {
      notify('定时任务禁止小于当前时间')
      return
    }

    console.log({
      scheduleTime,
      type: 'postTimeline',
      targetType: 'timeline',
      content: content.value,
      bgId: selectedColor.value,
      postParam: [variables]
    })
    // 定时任务
    await sendBg({
      action: 'scheduledTasks',
      param: {
        scheduleTime,
        type: 'postTimeline',
        targetType: 'timeline',
        content: content.value,
        bgId: selectedColor.value,
        postParam: [variables]
      }
    })
    notify('已添加到列队中')
    renderTasks()
    return
  }

  // 立即发布
  notify(lang.posting)
  const json = await sendBg({
    action: 'postTimeline',
    param: {
      variables
    }
  })
  try {
    const postUrl = json.data.story_create.story.url
    log.innerHTML += `<div>
        <strong class="bg-success-subtle py-1 px-2 rounded-3">${lang.success}</strong>
        <span>${lang.timeline}</span>
        <br>
        <a href="${postUrl}" target="_blank">${postUrl}</a>
      </div>`
  } catch {
    log.innerHTML += `<div>
        <strong class="bg-danger-subtle py-1 px-2 rounded-3">${lang.fail}</strong>
        <span>${lang.timeline}</span>
      </div>`
  }
  notify(lang.published)
}

// 获取链接预览
async function getSharePreview (url) {
  const variables = {
    feedLocation: 'FEED_COMPOSER',
    focusCommentID: null,
    goodwillCampaignId: '',
    goodwillCampaignMediaIds: [],
    goodwillContentType: null,
    params: { url },
    privacySelectorRenderLocation: 'COMET_COMPOSER',
    renderLocation: 'composer_preview',
    parentStoryID: null,
    scale: 2,
    useDefaultActor: false,
    shouldIncludeStoryAttachment: false,
    __relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider: false,
    __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
    __relay_internal__pv__IsWorkUserrelayprovider: false,
    __relay_internal__pv__FBReels_enable_view_dubbed_audio_type_gkrelayprovider: false,
    __relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider: false,
    __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false,
    __relay_internal__pv__IsMergQAPollsrelayprovider: false,
    __relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider: true,
    __relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider: true
  }
  const json = await sendBg({
    action: 'getSharePreview',
    param: {
      variables
    }
  })
  return json
}

// 小组转发贴
async function groupSharePost (groups) {
  // 定时任务时间
  const scheduleTime = new Date(timeInput.value).getTime()
  // 当前时间
  const now = new Date().getTime()
  // 获取链接缩略图参数
  const shareParam = await getSharePreview(content.value)

  const variables = {
    input: {
      composer_entry_point: 'inline_composer',
      composer_source_surface: 'group',
      composer_type: 'group',
      logging: { composer_session_id: uuid() },
      source: 'WWW',
      message: { ranges: [], text: '' },
      with_tags_ids: null,
      inline_activities: [],
      text_format_preset_id: '0',
      group_flair: { flair_id: null },
      attachments: [{ link: { share_scrape_data: shareParam } }],
      composed_text: { block_data: ['{}'], block_depths: [0], block_types: [0], blocks: [''], entities: ['[]'], entity_map: '{}', inline_styles: ['[]'] },
      tracking: [null],
      audience: {},
      event_share_metadata: { surface: 'newsfeed' },
      actor_id: myId,
      client_mutation_id: '2'
    },
    feedLocation: 'GROUP',
    feedbackSource: 0,
    focusCommentID: null,
    gridMediaWidth: null,
    groupID: null,
    scale: 2,
    privacySelectorRenderLocation: 'COMET_STREAM',
    checkPhotosToReelsUpsellEligibility: false,
    renderLocation: 'group',
    useDefaultActor: false,
    inviteShortLinkKey: null,
    isFeed: false,
    isFundraiser: false,
    isFunFactPost: false,
    isGroup: true,
    isEvent: false,
    isTimeline: false,
    isSocialLearning: false,
    isPageNewsFeed: false,
    isProfileReviews: false,
    isWorkSharedDraft: false,
    hashtag: null,
    canUserManageOffers: false,
    __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: true,
    __relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider: false,
    __relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider: false,
    __relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider: false,
    __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
    __relay_internal__pv__IsWorkUserrelayprovider: false,
    __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
    __relay_internal__pv__TestPilotShouldIncludeDemoAdUseCaserelayprovider: false,
    __relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider: true,
    __relay_internal__pv__FeedDeepDiveTopicPillThreadViewEnabledrelayprovider: false,
    __relay_internal__pv__FBReels_enable_view_dubbed_audio_type_gkrelayprovider: true,
    __relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider: false,
    __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false,
    __relay_internal__pv__IsMergQAPollsrelayprovider: false,
    __relay_internal__pv__FBReels_enable_meta_ai_label_gkrelayprovider: true,
    __relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider: true,
    __relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider: true,
    __relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider: true,
    __relay_internal__pv__GroupsCometGYSJFeedItemHeightrelayprovider: 206,
    __relay_internal__pv__StoriesShouldIncludeFbNotesrelayprovider: false,
    __relay_internal__pv__GHLShouldChangeSponsoredAuctionDistanceFieldNamerelayprovider: false,
    __relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV1relayprovider: false,
    __relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV2relayprovider: false
  }

  let index = 0
  const groupIds = []
  const postParams = []

  for (const groupInfo of groups) {
    // 解构赋值
    const [groupId, groupName] = groupInfo
    variables.input.audience.to_id = groupId

    // 定时任务
    if (scheduleToggle.checked) {
      if (scheduleTime <= now) {
        notify('定时任务禁止小于当前时间')
        break
      }

      groupIds.push(groupId)
      postParams.push(variables)
      continue
    }

    // 立即发布
    notify(lang.posting)
    const json = await sendBg({
      action: 'sharePost',
      param: { variables }
    })

    try {
      const postUrl = json.data.story_create.story.url
      log.innerHTML += `<div>
          <strong class="bg-success-subtle py-1 px-2 rounded-3">${lang.success}</strong>
          <span>${groupName}</span>
          <br>
          <a href="${postUrl}" target="_blank">${postUrl}</a>
        </div>`
    } catch {
      log.innerHTML += `<div>
          <strong class="bg-danger-subtle py-1 px-2 rounded-3">${lang.fail}</strong>
          <span>${groupName || groupId}</span>
        </div>`
    }

    index++
    notify(`${lang.published} ${groups.length} / ${index}`)
    // 如果最后一个发完就不再等待
    if (groups.length === index) break

    // 倒计时
    const randomNum = Math.floor(Math.random() * (60 - 45 + 1)) + 45
    for (let i = randomNum; i >= 0; i--) {
      notify(lang.waiting.replace('@', i))
      await delay(1)
    } // End for
  } // End for

  if (scheduleToggle.checked) {
    // 定时任务
    await sendBg({
      action: 'scheduledTasks',
      param: {
        scheduleTime,
        type: 'sharePost',
        targetType: 'group',
        content: content.value,
        bgId: selectedColor.value,
        postParam: postParams,
        group: groupIds
      }
    })
    notify('已添加到列队中')
    renderTasks()
  }
}

// 时间线转发贴
async function timelineSharePost () {
  // 定时任务时间
  const scheduleTime = new Date(timeInput.value).getTime()
  // 当前时间
  const now = new Date().getTime()
  // 获取链接缩略图参数
  const shareParam = await getSharePreview(content.value)
  const uuidStr = uuid()

  const variables = {
    input: {
      composer_entry_point: 'inline_composer',
      composer_source_surface: 'timeline',
      idempotence_token: `${uuidStr}_FEED`,
      source: 'WWW',
      attachments: [{ link: { share_scrape_data: shareParam } }],
      audience: { privacy: { allow: [], base_state: 'EVERYONE', deny: [], tag_expansion_state: 'UNSPECIFIED' } },
      message: { ranges: [], text: '' },
      with_tags_ids: null,
      inline_activities: [],
      text_format_preset_id: '0',
      publishing_flow: { supported_flows: ['ASYNC_SILENT', 'ASYNC_NOTIF', 'FALLBACK'] },
      logging: { composer_session_id: uuidStr },
      tracking: [null],
      event_share_metadata: { surface: 'timeline' },
      actor_id: myId,
      client_mutation_id: '2'
    },
    feedLocation: 'TIMELINE',
    feedbackSource: 0,
    focusCommentID: null,
    gridMediaWidth: 230,
    groupID: null,
    scale: 2,
    privacySelectorRenderLocation: 'COMET_STREAM',
    checkPhotosToReelsUpsellEligibility: true,
    renderLocation: 'timeline',
    useDefaultActor: false,
    inviteShortLinkKey: null,
    isFeed: false,
    isFundraiser: false,
    isFunFactPost: false,
    isGroup: false,
    isEvent: false,
    isTimeline: true,
    isSocialLearning: false,
    isPageNewsFeed: false,
    isProfileReviews: false,
    isWorkSharedDraft: false,
    hashtag: null,
    canUserManageOffers: false,
    __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: true,
    __relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider: false,
    __relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider: false,
    __relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider: false,
    __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
    __relay_internal__pv__IsWorkUserrelayprovider: false,
    __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
    __relay_internal__pv__TestPilotShouldIncludeDemoAdUseCaserelayprovider: false,
    __relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider: true,
    __relay_internal__pv__FeedDeepDiveTopicPillThreadViewEnabledrelayprovider: false,
    __relay_internal__pv__FBReels_enable_view_dubbed_audio_type_gkrelayprovider: true,
    __relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider: false,
    __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false,
    __relay_internal__pv__IsMergQAPollsrelayprovider: false,
    __relay_internal__pv__FBReels_enable_meta_ai_label_gkrelayprovider: true,
    __relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider: true,
    __relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider: true,
    __relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider: true,
    __relay_internal__pv__GroupsCometGYSJFeedItemHeightrelayprovider: 206,
    __relay_internal__pv__StoriesShouldIncludeFbNotesrelayprovider: false,
    __relay_internal__pv__GHLShouldChangeSponsoredAuctionDistanceFieldNamerelayprovider: false,
    __relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV1relayprovider: false,
    __relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV2relayprovider: false
  }

  // 定时任务
  if (scheduleToggle.checked) {
    if (scheduleTime <= now) {
      notify('定时任务禁止小于当前时间')
      return
    }

    // 定时任务
    await sendBg({
      action: 'scheduledTasks',
      param: {
        scheduleTime,
        type: 'sharePost',
        targetType: 'timeline',
        content: content.value,
        bgId: '',
        postParam: [variables]
      }
    })
    notify('已添加到列队中')
    renderTasks()
    return
  }

  // 立即发布
  notify(lang.posting)
  const json = await sendBg({
    action: 'sharePost',
    param: { variables }
  })
  try {
    const postUrl = json.data.story_create.story.url
    log.innerHTML += `<div>
        <strong class="bg-success-subtle py-1 px-2 rounded-3">${lang.success}</strong>
        <span>${lang.timeline}</span>
        <br>
        <a href="${postUrl}" target="_blank">${postUrl}</a>
      </div>`
  } catch {
    log.innerHTML += `<div>
        <strong class="bg-danger-subtle py-1 px-2 rounded-3">${lang.fail}</strong>
        <span>${lang.timeline}</span>
      </div>`
  }
  notify(lang.published)
}
