/**
 * YouTube 上传服务
 * 支持 OAuth2 认证、单视频上传、批量上传
 */

import { app, shell, BrowserWindow } from 'electron'
import { google, youtube_v3 } from 'googleapis'
import type { OAuth2Client } from 'google-auth-library'
import * as http from 'http'
import * as url from 'url'
import { join, basename } from 'path'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  createReadStream,
  readdirSync,
  statSync
} from 'fs'
import { getSetting, getPostById, updatePostYouTubeStatus, type DbPost } from '../database'

// ========== 类型定义 ==========

export interface YouTubeUploadProgress {
  status: 'preparing' | 'uploading' | 'processing' | 'completed' | 'failed' | 'cancelled'
  currentPost: string | null
  currentIndex: number
  totalPosts: number
  uploadedCount: number
  failedCount: number
  progress: number
  message: string
}

export interface YouTubeUploadResult {
  success: boolean
  videoId?: string
  videoUrl?: string
  error?: string
}

export interface YouTubeUploadRequest {
  postId: number
  title?: string
  description?: string
  tags?: string[]
  privacy?: 'public' | 'unlisted' | 'private'
  category?: string
  playlistId?: string
  isShorts?: boolean // 是否为 Shorts
}

export interface YouTubePlaylistInfo {
  id: string
  title: string
  description: string
  itemCount: number
}

export interface YouTubeChannelInfo {
  id: string
  title: string
  thumbnailUrl: string
  playlists: YouTubePlaylistInfo[]
}

interface VideoUploadInfo {
  videoPath: string
  thumbnailPath: string | null
  title: string
  tags: string[]
  isProcessedVideo: boolean
}

interface TokenData {
  access_token: string
  refresh_token: string
  scope: string
  token_type: string
  expiry_date: number
}

// ========== 常量 ==========

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl'
]

const CALLBACK_PORT = 3333
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`

// Token 存储路径
const getTokenPath = (): string => join(app.getPath('userData'), '.youtube-token.json')

// ========== 状态管理 ==========

let isUploading = false
let cancelRequested = false
let mainWindow: BrowserWindow | null = null
let authServer: http.Server | null = null

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
}

export function getIsUploading(): boolean {
  return isUploading
}

export function cancelUpload(): void {
  cancelRequested = true
}

function sendProgress(progress: YouTubeUploadProgress): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('youtube:progress', progress)
  }
}

// ========== 下载路径获取 ==========

function getDownloadPath(): string {
  const customPath = getSetting('download_path')
  if (customPath && existsSync(customPath)) {
    return customPath
  }
  return join(app.getPath('downloads'), 'dYm')
}

// ========== OAuth2 认证 ==========

function getOAuth2Client(): OAuth2Client | null {
  const clientId = getSetting('youtube_client_id')
  const clientSecret = getSetting('youtube_client_secret')

  if (!clientId || !clientSecret) {
    return null
  }

  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
}

export async function isAuthenticated(): Promise<boolean> {
  const tokenPath = getTokenPath()
  if (!existsSync(tokenPath)) {
    return false
  }

  try {
    const tokenData: TokenData = JSON.parse(readFileSync(tokenPath, 'utf-8'))
    // 检查 token 是否存在且未过期
    if (tokenData.access_token && tokenData.expiry_date && tokenData.expiry_date > Date.now()) {
      return true
    }
    // 尝试刷新 token
    if (tokenData.refresh_token) {
      const oauth2Client = getOAuth2Client()
      if (!oauth2Client) return false
      oauth2Client.setCredentials(tokenData)
      try {
        const { credentials } = await oauth2Client.refreshAccessToken()
        writeFileSync(tokenPath, JSON.stringify(credentials, null, 2))
        return true
      } catch {
        return false
      }
    }
    return false
  } catch {
    return false
  }
}

export async function getAuthenticatedClient(): Promise<OAuth2Client | null> {
  const oauth2Client = getOAuth2Client()
  if (!oauth2Client) {
    return null
  }

  const tokenPath = getTokenPath()
  if (!existsSync(tokenPath)) {
    return null
  }

  try {
    const tokenData: TokenData = JSON.parse(readFileSync(tokenPath, 'utf-8'))
    oauth2Client.setCredentials(tokenData)

    // 检查是否需要刷新
    if (tokenData.expiry_date && tokenData.expiry_date <= Date.now() && tokenData.refresh_token) {
      const { credentials } = await oauth2Client.refreshAccessToken()
      writeFileSync(tokenPath, JSON.stringify(credentials, null, 2))
      oauth2Client.setCredentials(credentials)
    }

    return oauth2Client
  } catch {
    return null
  }
}

export async function startOAuthFlow(): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const oauth2Client = getOAuth2Client()
    if (!oauth2Client) {
      resolve({ success: false, error: '请先配置 YouTube Client ID 和 Client Secret' })
      return
    }

    // 关闭之前的认证服务器
    if (authServer) {
      authServer.close()
      authServer = null
    }

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    })

    let resolved = false

    authServer = http.createServer(async (req, res) => {
      if (resolved) return

      const parsedUrl = url.parse(req.url!, true)
      if (parsedUrl.pathname === '/callback') {
        const code = parsedUrl.query.code as string
        const error = parsedUrl.query.error as string

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`
            <html>
              <head><title>认证失败</title></head>
              <body style="font-family: system-ui; text-align: center; padding: 50px;">
                <h1>❌ 认证失败</h1>
                <p>${error}</p>
                <p>您可以关闭此窗口。</p>
              </body>
            </html>
          `)
          resolved = true
          authServer?.close()
          authServer = null
          resolve({ success: false, error: `授权被拒绝: ${error}` })
          return
        }

        if (code) {
          try {
            const { tokens } = await oauth2Client.getToken(code)
            writeFileSync(getTokenPath(), JSON.stringify(tokens, null, 2))
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(`
              <html>
                <head><title>认证成功</title></head>
                <body style="font-family: system-ui; text-align: center; padding: 50px;">
                  <h1>✅ 认证成功！</h1>
                  <p>您现在可以关闭此窗口，返回应用继续使用。</p>
                </body>
              </html>
            `)
            resolved = true
            authServer?.close()
            authServer = null
            resolve({ success: true })
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
            res.end(`
              <html>
                <head><title>认证失败</title></head>
                <body style="font-family: system-ui; text-align: center; padding: 50px;">
                  <h1>❌ 认证失败</h1>
                  <p>${(err as Error).message}</p>
                </body>
              </html>
            `)
            resolved = true
            authServer?.close()
            authServer = null
            resolve({ success: false, error: (err as Error).message })
          }
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end('<h1>缺少授权码</h1>')
        }
      }
    })

    authServer.listen(CALLBACK_PORT, () => {
      console.log('[YouTube] OAuth server listening on port', CALLBACK_PORT)
      shell.openExternal(authUrl)
    })

    // 2 分钟超时
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        authServer?.close()
        authServer = null
        resolve({ success: false, error: '认证超时，请重试' })
      }
    }, 120000)
  })
}

export async function logout(): Promise<void> {
  const tokenPath = getTokenPath()
  if (existsSync(tokenPath)) {
    unlinkSync(tokenPath)
  }
}

export async function listUserPlaylists(): Promise<YouTubePlaylistInfo[] | null> {
  const auth = await getAuthenticatedClient()
  if (!auth) return null

  try {
    const youtube = google.youtube({ version: 'v3', auth })
    const response = await youtube.playlists.list({
      part: ['snippet', 'contentDetails'],
      mine: true,
      maxResults: 50
    })

    if (!response.data.items) return []

    return response.data.items.map((playlist) => ({
      id: playlist.id || '',
      title: playlist.snippet?.title || '',
      description: playlist.snippet?.description || '',
      itemCount: playlist.contentDetails?.itemCount || 0
    }))
  } catch (error) {
    console.error('[YouTube] Failed to list playlists:', error)
    return null
  }
}

export async function getChannelInfo(): Promise<YouTubeChannelInfo | null> {
  const auth = await getAuthenticatedClient()
  if (!auth) return null

  try {
    const youtube = google.youtube({ version: 'v3', auth })
    const response = await youtube.channels.list({
      part: ['snippet'],
      mine: true
    })

    const channel = response.data.items?.[0]
    if (!channel) return null

    // 获取用户的播放列表
    const playlists = (await listUserPlaylists()) || []

    return {
      id: channel.id || '',
      title: channel.snippet?.title || '',
      thumbnailUrl: channel.snippet?.thumbnails?.default?.url || '',
      playlists
    }
  } catch {
    return null
  }
}

// ========== 视频文件选择逻辑 ==========

function getVideoUploadInfo(
  secUid: string,
  folderName: string,
  post?: DbPost
): VideoUploadInfo | null {
  const folderPath = join(getDownloadPath(), secUid, folderName)
  if (!existsSync(folderPath)) return null

  const awemeId = folderName
  const descPath = join(folderPath, `${awemeId}_desc.txt`)

  // 标签提取（三级优先级）
  let tags: string[] = []

  // 优先级 1: AI 分析标签
  if (post?.analysis_tags) {
    try {
      const aiTags = JSON.parse(post.analysis_tags)
      if (Array.isArray(aiTags) && aiTags.length > 0) {
        tags = aiTags
          .filter((tag) => typeof tag === 'string' && tag.length > 0 && tag.length <= 30)
          .slice(0, 500)
        console.log(`[YouTube] Using AI tags: ${tags.length}`)
      }
    } catch (err) {
      console.warn(`[YouTube] Failed to parse AI tags:`, err)
    }
  }

  // 优先级 2: desc.txt 标签（Fallback）
  if (tags.length === 0) {
    if (existsSync(descPath)) {
      const content = readFileSync(descPath, 'utf-8').trim()
      // 修复：匹配 # 后跟任意字符（包括空格），直到下一个 # 或行尾
      // 使用 [^#\n]+ 匹配除了 # 和换行符之外的所有字符
      const tagMatches = content.match(/#[^#\n]+/g) || []
      tags = tagMatches
        .map((t) => t.slice(1).trim()) // 移除 # 并去除首尾空格
        .filter((tag) => tag.length > 0 && tag.length <= 30)
        .slice(0, 500)
      console.log(`[YouTube] Using desc.txt tags: ${tags.length}`)
    }
  }

  // 优先级 3: 空数组（不报错）
  if (tags.length === 0) {
    console.log(`[YouTube] No tags found for ${awemeId}`)
  }

  // 标题优先使用数据库字段
  let title = ''
  if (post) {
    title = post.caption || post.desc || ''
  }
  if (!title) {
    // Fallback: 从 desc.txt 读取
    if (existsSync(descPath)) {
      const content = readFileSync(descPath, 'utf-8').trim()
      // 修复：移除所有标签（# 开头到下一个 # 或行尾）
      title = content.replace(/#[^#\n]+/g, '').trim()
      if (!title) {
        title = content.slice(0, 50)
      }
    }
  }
  if (!title) {
    title = awemeId
  }

  // 优先级 1: 查找处理后的视频 ({desc}.mp4 格式，非原始 *_video.mp4)
  const files = readdirSync(folderPath)
  const processedVideo = files.find(
    (f) => f.endsWith('.mp4') && !f.includes('_video.mp4') && !f.startsWith('_temp')
  )

  if (processedVideo) {
    return {
      videoPath: join(folderPath, processedVideo),
      thumbnailPath: null, // 处理后的视频不需要封面
      title: title || basename(processedVideo, '.mp4'),
      tags,
      isProcessedVideo: true
    }
  }

  // 优先级 2: 原始视频 + 封面
  const originalVideo = join(folderPath, `${awemeId}_video.mp4`)
  const coverPath = join(folderPath, `${awemeId}_cover.webp`)

  if (existsSync(originalVideo)) {
    return {
      videoPath: originalVideo,
      thumbnailPath: existsSync(coverPath) ? coverPath : null,
      title: title || awemeId,
      tags,
      isProcessedVideo: false
    }
  }

  return null
}

// ========== 上传核心逻辑 ==========

// 将视频添加到播放列表
async function addVideoToPlaylist(videoId: string, playlistId: string): Promise<boolean> {
  const auth = await getAuthenticatedClient()
  if (!auth) return false

  try {
    const youtube = google.youtube({ version: 'v3', auth })
    await youtube.playlistItems.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          playlistId,
          resourceId: {
            kind: 'youtube#video',
            videoId
          }
        }
      }
    })
    return true
  } catch (error) {
    console.error('[YouTube] Failed to add video to playlist:', error)
    return false
  }
}

export async function uploadToYouTube(
  postId: number,
  options?: Partial<YouTubeUploadRequest>
): Promise<YouTubeUploadResult> {
  const post = getPostById(postId)
  if (!post) {
    return { success: false, error: '作品不存在' }
  }

  const uploadInfo = getVideoUploadInfo(post.sec_uid, post.folder_name, post)
  if (!uploadInfo) {
    return { success: false, error: '未找到可上传的视频文件' }
  }

  const auth = await getAuthenticatedClient()
  if (!auth) {
    return { success: false, error: '请先完成 YouTube 认证' }
  }

  const youtube = google.youtube({ version: 'v3', auth })
  const privacy = options?.privacy || getSetting('youtube_default_privacy') || 'unlisted'
  const category = options?.isShorts
    ? '15' // Shorts 专用分类 (Shorts)
    : options?.category || getSetting('youtube_default_category') || '22' // 默认分类 (People & Blogs)
  const playlistId = options?.playlistId || getSetting('youtube_default_playlist_id') || ''
  const videoSize = statSync(uploadInfo.videoPath).size

  try {
    sendProgress({
      status: 'uploading',
      currentPost: post.desc || post.aweme_id,
      currentIndex: 0,
      totalPosts: 1,
      uploadedCount: 0,
      failedCount: 0,
      progress: 0,
      message: `正在上传: ${uploadInfo.title}`
    })

    const response = await youtube.videos.insert(
      {
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: options?.title || uploadInfo.title,
            description: options?.description || uploadInfo.title,
            tags: options?.tags || uploadInfo.tags,
            categoryId: category
          },
          status: {
            privacyStatus: privacy as youtube_v3.Schema$VideoStatus['privacyStatus'],
            selfDeclaredMadeForKids: false
          }
        },
        media: {
          body: createReadStream(uploadInfo.videoPath)
        }
      },
      {
        onUploadProgress: (evt) => {
          const progress = Math.round((evt.bytesRead / videoSize) * 100)
          sendProgress({
            status: 'uploading',
            currentPost: post.desc || post.aweme_id,
            currentIndex: 0,
            totalPosts: 1,
            uploadedCount: 0,
            failedCount: 0,
            progress,
            message: `正在上传: ${progress}%`
          })
        }
      }
    )

    const videoId = response.data.id!

    // 上传封面（仅限非处理后的视频，且存在封面）
    if (!uploadInfo.isProcessedVideo && uploadInfo.thumbnailPath) {
      try {
        sendProgress({
          status: 'processing',
          currentPost: post.desc || post.aweme_id,
          currentIndex: 0,
          totalPosts: 1,
          uploadedCount: 0,
          failedCount: 0,
          progress: 100,
          message: '正在上传封面...'
        })

        await youtube.thumbnails.set({
          videoId,
          media: { body: createReadStream(uploadInfo.thumbnailPath) }
        })
      } catch (err) {
        console.warn('[YouTube] 封面上传失败:', (err as Error).message)
      }
    }

    // 添加到播放列表（如果指定）
    if (playlistId) {
      try {
        sendProgress({
          status: 'processing',
          currentPost: post.desc || post.aweme_id,
          currentIndex: 0,
          totalPosts: 1,
          uploadedCount: 0,
          failedCount: 0,
          progress: 100,
          message: '正在添加到播放列表...'
        })

        const added = await addVideoToPlaylist(videoId, playlistId)
        if (!added) {
          console.warn('[YouTube] 添加到播放列表失败，但视频已上传成功')
        }
      } catch (err) {
        console.warn('[YouTube] 播放列表操作失败:', (err as Error).message)
      }
    }

    // 更新数据库
    updatePostYouTubeStatus(postId, videoId, playlistId || undefined)

    sendProgress({
      status: 'completed',
      currentPost: post.desc || post.aweme_id,
      currentIndex: 1,
      totalPosts: 1,
      uploadedCount: 1,
      failedCount: 0,
      progress: 100,
      message: '上传完成'
    })

    return {
      success: true,
      videoId,
      videoUrl: `https://youtu.be/${videoId}`
    }
  } catch (error) {
    const errorMessage = (error as Error).message
    sendProgress({
      status: 'failed',
      currentPost: post.desc || post.aweme_id,
      currentIndex: 0,
      totalPosts: 1,
      uploadedCount: 0,
      failedCount: 1,
      progress: 0,
      message: `上传失败: ${errorMessage}`
    })
    return { success: false, error: errorMessage }
  }
}

// ========== 批量上传 ==========

export async function uploadBatch(
  postIds: number[],
  playlistId?: string,
  isShorts?: boolean
): Promise<void> {
  if (isUploading) {
    sendProgress({
      status: 'failed',
      currentPost: null,
      currentIndex: 0,
      totalPosts: 0,
      uploadedCount: 0,
      failedCount: 0,
      progress: 0,
      message: '已有上传任务在进行中'
    })
    return
  }

  isUploading = true
  cancelRequested = false

  const total = postIds.length
  let uploadedCount = 0
  let failedCount = 0

  try {
    for (let i = 0; i < postIds.length; i++) {
      if (cancelRequested) {
        sendProgress({
          status: 'cancelled',
          currentPost: null,
          currentIndex: i,
          totalPosts: total,
          uploadedCount,
          failedCount,
          progress: Math.round((i / total) * 100),
          message: '上传已取消'
        })
        break
      }

      const postId = postIds[i]
      const post = getPostById(postId)

      sendProgress({
        status: 'uploading',
        currentPost: post?.desc || post?.aweme_id || `#${postId}`,
        currentIndex: i,
        totalPosts: total,
        uploadedCount,
        failedCount,
        progress: Math.round((i / total) * 100),
        message: `正在上传 ${i + 1}/${total}`
      })

      const result = await uploadToYouTube(postId, { playlistId, isShorts })

      if (result.success) {
        uploadedCount++
      } else {
        failedCount++
        console.warn(`[YouTube] 上传失败 postId=${postId}:`, result.error)
      }

      // 避免 API 请求过快
      if (i < postIds.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }

    if (!cancelRequested) {
      sendProgress({
        status: 'completed',
        currentPost: null,
        currentIndex: total,
        totalPosts: total,
        uploadedCount,
        failedCount,
        progress: 100,
        message: `完成: ${uploadedCount} 成功, ${failedCount} 失败`
      })
    }
  } finally {
    isUploading = false
    cancelRequested = false
  }
}
