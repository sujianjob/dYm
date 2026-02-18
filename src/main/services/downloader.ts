import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { DouyinHandler } from 'dy-downloader'
import { DouyinDownloader } from 'dy-downloader'
import {
  getTaskById,
  updateTask,
  getSetting,
  createPost,
  getPostByAwemeId,
  type DbTaskWithUsers,
  type DbUser
} from '../database'
import { getVideoDuration } from './analyzer'

// 并发控制函数
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = []
  const executing: Set<Promise<void>> = new Set()

  for (const task of tasks) {
    const p: Promise<void> = task().then((result) => {
      results.push(result)
      executing.delete(p)
    })
    executing.add(p)

    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }

  await Promise.all(executing)
  return results
}

// ffmpeg 并发限制
const MAX_FFMPEG_CONCURRENCY = 2
let ffmpegRunning = 0
const ffmpegQueue: Array<() => void> = []

async function acquireFfmpegSlot(): Promise<void> {
  if (ffmpegRunning < MAX_FFMPEG_CONCURRENCY) {
    ffmpegRunning++
    return
  }
  return new Promise((resolve) => {
    ffmpegQueue.push(() => {
      ffmpegRunning++
      resolve()
    })
  })
}

function releaseFfmpegSlot(): void {
  ffmpegRunning--
  const next = ffmpegQueue.shift()
  if (next) next()
}

export interface DownloadProgress {
  taskId: number
  status: 'running' | 'completed' | 'failed'
  currentUser: string | null
  currentUserIndex: number
  totalUsers: number
  currentVideo: number
  totalVideos: number
  message: string
  downloadedPosts: number
}

const runningTasks: Map<number, { abort: boolean }> = new Map()

function sendProgress(progress: DownloadProgress): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('download:progress', progress)
  }
}

function getDownloadPath(): string {
  const customPath = getSetting('download_path')
  if (customPath && customPath.trim()) {
    return customPath
  }
  return join(app.getPath('userData'), 'Download', 'post')
}

function formatFolderName(awemeId: string): string {
  return awemeId
}

export async function startDownloadTask(taskId: number): Promise<void> {
  const task = getTaskById(taskId)
  if (!task) {
    throw new Error('任务不存在')
  }

  if (runningTasks.has(taskId)) {
    throw new Error('任务正在执行中')
  }

  const cookie = getSetting('douyin_cookie')
  if (!cookie) {
    throw new Error('请先配置抖音 Cookie')
  }

  const globalMaxDownloadCount = parseInt(getSetting('max_download_count') || '0') || 0
  const videoDownloadConcurrency = parseInt(getSetting('video_download_concurrency') || '3') || 3

  runningTasks.set(taskId, { abort: false })

  // 更新任务状态
  updateTask(taskId, { status: 'running' })

  const downloadPath = getDownloadPath()
  const concurrency = task.concurrency || 3

  // 计算历史已下载数量（从用户的 downloaded_count 动态统计）
  const historicalDownloads = task.users.reduce((sum, u) => sum + (u.downloaded_count || 0), 0)
  let totalDownloaded = 0

  try {
    sendProgress({
      taskId,
      status: 'running',
      currentUser: null,
      currentUserIndex: 0,
      totalUsers: task.users.length,
      currentVideo: 0,
      totalVideos: 0,
      message: '正在初始化下载...',
      downloadedPosts: historicalDownloads
    })

    // 使用并发控制下载用户视频
    const userTasks = task.users.map((user, index) => () => {
      // 优先使用用户级别的下载限制，如果为0则使用全局设置
      const userMaxCount = (user as DbUser & { max_download_count?: number }).max_download_count
      const maxDownloadCount =
        userMaxCount && userMaxCount > 0 ? userMaxCount : globalMaxDownloadCount
      return downloadUserVideos(
        taskId,
        task,
        user,
        index,
        downloadPath,
        cookie,
        maxDownloadCount,
        historicalDownloads,
        videoDownloadConcurrency
      )
    })

    const results = await runWithConcurrency(userTasks, concurrency)
    totalDownloaded = results.reduce((sum, count) => sum + count, 0)

    // 检查是否被中止
    const taskState = runningTasks.get(taskId)
    if (taskState?.abort) {
      updateTask(taskId, { status: 'failed', downloaded_videos: totalDownloaded })
      sendProgress({
        taskId,
        status: 'failed',
        currentUser: null,
        currentUserIndex: task.users.length,
        totalUsers: task.users.length,
        currentVideo: 0,
        totalVideos: 0,
        message: '任务已取消',
        downloadedPosts: historicalDownloads + totalDownloaded
      })
    } else {
      updateTask(taskId, { status: 'completed', downloaded_videos: totalDownloaded })
      sendProgress({
        taskId,
        status: 'completed',
        currentUser: null,
        currentUserIndex: task.users.length,
        totalUsers: task.users.length,
        currentVideo: 0,
        totalVideos: 0,
        message: `下载完成，共 ${totalDownloaded} 个作品`,
        downloadedPosts: historicalDownloads + totalDownloaded
      })
    }
  } catch (error) {
    console.error('[Downloader] Task failed:', error)
    updateTask(taskId, { status: 'failed', downloaded_videos: totalDownloaded })
    sendProgress({
      taskId,
      status: 'failed',
      currentUser: null,
      currentUserIndex: 0,
      totalUsers: task.users.length,
      currentVideo: 0,
      totalVideos: 0,
      message: `下载失败: ${(error as Error).message}`,
      downloadedPosts: historicalDownloads + totalDownloaded
    })
  } finally {
    runningTasks.delete(taskId)
  }
}

async function downloadUserVideos(
  taskId: number,
  task: DbTaskWithUsers,
  user: DbUser,
  userIndex: number,
  basePath: string,
  cookie: string,
  maxDownloadCount: number,
  historicalDownloads: number,
  videoConcurrency: number
): Promise<number> {
  const taskState = runningTasks.get(taskId)
  if (taskState?.abort) return 0

  const userPath = join(basePath, user.sec_uid)
  let downloadedCount = 0
  let skippedCount = 0

  sendProgress({
    taskId,
    status: 'running',
    currentUser: user.nickname,
    currentUserIndex: userIndex + 1,
    totalUsers: task.users.length,
    currentVideo: 0,
    totalVideos: 0,
    message: `正在获取 ${user.nickname} 的作品列表...`,
    downloadedPosts: historicalDownloads + downloadedCount
  })

  try {
    const handler = new DouyinHandler({ cookie })
    const downloader = new DouyinDownloader({
      cookie,
      downloadPath: userPath,
      naming: '{aweme_id}',
      folderize: true,
      cover: true,
      music: true,
      desc: true
    })

    // maxCounts: 0 表示无限制，有值则限制获取数量
    const maxCounts = maxDownloadCount > 0 ? maxDownloadCount : 0

    // 收集待下载的视频
    interface VideoToDownload {
      awemeId: string
      awemeData: {
        awemeId?: string
        nickname?: string
        caption?: string
        desc?: string
        awemeType?: number
        createTime?: string
      }
    }
    const videosToDownload: VideoToDownload[] = []

    for await (const postFilter of handler.fetchUserPostVideos(user.sec_uid, { maxCounts })) {
      const awemeList = postFilter.toAwemeDataList()
      if (taskState?.abort) break

      for (const awemeData of awemeList) {
        if (taskState?.abort) break

        const awemeId = awemeData.awemeId
        if (!awemeId) continue

        // 检查是否已下载
        const existing = getPostByAwemeId(awemeId)
        if (existing) {
          skippedCount++
          if (skippedCount % 20 === 0) {
            sendProgress({
              taskId,
              status: 'running',
              currentUser: user.nickname,
              currentUserIndex: userIndex + 1,
              totalUsers: task.users.length,
              currentVideo: downloadedCount,
              totalVideos: maxDownloadCount || user.aweme_count,
              message: `已跳过 ${skippedCount} 个已下载作品...`,
              downloadedPosts: historicalDownloads + downloadedCount
            })
          }
          continue
        }

        videosToDownload.push({ awemeId, awemeData })

        // 检查是否达到最大数量
        if (maxDownloadCount > 0 && videosToDownload.length >= maxDownloadCount) {
          break
        }
      }

      if (maxDownloadCount > 0 && videosToDownload.length >= maxDownloadCount) {
        break
      }
    }

    if (videosToDownload.length === 0) {
      sendProgress({
        taskId,
        status: 'running',
        currentUser: user.nickname,
        currentUserIndex: userIndex + 1,
        totalUsers: task.users.length,
        currentVideo: 0,
        totalVideos: 0,
        message: `${user.nickname} 无新作品需要下载，跳过 ${skippedCount} 个已下载`,
        downloadedPosts: historicalDownloads
      })
      return 0
    }

    // 并发下载视频
    // 批次并发下载，每批完成后休息
    const totalToDownload = videosToDownload.length
    const batchSize = videoConcurrency
    const batchDelayMs = 3000 // 每批完成后休息3秒

    sendProgress({
      taskId,
      status: 'running',
      currentUser: user.nickname,
      currentUserIndex: userIndex + 1,
      totalUsers: task.users.length,
      currentVideo: 0,
      totalVideos: totalToDownload,
      message: `开始下载 ${totalToDownload} 个视频 (每批 ${batchSize} 个)...`,
      downloadedPosts: historicalDownloads
    })

    // 分批下载
    for (let i = 0; i < videosToDownload.length; i += batchSize) {
      if (taskState?.abort) break

      const batch = videosToDownload.slice(i, i + batchSize)
      const batchNum = Math.floor(i / batchSize) + 1
      const totalBatches = Math.ceil(videosToDownload.length / batchSize)

      sendProgress({
        taskId,
        status: 'running',
        currentUser: user.nickname,
        currentUserIndex: userIndex + 1,
        totalUsers: task.users.length,
        currentVideo: downloadedCount,
        totalVideos: totalToDownload,
        message: `正在下载第 ${batchNum}/${totalBatches} 批 (${batch.length} 个)...`,
        downloadedPosts: historicalDownloads + downloadedCount
      })

      // 并发下载当前批次
      const batchResults = await Promise.all(
        batch.map(async ({ awemeId, awemeData }) => {
          if (taskState?.abort) return false

          const folderName = formatFolderName(awemeId)

          try {
            await downloader.createDownloadTasks(awemeData, userPath)

            // 提取视频时长
            let duration: number | null = null
            if ((awemeData.awemeType || 0) !== 68) {
              const videoPath = join(userPath, folderName, `${awemeId}_video.mp4`)
              if (existsSync(videoPath)) {
                await acquireFfmpegSlot()
                try {
                  duration = await getVideoDuration(videoPath)
                  console.log(`[Downloader] Duration: ${duration}s for ${awemeId}`)
                } catch (err) {
                  console.warn(`[Downloader] Failed to get duration:`, err)
                } finally {
                  releaseFfmpegSlot()
                }
              }
            }

            // 入库
            createPost({
              aweme_id: awemeId,
              user_id: user.id,
              sec_uid: user.sec_uid,
              nickname: awemeData.nickname || user.nickname,
              caption: awemeData.caption || '',
              desc: awemeData.desc || '',
              aweme_type: awemeData.awemeType || 0,
              create_time: awemeData.createTime || '',
              folder_name: folderName,
              video_path: join(userPath, folderName),
              cover_path: join(userPath, folderName),
              music_path: join(userPath, folderName),
              video_duration: duration
            })

            return true
          } catch (error) {
            console.error(`[Downloader] Failed to download ${awemeId}:`, error)
            return false
          }
        })
      )

      // 统计成功数量
      downloadedCount += batchResults.filter(Boolean).length

      sendProgress({
        taskId,
        status: 'running',
        currentUser: user.nickname,
        currentUserIndex: userIndex + 1,
        totalUsers: task.users.length,
        currentVideo: downloadedCount,
        totalVideos: totalToDownload,
        message: `已完成 ${downloadedCount}/${totalToDownload}`,
        downloadedPosts: historicalDownloads + downloadedCount
      })

      // 如果还有下一批，休息一下
      if (i + batchSize < videosToDownload.length && !taskState?.abort) {
        sendProgress({
          taskId,
          status: 'running',
          currentUser: user.nickname,
          currentUserIndex: userIndex + 1,
          totalUsers: task.users.length,
          currentVideo: downloadedCount,
          totalVideos: totalToDownload,
          message: `休息 ${batchDelayMs / 1000} 秒...`,
          downloadedPosts: historicalDownloads + downloadedCount
        })
        await new Promise((resolve) => setTimeout(resolve, batchDelayMs))
      }
    }

    const skipMsg = skippedCount > 0 ? `，跳过 ${skippedCount} 个已下载` : ''
    sendProgress({
      taskId,
      status: 'running',
      currentUser: user.nickname,
      currentUserIndex: userIndex + 1,
      totalUsers: task.users.length,
      currentVideo: downloadedCount,
      totalVideos: downloadedCount,
      message: `${user.nickname} 完成，新下载 ${downloadedCount} 个${skipMsg}`,
      downloadedPosts: historicalDownloads + downloadedCount
    })
  } catch (error) {
    console.error(`[Downloader] Error downloading user ${user.nickname}:`, error)
    sendProgress({
      taskId,
      status: 'running',
      currentUser: user.nickname,
      currentUserIndex: userIndex + 1,
      totalUsers: task.users.length,
      currentVideo: downloadedCount,
      totalVideos: 0,
      message: `${user.nickname} 下载出错: ${(error as Error).message}`,
      downloadedPosts: historicalDownloads + downloadedCount
    })
  }

  return downloadedCount
}

export function stopDownloadTask(taskId: number): void {
  const taskState = runningTasks.get(taskId)
  if (taskState) {
    taskState.abort = true
  }
}

export function isTaskRunning(taskId: number): boolean {
  return runningTasks.has(taskId)
}

// ============================================
// 单视频下载功能
// ============================================

export interface SingleDownloadProgress {
  status: 'parsing' | 'downloading' | 'saving' | 'completed' | 'failed'
  progress: number // 0-100
  message: string
}

export interface SingleDownloadResult {
  success: boolean
  postId?: number
  userId?: number
  error?: string
}

// 单视频下载锁，防止同时下载多个
let singleDownloadRunning = false

function sendSingleProgress(progress: SingleDownloadProgress): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('download:single-progress', progress)
  }
}

/**
 * 下载单个视频并存入数据库
 *
 * 流程：
 * 1. 解析视频链接获取 awemeId 和作者信息
 * 2. 检查作者是否已存在，不存在则自动创建
 * 3. 检查视频是否已下载（去重）
 * 4. 调用 DouyinDownloader 下载视频
 * 5. 存入数据库
 */
export async function downloadSingleVideo(url: string): Promise<SingleDownloadResult> {
  // 防止并发下载
  if (singleDownloadRunning) {
    return { success: false, error: '已有下载任务在进行中，请稍后再试' }
  }

  // 动态导入避免循环依赖
  const { fetchVideoDetail, fetchUserProfileBySecUid } = await import('./douyin')
  const { getSetting, getUserBySecUid, createUser, getPostByAwemeId, createPost } =
    await import('../database')

  singleDownloadRunning = true

  try {
    // 1. 检查 Cookie
    const cookie = getSetting('douyin_cookie')
    if (!cookie) {
      sendSingleProgress({ status: 'failed', progress: 0, message: '请先配置抖音 Cookie' })
      return { success: false, error: '请先配置抖音 Cookie' }
    }

    // 2. 解析视频链接
    sendSingleProgress({ status: 'parsing', progress: 10, message: '正在解析视频链接...' })

    let videoDetail
    try {
      videoDetail = await fetchVideoDetail(url)
    } catch (error) {
      const errMsg = `解析失败: ${(error as Error).message}`
      sendSingleProgress({ status: 'failed', progress: 0, message: errMsg })
      return { success: false, error: errMsg }
    }

    if (!videoDetail || !videoDetail.awemeId) {
      sendSingleProgress({ status: 'failed', progress: 0, message: '无法解析视频信息' })
      return { success: false, error: '无法解析视频信息' }
    }

    const awemeId = videoDetail.awemeId
    // PostDetailFilter 使用 secUserId，SharePageDetail 使用 author.secUid
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secUid = (videoDetail as any).secUserId || (videoDetail as any).author?.secUid

    if (!secUid) {
      sendSingleProgress({ status: 'failed', progress: 0, message: '无法获取作者信息' })
      return { success: false, error: '无法获取作者信息' }
    }

    sendSingleProgress({
      status: 'parsing',
      progress: 20,
      message: `已获取视频信息: ${videoDetail.desc?.slice(0, 30) || awemeId}`
    })

    // 3. 检查是否已下载
    const existingPost = getPostByAwemeId(awemeId)
    if (existingPost) {
      sendSingleProgress({ status: 'completed', progress: 100, message: '该视频已下载' })
      return { success: true, postId: existingPost.id, userId: existingPost.user_id }
    }

    // 4. 查找或创建用户
    sendSingleProgress({ status: 'parsing', progress: 30, message: '正在获取作者信息...' })

    let user = getUserBySecUid(secUid)
    if (!user) {
      // 获取作者详细资料
      try {
        const profileRes = await fetchUserProfileBySecUid(secUid)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userData = (profileRes as any)._data?.user

        if (userData) {
          user = createUser({
            sec_uid: secUid,
            uid: (userData.uid as string) || '',
            nickname: (userData.nickname as string) || videoDetail.nickname || '未知用户',
            signature: (userData.signature as string) || '',
            avatar:
              (userData.avatar_larger as { url_list?: string[] })?.url_list?.[0] ||
              (userData.avatar_medium as { url_list?: string[] })?.url_list?.[0] ||
              '',
            short_id: (userData.short_id as string) || '',
            unique_id: (userData.unique_id as string) || '',
            following_count: (userData.following_count as number) || 0,
            follower_count: (userData.follower_count as number) || 0,
            total_favorited: (userData.total_favorited as number) || 0,
            aweme_count: (userData.aweme_count as number) || 0,
            homepage_url: `https://www.douyin.com/user/${secUid}`
          })
          console.log('[SingleDownload] Created new user:', user.nickname)
        } else {
          throw new Error('User data not found in profile response')
        }
      } catch (error) {
        // 如果获取用户资料失败，使用视频中的信息创建简单用户
        console.warn('[SingleDownload] Failed to fetch user profile, using video info:', error)
        user = createUser({
          sec_uid: secUid,
          nickname: videoDetail.nickname || '未知用户',
          homepage_url: `https://www.douyin.com/user/${secUid}`
        })
      }
    }

    sendSingleProgress({
      status: 'downloading',
      progress: 40,
      message: `正在下载视频 (作者: ${user.nickname})...`
    })

    // 5. 准备下载目录
    const downloadPath = getDownloadPath()
    const userPath = join(downloadPath, secUid)
    const folderName = formatFolderName(awemeId)

    // 6. 下载视频
    const downloader = new DouyinDownloader({
      cookie,
      downloadPath: userPath,
      naming: '{aweme_id}',
      folderize: true,
      cover: true,
      music: true,
      desc: true
    })

    try {
      sendSingleProgress({ status: 'downloading', progress: 50, message: '正在下载视频文件...' })
      // PostDetailFilter 有 toAwemeData() 方法，SharePageDetail 直接使用

      const awemeData =
        typeof (videoDetail as any).toAwemeData === 'function'
          ? (videoDetail as any).toAwemeData()
          : videoDetail
      await downloader.createDownloadTasks(awemeData, userPath)
      sendSingleProgress({
        status: 'downloading',
        progress: 80,
        message: '下载完成，正在保存记录...'
      })
    } catch (error) {
      const errMsg = `下载失败: ${(error as Error).message}`
      sendSingleProgress({ status: 'failed', progress: 0, message: errMsg })
      return { success: false, error: errMsg }
    }

    // 7. 存入数据库
    sendSingleProgress({ status: 'saving', progress: 90, message: '正在保存到数据库...' })

    // 获取字段时兼容 PostDetailFilter 和 SharePageDetail
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vd = videoDetail as any
    const videoNickname = vd.nickname || vd.author?.nickname || user.nickname
    const videoCaption = vd.caption || ''
    const videoDesc = vd.desc || ''
    const videoAwemeType = vd.awemeType ?? 0
    const videoCreateTime = vd.createTime || ''

    // 提取视频时长
    let duration: number | null = null
    if (videoAwemeType !== 68) {
      const videoPath = join(userPath, folderName, `${awemeId}_video.mp4`)
      if (existsSync(videoPath)) {
        await acquireFfmpegSlot()
        try {
          duration = await getVideoDuration(videoPath)
          console.log(`[Downloader] Duration: ${duration}s for ${awemeId}`)
        } catch (err) {
          console.warn(`[Downloader] Failed to get duration:`, err)
        } finally {
          releaseFfmpegSlot()
        }
      }
    }

    const post = createPost({
      aweme_id: awemeId,
      user_id: user.id,
      sec_uid: secUid,
      nickname: videoNickname,
      caption: videoCaption,
      desc: videoDesc,
      aweme_type: videoAwemeType,
      create_time: videoCreateTime,
      folder_name: folderName,
      video_path: join(userPath, folderName),
      cover_path: join(userPath, folderName),
      music_path: join(userPath, folderName),
      video_duration: duration
    })

    sendSingleProgress({
      status: 'completed',
      progress: 100,
      message: `下载成功: ${videoDesc?.slice(0, 30) || awemeId}`
    })

    return { success: true, postId: post.id, userId: user.id }
  } catch (error) {
    const errMsg = `下载失败: ${(error as Error).message}`
    console.error('[SingleDownload] Error:', error)
    sendSingleProgress({ status: 'failed', progress: 0, message: errMsg })
    return { success: false, error: errMsg }
  } finally {
    singleDownloadRunning = false
  }
}

export function isSingleDownloadRunning(): boolean {
  return singleDownloadRunning
}
