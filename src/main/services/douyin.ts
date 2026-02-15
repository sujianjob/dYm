import { DouyinHandler, getSecUserId, getAwemeId, setConfig } from 'dy-downloader'
import { getSetting } from '../database'

let handler: DouyinHandler | null = null

export function initDouyinHandler(): DouyinHandler | null {
  const cookie = getSetting('douyin_cookie')
  if (cookie) {
    // 设置使用 A-Bogus 签名
    setConfig({ encryption: 'ab' })
    handler = new DouyinHandler({ cookie })
    console.log('[Douyin] Handler initialized with A-Bogus encryption')
  } else {
    handler = null
    console.log('[Douyin] No cookie, handler not initialized')
  }
  return handler
}

export function getDouyinHandler(): DouyinHandler | null {
  return handler
}

export function refreshDouyinHandler(): DouyinHandler | null {
  return initDouyinHandler()
}

/**
 * 链接类型
 */
export type LinkType = 'user' | 'video' | 'unknown'

/**
 * 链接识别结果
 */
export interface LinkParseResult {
  type: LinkType
  id: string // sec_user_id 或 aweme_id
}

/**
 * 从 URL 中提取 modal_id 参数（视频弹窗链接）
 * 例如: https://www.douyin.com/user/self?modal_id=7598918097298377984
 */
function extractModalId(url: string): string | null {
  try {
    const urlObj = new URL(url)
    const modalId = urlObj.searchParams.get('modal_id')
    if (modalId && /^\d+$/.test(modalId)) {
      return modalId
    }
  } catch {
    // URL 解析失败，尝试正则匹配
    const match = url.match(/[?&]modal_id=(\d+)/)
    if (match) {
      return match[1]
    }
  }
  return null
}

/**
 * 智能识别抖音链接类型
 * 1. 优先检查 modal_id 参数（视频弹窗链接）
 * 2. 尝试提取 sec_user_id（用户链接）
 * 3. 尝试提取 aweme_id（作品链接）
 */
export async function parseDouyinUrl(url: string): Promise<LinkParseResult> {
  console.log('[Douyin] parseDouyinUrl:', url)

  // 优先检查 modal_id 参数（视频弹窗链接）
  const modalId = extractModalId(url)
  if (modalId) {
    console.log('[Douyin] Detected modal_id in URL, awemeId:', modalId)
    return { type: 'video', id: modalId }
  }

  // 尝试提取用户 ID
  try {
    const secUserId = await getSecUserId(url)
    if (secUserId) {
      console.log('[Douyin] Detected as user link, secUserId:', secUserId)
      return { type: 'user', id: secUserId }
    }
  } catch (e) {
    console.log('[Douyin] Not a user link:', (e as Error).message)
  }

  // 尝试提取作品 ID
  try {
    const awemeId = await getAwemeId(url)
    if (awemeId) {
      console.log('[Douyin] Detected as video link, awemeId:', awemeId)
      return { type: 'video', id: awemeId }
    }
  } catch (e) {
    console.log('[Douyin] Not a video link:', (e as Error).message)
  }

  return { type: 'unknown', id: '' }
}

/**
 * 从用户链接获取用户资料
 */
export async function fetchUserProfile(url: string) {
  if (!handler) {
    throw new Error('DouyinHandler not initialized, please set cookie first')
  }
  console.log('[Douyin] fetchUserProfile url:', url)
  const secUserId = await getSecUserId(url)
  console.log('[Douyin] secUserId:', secUserId)
  const profile = await handler.fetchUserProfile(secUserId)
  console.log('[Douyin] profile:', JSON.stringify(profile, null, 2))
  return profile
}

/**
 * 从 sec_user_id 获取用户资料
 */
export async function fetchUserProfileBySecUid(secUserId: string) {
  if (!handler) {
    throw new Error('DouyinHandler not initialized, please set cookie first')
  }
  console.log('[Douyin] fetchUserProfileBySecUid:', secUserId)
  const profile = await handler.fetchUserProfile(secUserId)
  console.log('[Douyin] profile:', JSON.stringify(profile, null, 2))
  return profile
}

/**
 * 获取作品详情（支持 URL 或 aweme_id）
 * 支持的格式：
 * - 纯数字 aweme_id: 7598918097298377984
 * - 视频链接: https://www.douyin.com/video/7598918097298377984
 * - 带 modal_id 的链接: https://www.douyin.com/user/self?modal_id=7598918097298377984
 * - 短链接: https://v.douyin.com/xxx
 */
export async function fetchVideoDetail(urlOrAwemeId: string) {
  if (!handler) {
    throw new Error('DouyinHandler not initialized, please set cookie first')
  }
  console.log('[Douyin] fetchVideoDetail:', urlOrAwemeId)

  // 如果包含 modal_id 参数，优先提取
  const modalId = extractModalId(urlOrAwemeId)
  if (modalId) {
    console.log('[Douyin] Extracted modal_id:', modalId)
    urlOrAwemeId = modalId
  }

  try {
    const detail = await handler.fetchOneVideo(urlOrAwemeId)
    console.log('[Douyin] video detail:', JSON.stringify(detail, null, 2))
    return detail
  } catch (error) {
    console.error('[Douyin] fetchVideoDetail error:', error)
    throw error
  }
}

export { getSecUserId, getAwemeId }
