/**
 * Video Merger Service
 * Merge video with cover image as the first frame
 */

import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { rm } from 'fs/promises'
import ffmpeg, { FfmpegCommand } from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'
import { getSetting } from '../database'

// Set ffmpeg paths (handle asar path in production)
const ffmpegPath = ffmpegInstaller.path.replace('app.asar', 'app.asar.unpacked')
const ffprobePath = ffprobeInstaller.path.replace('app.asar', 'app.asar.unpacked')
ffmpeg.setFfmpegPath(ffmpegPath)
ffmpeg.setFfprobePath(ffprobePath)

export interface MergeProgress {
  status: 'preparing' | 'converting' | 'merging' | 'completed' | 'failed' | 'cancelled'
  progress: number
  message: string
}

export interface MergeResult {
  success: boolean
  outputPath?: string
  error?: string
}

interface VideoMetadata {
  width: number
  height: number
  fps: number
  duration: number
  videoCodec: string
  hasAudio: boolean
  audioSampleRate: number
}

// Track current merge operation for cancellation
let currentMergeCommand: FfmpegCommand | null = null
let isCancelled = false
let tempFilePath: string | null = null

function sendProgress(progress: MergeProgress): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('video:merge-progress', progress)
  }
}

function getDownloadPath(): string {
  const customPath = getSetting('download_path')
  if (customPath && customPath.trim()) {
    return customPath
  }
  return join(app.getPath('userData'), 'Download', 'post')
}

/**
 * Get video metadata using ffprobe
 */
function getVideoMetadata(videoPath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err)
        return
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video')
      const audioStream = metadata.streams.find((s) => s.codec_type === 'audio')

      if (!videoStream) {
        reject(new Error('No video stream found'))
        return
      }

      // Parse frame rate (may be "30/1" or "29.97" format)
      let fps = 30
      if (videoStream.r_frame_rate) {
        const parts = videoStream.r_frame_rate.split('/')
        fps =
          parts.length === 2
            ? parseInt(parts[0]) / parseInt(parts[1])
            : parseFloat(videoStream.r_frame_rate)
      }

      resolve({
        width: videoStream.width || 1080,
        height: videoStream.height || 1920,
        fps: Math.round(fps),
        duration: metadata.format.duration || 0,
        videoCodec: videoStream.codec_name || 'h264',
        hasAudio: !!audioStream,
        audioSampleRate: audioStream?.sample_rate ? parseInt(String(audioStream.sample_rate)) : 44100
      })
    })
  })
}

/**
 * Convert cover image to 1-second video segment
 */
function createCoverVideo(
  coverPath: string,
  outputPath: string,
  metadata: VideoMetadata
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isCancelled) {
      reject(new Error('已取消'))
      return
    }

    const command = ffmpeg()

    // Add cover image input with loop
    command
      .input(coverPath)
      .inputOptions(['-loop', '1', '-t', '1'])

    // Add silent audio source if original video has audio
    if (metadata.hasAudio) {
      command
        .input(`anullsrc=channel_layout=stereo:sample_rate=${metadata.audioSampleRate}`)
        .inputOptions(['-f', 'lavfi', '-t', '1'])
    }

    // Video filter: scale and pad to match original resolution
    const vf = `scale=${metadata.width}:${metadata.height}:force_original_aspect_ratio=decrease,pad=${metadata.width}:${metadata.height}:(ow-iw)/2:(oh-ih)/2,setsar=1`

    command
      .outputOptions([
        '-vf',
        vf,
        '-c:v',
        'libx264',
        '-r',
        String(metadata.fps),
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'fast'
      ])

    if (metadata.hasAudio) {
      command.outputOptions(['-c:a', 'aac', '-shortest'])
    }

    currentMergeCommand = command

    command
      .outputOptions(['-y'])
      .output(outputPath)
      .on('end', () => {
        currentMergeCommand = null
        resolve()
      })
      .on('error', (err) => {
        currentMergeCommand = null
        reject(err)
      })
      .run()
  })
}

/**
 * Parse timemark string (HH:MM:SS.ms) to seconds
 */
function parseTimemark(timemark: string): number {
  const parts = timemark.split(':')
  if (parts.length === 3) {
    const hours = parseFloat(parts[0])
    const minutes = parseFloat(parts[1])
    const seconds = parseFloat(parts[2])
    return hours * 3600 + minutes * 60 + seconds
  }
  return 0
}

/**
 * Concatenate cover video and original video (with audio)
 */
function concatVideosWithAudio(
  coverVideoPath: string,
  originalVideoPath: string,
  outputPath: string,
  totalDuration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isCancelled) {
      reject(new Error('已取消'))
      return
    }

    const command = ffmpeg()
      .input(coverVideoPath)
      .input(originalVideoPath)
      .complexFilter(['[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[outv][outa]'], ['outv', 'outa'])
      .outputOptions(['-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart', '-preset', 'fast', '-y'])
      .output(outputPath)
      .on('progress', (progress) => {
        // Calculate progress based on timemark instead of percent
        const currentTime = progress.timemark ? parseTimemark(progress.timemark) : 0
        const percent = totalDuration > 0 ? Math.min(99, Math.round((currentTime / totalDuration) * 100)) : 0
        sendProgress({
          status: 'merging',
          progress: 50 + percent * 0.5,
          message: `正在合并视频... ${percent}%`
        })
      })
      .on('end', () => {
        currentMergeCommand = null
        resolve()
      })
      .on('error', (err) => {
        currentMergeCommand = null
        reject(err)
      })

    currentMergeCommand = command
    command.run()
  })
}

/**
 * Concatenate cover video and original video (without audio)
 */
function concatVideosNoAudio(
  coverVideoPath: string,
  originalVideoPath: string,
  outputPath: string,
  totalDuration: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isCancelled) {
      reject(new Error('已取消'))
      return
    }

    const command = ffmpeg()
      .input(coverVideoPath)
      .input(originalVideoPath)
      .complexFilter(['[0:v][1:v]concat=n=2:v=1:a=0[outv]'], ['outv'])
      .outputOptions(['-c:v', 'libx264', '-movflags', '+faststart', '-preset', 'fast', '-y'])
      .output(outputPath)
      .on('progress', (progress) => {
        // Calculate progress based on timemark instead of percent
        const currentTime = progress.timemark ? parseTimemark(progress.timemark) : 0
        const percent = totalDuration > 0 ? Math.min(99, Math.round((currentTime / totalDuration) * 100)) : 0
        sendProgress({
          status: 'merging',
          progress: 50 + percent * 0.5,
          message: `正在合并视频... ${percent}%`
        })
      })
      .on('end', () => {
        currentMergeCommand = null
        resolve()
      })
      .on('error', (err) => {
        currentMergeCommand = null
        reject(err)
      })

    currentMergeCommand = command
    command.run()
  })
}

/**
 * Sanitize filename by removing illegal characters
 */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\r\n]/g, '_') // Replace illegal characters
    .replace(/\s+/g, ' ') // Merge whitespace
    .trim()
    .slice(0, 100) // Limit length
}

/**
 * Cancel the current merge operation
 */
export function cancelMerge(): void {
  isCancelled = true
  if (currentMergeCommand) {
    try {
      currentMergeCommand.kill('SIGKILL')
    } catch (e) {
      console.error('[Merger] Failed to kill ffmpeg process:', e)
    }
    currentMergeCommand = null
  }
  // Clean up temp file if exists
  if (tempFilePath) {
    rm(tempFilePath, { force: true }).catch(() => {})
    tempFilePath = null
  }
  sendProgress({
    status: 'cancelled',
    progress: 0,
    message: '已取消合并'
  })
}

/**
 * Check if merge is currently running
 */
export function isMergeRunning(): boolean {
  return currentMergeCommand !== null
}

/**
 * Main function: merge video with cover image
 */
export async function mergeVideoWithCover(
  secUid: string,
  folderName: string
): Promise<MergeResult> {
  // Reset cancellation state
  isCancelled = false
  tempFilePath = null

  const basePath = getDownloadPath()
  const folderPath = join(basePath, secUid, folderName)

  sendProgress({
    status: 'preparing',
    progress: 0,
    message: '正在检查文件...'
  })

  // 1. Check folder exists
  if (!existsSync(folderPath)) {
    sendProgress({ status: 'failed', progress: 0, message: '文件夹不存在' })
    return { success: false, error: '文件夹不存在' }
  }

  // 2. Build file paths based on naming convention: {aweme_id}_*.xxx
  // folderName is the aweme_id (e.g., "7439679456626642239")
  const awemeId = folderName
  const videoPath = join(folderPath, `${awemeId}_video.mp4`)
  const coverPath = join(folderPath, `${awemeId}_cover.webp`)
  const descPath = join(folderPath, `${awemeId}_desc.txt`)

  if (!existsSync(videoPath)) {
    sendProgress({ status: 'failed', progress: 0, message: '未找到视频文件' })
    return { success: false, error: `未找到视频文件: ${awemeId}_video.mp4` }
  }

  if (!existsSync(coverPath)) {
    sendProgress({ status: 'failed', progress: 0, message: '未找到封面文件' })
    return { success: false, error: `未找到封面文件: ${awemeId}_cover.webp` }
  }

  // 3. Read desc.txt for output filename
  let outputFileName: string

  if (existsSync(descPath)) {
    const descContent = readFileSync(descPath, 'utf-8').trim()
    if (descContent) {
      outputFileName = sanitizeFileName(descContent) + '.mp4'
    } else {
      sendProgress({ status: 'failed', progress: 0, message: 'desc.txt 文件为空' })
      return { success: false, error: 'desc.txt 文件为空，无法生成输出文件名' }
    }
  } else {
    sendProgress({ status: 'failed', progress: 0, message: '未找到 desc.txt 文件' })
    return { success: false, error: `未找到 ${awemeId}_desc.txt 文件` }
  }

  const outputPath = join(folderPath, outputFileName)

  // Check if output file already exists
  if (existsSync(outputPath)) {
    sendProgress({ status: 'failed', progress: 0, message: '合并后的文件已存在' })
    return { success: false, error: `文件已存在: ${outputFileName}` }
  }

  if (isCancelled) {
    return { success: false, error: '已取消' }
  }

  sendProgress({
    status: 'preparing',
    progress: 10,
    message: '正在分析视频参数...'
  })

  // 4. Get video metadata
  let metadata: VideoMetadata
  try {
    metadata = await getVideoMetadata(videoPath)
    console.log('[Merger] Video metadata:', metadata)
  } catch (error) {
    const errMsg = `获取视频参数失败: ${(error as Error).message}`
    sendProgress({ status: 'failed', progress: 0, message: errMsg })
    return { success: false, error: errMsg }
  }

  if (isCancelled) {
    return { success: false, error: '已取消' }
  }

  // 5. Create temporary cover video
  const tempCoverVideo = join(folderPath, `_temp_cover_${Date.now()}.mp4`)
  tempFilePath = tempCoverVideo

  sendProgress({
    status: 'converting',
    progress: 20,
    message: '正在将封面转换为视频...'
  })

  try {
    await createCoverVideo(coverPath, tempCoverVideo, metadata)
    sendProgress({
      status: 'converting',
      progress: 50,
      message: '封面视频转换完成'
    })
  } catch (error) {
    await rm(tempCoverVideo, { force: true }).catch(() => {})
    tempFilePath = null
    if (isCancelled) {
      return { success: false, error: '已取消' }
    }
    const errMsg = `封面转换失败: ${(error as Error).message}`
    console.error('[Merger] Cover conversion failed:', error)
    sendProgress({ status: 'failed', progress: 0, message: errMsg })
    return { success: false, error: errMsg }
  }

  if (isCancelled) {
    await rm(tempCoverVideo, { force: true }).catch(() => {})
    tempFilePath = null
    return { success: false, error: '已取消' }
  }

  // 6. Concatenate videos
  sendProgress({
    status: 'merging',
    progress: 55,
    message: '正在合并视频...'
  })

  // Total duration = cover (1s) + original video duration
  const totalDuration = 1 + metadata.duration

  try {
    if (metadata.hasAudio) {
      await concatVideosWithAudio(tempCoverVideo, videoPath, outputPath, totalDuration)
    } else {
      await concatVideosNoAudio(tempCoverVideo, videoPath, outputPath, totalDuration)
    }
  } catch (error) {
    // Clean up temporary file
    await rm(tempCoverVideo, { force: true }).catch(() => {})
    tempFilePath = null
    // Also clean up partial output file
    await rm(outputPath, { force: true }).catch(() => {})

    if (isCancelled) {
      return { success: false, error: '已取消' }
    }
    const errMsg = `视频合并失败: ${(error as Error).message}`
    console.error('[Merger] Video merge failed:', error)
    sendProgress({ status: 'failed', progress: 0, message: errMsg })
    return { success: false, error: errMsg }
  }

  // 7. Clean up temporary file
  await rm(tempCoverVideo, { force: true }).catch(() => {})
  tempFilePath = null

  sendProgress({
    status: 'completed',
    progress: 100,
    message: `合并完成: ${outputFileName}`
  })

  return { success: true, outputPath }
}
