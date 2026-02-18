import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import {
  Loader2,
  Chrome,
  CheckCircle,
  Download,
  RefreshCw,
  FolderSync,
  FolderOpen,
  Database,
  X
} from 'lucide-react'
import { PlaylistSelector } from '@renderer/components/PlaylistSelector'

export default function SystemPage() {
  // Cookie
  const [cookie, setCookie] = useState('')
  const [fetchingCookie, setFetchingCookie] = useState(false)

  // API
  const [apiKey, setApiKey] = useState('')
  const [apiUrl, setApiUrl] = useState('https://api.x.ai/v1')
  const [verifyingApi, setVerifyingApi] = useState(false)

  // 下载
  const [downloadPath, setDownloadPath] = useState('')
  const [maxDownloadCount, setMaxDownloadCount] = useState('0')
  const [videoDownloadConcurrency, setVideoDownloadConcurrency] = useState('3')
  const originalDownloadPath = useRef('')

  // 迁移
  const [showMigrationDialog, setShowMigrationDialog] = useState(false)
  const [migrationCount, setMigrationCount] = useState(0)
  const [pendingNewPath, setPendingNewPath] = useState('')
  const [pendingOldPath, setPendingOldPath] = useState('')
  const [migrating, setMigrating] = useState(false)

  // 分析
  const [analysisConcurrency, setAnalysisConcurrency] = useState('2')
  const [analysisRpm, setAnalysisRpm] = useState('10')
  const [analysisModel, setAnalysisModel] = useState('grok-4-fast')
  const [analysisSlices, setAnalysisSlices] = useState('4')
  const [analysisPrompt, setAnalysisPrompt] = useState('')

  // 更新
  const [currentVersion, setCurrentVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)

  // YouTube
  const [youtubeClientId, setYoutubeClientId] = useState('')
  const [youtubeClientSecret, setYoutubeClientSecret] = useState('')
  const [youtubeAuthenticated, setYoutubeAuthenticated] = useState(false)
  const [youtubeChannel, setYoutubeChannel] = useState<YouTubeChannelInfo | null>(null)
  const [loadingYoutube, setLoadingYoutube] = useState(false)
  const [youtubeDefaultPlaylist, setYoutubeDefaultPlaylist] = useState('')

  // 视频时长回填
  const [backfilling, setBackfilling] = useState(false)
  const [backfillProgress, setBackfillProgress] = useState<BackfillProgress | null>(null)

  useEffect(() => {
    loadSettings()
    loadVersion()

    const unsubscribeUpdater = window.api.updater.onStatus((status) => {
      setUpdateStatus(status)
      if (status.status === 'error') {
        toast.error(`更新失败: ${status.error}`)
      } else if (status.status === 'downloaded') {
        toast.success('更新已下载，重启应用即可安装')
      }
    })

    const unsubscribeBackfill = window.api.files.onBackfillProgress((progress) => {
      setBackfillProgress(progress)
      if (progress.status === 'completed') {
        setBackfilling(false)
        toast.success(`时长回填完成：${progress.succeeded} 个成功，${progress.failed} 个跳过`)
      }
    })

    return () => {
      unsubscribeUpdater()
      unsubscribeBackfill()
    }
  }, [])

  const loadVersion = async () => {
    try {
      const version = await window.api.updater.getCurrentVersion()
      setCurrentVersion(version)
    } catch {
      setCurrentVersion('未知')
    }
  }

  const loadSettings = async () => {
    const settings = await window.api.settings.getAll()
    setCookie(settings.douyin_cookie || '')
    setApiKey(settings.grok_api_key || '')
    setApiUrl(settings.grok_api_url || 'https://api.x.ai/v1')
    const savedPath = settings.download_path || ''
    setDownloadPath(savedPath)
    originalDownloadPath.current = savedPath
    setMaxDownloadCount(settings.max_download_count || '0')
    setVideoDownloadConcurrency(settings.video_download_concurrency || '3')
    setAnalysisConcurrency(settings.analysis_concurrency || '2')
    setAnalysisRpm(settings.analysis_rpm || '10')
    setAnalysisModel(settings.analysis_model || 'grok-4-fast')
    setAnalysisSlices(settings.analysis_slices || '4')
    setAnalysisPrompt(settings.analysis_prompt || '')
    setYoutubeClientId(settings.youtube_client_id || '')
    setYoutubeClientSecret(settings.youtube_client_secret || '')
    setYoutubeDefaultPlaylist(settings.youtube_default_playlist_id || '')

    // 加载 YouTube 认证状态
    loadYoutubeAuth()
  }

  // Cookie handlers
  const handleFetchCookie = async () => {
    setFetchingCookie(true)
    try {
      const result = await window.api.cookie.fetchDouyin()
      setCookie(result)
      if (result) {
        toast.success('Cookie 获取成功')
      } else {
        toast.warning('未获取到 Cookie，请确保已登录')
      }
    } catch {
      toast.error('获取 Cookie 失败')
    } finally {
      setFetchingCookie(false)
    }
  }

  const handleSaveCookie = async () => {
    try {
      await window.api.settings.set('douyin_cookie', cookie)
      toast.success('Cookie 已保存')
    } catch {
      toast.error('保存失败')
    }
  }

  // API handlers
  const handleSaveApi = async () => {
    try {
      await window.api.settings.set('grok_api_key', apiKey)
      await window.api.settings.set('grok_api_url', apiUrl)
      toast.success('API 设置已保存')
    } catch {
      toast.error('保存失败')
    }
  }

  const handleVerifyApi = async () => {
    if (!apiKey) {
      toast.error('请先输入 API Key')
      return
    }
    setVerifyingApi(true)
    try {
      await window.api.grok.verify(apiKey, apiUrl)
      toast.success('API Key 验证成功')
    } catch (error) {
      toast.error(`验证失败: ${(error as Error).message}`)
    } finally {
      setVerifyingApi(false)
    }
  }

  // YouTube handlers
  const loadYoutubeAuth = async () => {
    try {
      const authenticated = await window.api.youtube.isAuthenticated()
      setYoutubeAuthenticated(authenticated)
      if (authenticated) {
        const channelInfo = await window.api.youtube.getChannelInfo()
        setYoutubeChannel(channelInfo)
      }
    } catch (error) {
      console.error('Failed to load YouTube auth:', error)
    }
  }

  const handleSaveYoutubeCredentials = async () => {
    if (!youtubeClientId.trim() || !youtubeClientSecret.trim()) {
      toast.error('请填写完整的 Client ID 和 Client Secret')
      return
    }
    try {
      await window.api.settings.set('youtube_client_id', youtubeClientId)
      await window.api.settings.set('youtube_client_secret', youtubeClientSecret)
      toast.success('YouTube 凭据已保存')
    } catch {
      toast.error('保存失败')
    }
  }

  const handleYoutubeAuth = async () => {
    setLoadingYoutube(true)
    try {
      const result = await window.api.youtube.startAuth()
      if (result.success) {
        toast.success('YouTube 认证成功')
        await loadYoutubeAuth()
      } else {
        toast.error(result.error || '认证失败')
      }
    } catch (error) {
      toast.error(`认证失败: ${(error as Error).message}`)
    } finally {
      setLoadingYoutube(false)
    }
  }

  const handleYoutubeLogout = async () => {
    try {
      await window.api.youtube.logout()
      setYoutubeAuthenticated(false)
      setYoutubeChannel(null)
      toast.success('已退出 YouTube 账号')
    } catch {
      toast.error('退出失败')
    }
  }

  const handleSaveDefaultPlaylist = async () => {
    try {
      await window.api.settings.set('youtube_default_playlist_id', youtubeDefaultPlaylist)
      toast.success('默认播放列表已保存')
    } catch {
      toast.error('保存失败')
    }
  }

  // Download handlers
  const handleSaveDownload = async () => {
    try {
      const oldPath =
        originalDownloadPath.current || (await window.api.settings.getDefaultDownloadPath())
      const newPath = downloadPath

      if (newPath && oldPath !== newPath) {
        const count = await window.api.migration.getCount(oldPath)
        if (count > 0) {
          setMigrationCount(count)
          setPendingOldPath(oldPath)
          setPendingNewPath(newPath)
          setShowMigrationDialog(true)
          return
        }
      }

      await saveDownloadSettings()
    } catch {
      toast.error('保存失败')
    }
  }

  const saveDownloadSettings = async () => {
    await window.api.settings.set('download_path', downloadPath)
    await window.api.settings.set('max_download_count', maxDownloadCount)
    await window.api.settings.set('video_download_concurrency', videoDownloadConcurrency)
    originalDownloadPath.current = downloadPath
    toast.success('下载设置已保存')
  }

  const handleMigrate = async () => {
    setMigrating(true)
    try {
      const result = await window.api.migration.execute(pendingOldPath, pendingNewPath)

      await saveDownloadSettings()
      setShowMigrationDialog(false)

      if (result.failed > 0) {
        toast.warning(`迁移完成: 成功 ${result.success} 个，失败 ${result.failed} 个`)
      } else {
        toast.success(`迁移完成: 已迁移 ${result.success} 个文件夹`)
      }
    } catch (error) {
      toast.error(`迁移失败: ${(error as Error).message}`)
    } finally {
      setMigrating(false)
    }
  }

  const handleSkipMigration = async () => {
    setShowMigrationDialog(false)
    await saveDownloadSettings()
  }

  // Analysis handlers
  const handleSaveAnalysis = async () => {
    try {
      await window.api.settings.set('analysis_concurrency', analysisConcurrency)
      await window.api.settings.set('analysis_rpm', analysisRpm)
      await window.api.settings.set('analysis_model', analysisModel)
      await window.api.settings.set('analysis_slices', analysisSlices)
      await window.api.settings.set('analysis_prompt', analysisPrompt)
      toast.success('分析设置已保存')
    } catch {
      toast.error('保存失败')
    }
  }

  const handleBackfill = async () => {
    if (backfilling) return

    setBackfilling(true)
    setBackfillProgress(null)

    try {
      await window.api.files.backfillDurations()
    } catch (error) {
      toast.error(`回填失败: ${(error as Error).message}`)
      setBackfilling(false)
    }
  }

  const handleClearData = async () => {
    if (window.confirm('确定要清除所有数据吗？此操作不可恢复。')) {
      toast.success('数据已清除')
    }
  }

  // Update handlers
  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    try {
      const info = await window.api.updater.check()
      if (info) {
        toast.success(`发现新版本: v${info.version}`)
      } else {
        toast.info('当前已是最新版本')
      }
    } catch (error) {
      toast.error(`检查更新失败: ${(error as Error).message}`)
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleDownloadUpdate = async () => {
    try {
      await window.api.updater.download()
      toast.info('开始下载更新...')
    } catch (error) {
      toast.error(`下载失败: ${(error as Error).message}`)
    }
  }

  const handleInstallUpdate = () => {
    window.api.updater.install()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-16 flex items-center px-6 border-b border-[#E5E5E7] bg-white flex-shrink-0">
        <div>
          <h1 className="text-xl font-semibold text-[#1D1D1F]">系统设置</h1>
          <p className="text-sm text-[#6E6E73] mt-0.5">下载、分析与更新的全局配置</p>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <section className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-[#6E6E73] uppercase tracking-widest">
                基础配置
              </p>
              <h2 className="text-lg font-semibold text-[#1D1D1F] mt-1">账号与接口</h2>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Cookie Card */}
              <div className="bg-white rounded-2xl border border-[#E5E5E7] shadow-sm p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold text-[#1D1D1F]">抖音 Cookie</h2>
                    <p className="text-xs text-[#A1A1A6]">设置抖音登录 Cookie 用于获取视频数据</p>
                  </div>
                  <button
                    onClick={handleFetchCookie}
                    disabled={fetchingCookie}
                    className="h-9 px-4 rounded-lg border border-[#E5E5E7] text-sm text-[#1D1D1F] hover:bg-[#F2F2F4] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 w-full sm:w-auto"
                  >
                    {fetchingCookie ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Chrome className="h-4 w-4" />
                    )}
                    从浏览器获取
                  </button>
                </div>

                <div className="space-y-3 mt-4">
                  <textarea
                    value={cookie}
                    onChange={(e) => setCookie(e.target.value)}
                    placeholder="粘贴 Cookie 或点击上方按钮自动获取..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-[#F5F5F7] border border-[#E5E5E7] text-sm text-[#1D1D1F] font-mono resize-none transition-colors focus:outline-none focus-visible:border-[#0A84FF] focus-visible:ring-2 focus-visible:ring-[#0A84FF]/20"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveCookie}
                      className="h-9 px-4 rounded-lg bg-[#0A84FF] text-sm text-white font-medium hover:bg-[#0060D5] transition-colors"
                    >
                      保存 Cookie
                    </button>
                  </div>
                </div>
              </div>

              {/* API Settings Card */}
              <div className="bg-white rounded-2xl border border-[#E5E5E7] shadow-sm p-6">
                <h2 className="text-base font-semibold text-[#1D1D1F] mb-4">API 设置</h2>
                <p className="text-xs text-[#A1A1A6] mb-4">配置 Grok API 用于视频内容分析</p>

                <div className="space-y-4">
                  {/* API Key */}
                  <div className="flex items-center justify-between">
                    <div className="md:min-w-[120px]">
                      <p className="text-sm text-[#1D1D1F]">API Key</p>
                    </div>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="xai-**********************"
                      className="w-full md:w-[360px] h-10 px-3 rounded-lg bg-[#F5F5F7] border border-[#E5E5E7] text-sm text-[#1D1D1F] font-mono transition-colors focus:outline-none focus-visible:border-[#0A84FF] focus-visible:ring-2 focus-visible:ring-[#0A84FF]/20"
                    />
                  </div>

                  {/* API URL */}
                  <div className="flex items-center justify-between">
                    <div className="md:min-w-[120px]">
                      <p className="text-sm text-[#1D1D1F]">API URL</p>
                    </div>
                    <input
                      type="text"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      placeholder="https://api.x.ai/v1"
                      className="w-full md:w-[360px] h-10 px-3 rounded-lg bg-[#F5F5F7] border border-[#E5E5E7] text-sm text-[#1D1D1F] font-mono transition-colors focus:outline-none focus-visible:border-[#0A84FF] focus-visible:ring-2 focus-visible:ring-[#0A84FF]/20"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={handleVerifyApi}
                      disabled={verifyingApi}
                      className="h-9 px-4 rounded-lg border border-[#E5E5E7] text-sm text-[#1D1D1F] hover:bg-[#F2F2F4] transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {verifyingApi ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )}
                      验证
                    </button>
                    <button
                      onClick={handleSaveApi}
                      className="h-9 px-4 rounded-lg bg-[#0A84FF] text-sm text-white font-medium hover:bg-[#0060D5] transition-colors"
                    >
                      保存
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* YouTube Configuration Card */}
            <div className="bg-white rounded-2xl border border-[#E5E5E7] shadow-sm p-6 mt-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold text-[#1D1D1F]">YouTube 上传</h2>
                  <p className="text-xs text-[#A1A1A6] mt-1">配置 OAuth2 凭据以启用视频上传到 YouTube</p>
                </div>
                {youtubeAuthenticated && youtubeChannel && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-[#E3F9E8] rounded-lg">
                    <CheckCircle className="h-4 w-4 text-[#30D158]" />
                    <span className="text-xs font-medium text-[#30D158]">已连接</span>
                  </div>
                )}
              </div>

              {youtubeAuthenticated && youtubeChannel ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 bg-[#F5F5F7] rounded-lg">
                    {youtubeChannel.thumbnailUrl && (
                      <img
                        src={youtubeChannel.thumbnailUrl}
                        alt={youtubeChannel.title}
                        className="w-12 h-12 rounded-full"
                      />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#1D1D1F]">{youtubeChannel.title}</p>
                      <p className="text-xs text-[#A1A1A6] mt-0.5">{youtubeChannel.id}</p>
                    </div>
                    <button
                      onClick={handleYoutubeLogout}
                      className="h-9 px-4 rounded-lg border border-[#E5E5E7] text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      断开连接
                    </button>
                  </div>
                  <p className="text-xs text-[#6E6E73]">
                    提示: 可在「内容浏览」或「文件管理」页面选择视频上传到此频道
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Client ID */}
                  <div>
                    <label className="text-sm text-[#1D1D1F] mb-2 block">Client ID</label>
                    <input
                      type="text"
                      value={youtubeClientId}
                      onChange={(e) => setYoutubeClientId(e.target.value)}
                      placeholder="从 Google Cloud Console 获取"
                      className="w-full h-10 px-3 rounded-lg bg-[#F5F5F7] border border-[#E5E5E7] text-sm text-[#1D1D1F] font-mono transition-colors focus:outline-none focus-visible:border-[#0A84FF] focus-visible:ring-2 focus-visible:ring-[#0A84FF]/20"
                    />
                  </div>

                  {/* Client Secret */}
                  <div>
                    <label className="text-sm text-[#1D1D1F] mb-2 block">Client Secret</label>
                    <input
                      type="password"
                      value={youtubeClientSecret}
                      onChange={(e) => setYoutubeClientSecret(e.target.value)}
                      placeholder="从 Google Cloud Console 获取"
                      className="w-full h-10 px-3 rounded-lg bg-[#F5F5F7] border border-[#E5E5E7] text-sm text-[#1D1D1F] font-mono transition-colors focus:outline-none focus-visible:border-[#0A84FF] focus-visible:ring-2 focus-visible:ring-[#0A84FF]/20"
                    />
                  </div>

                  <div className="bg-[#F5F5F7] rounded-lg p-4">
                    <p className="text-xs text-[#6E6E73] leading-relaxed">
                      <strong className="text-[#1D1D1F]">获取 OAuth 凭据:</strong>
                      <br />
                      1. 前往{' '}
                      <a
                        href="https://console.cloud.google.com/apis/credentials"
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#0A84FF] hover:underline"
                      >
                        Google Cloud Console
                      </a>
                      <br />
                      2. 创建 OAuth 2.0 客户端 ID（应用类型：桌面应用）
                      <br />
                      3. 将 Client ID 和 Client Secret 填入上方
                    </p>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={handleSaveYoutubeCredentials}
                      className="h-9 px-4 rounded-lg border border-[#E5E5E7] text-sm text-[#1D1D1F] hover:bg-[#F2F2F4] transition-colors"
                    >
                      保存凭据
                    </button>
                    <button
                      onClick={handleYoutubeAuth}
                      disabled={loadingYoutube || !youtubeClientId || !youtubeClientSecret}
                      className="h-9 px-4 rounded-lg bg-[#FF0000] text-sm text-white font-medium hover:bg-[#CC0000] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loadingYoutube && <Loader2 className="h-4 w-4 animate-spin" />}
                      连接 YouTube
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* YouTube Default Playlist Card */}
            {youtubeAuthenticated && youtubeChannel && (
              <div className="bg-white rounded-2xl border border-[#E5E5E7] shadow-sm p-6 mt-6">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-[#1D1D1F]">默认播放列表</h2>
                  <p className="text-xs text-[#A1A1A6] mt-1">
                    设置上传视频时的默认播放列表(可在上传时单独选择)
                  </p>
                </div>

                <div className="space-y-4">
                  <PlaylistSelector
                    value={youtubeDefaultPlaylist}
                    onChange={setYoutubeDefaultPlaylist}
                    className="w-full"
                  />

                  <div className="bg-[#F5F5F7] rounded-lg p-4">
                    <p className="text-xs text-[#6E6E73] leading-relaxed">
                      <strong className="text-[#1D1D1F]">使用说明:</strong>
                      <br />
                      • 设置默认播放列表后,所有上传的视频将自动添加到该列表
                      <br />
                      • 上传时可以临时选择其他播放列表
                      <br />• 选择"不添加到播放列表"则视频不会加入任何列表
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveDefaultPlaylist}
                      className="h-9 px-4 rounded-lg bg-[#0A84FF] text-sm text-white font-medium hover:bg-[#0060D5] transition-colors"
                    >
                      保存设置
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-[#6E6E73] uppercase tracking-widest">
                任务参数
              </p>
              <h2 className="text-lg font-semibold text-[#1D1D1F] mt-1">下载与分析</h2>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Download Settings Card */}
              <div className="bg-white rounded-2xl border border-[#E5E5E7] shadow-sm p-6">
                <h2 className="text-base font-semibold text-[#1D1D1F] mb-4">下载设置</h2>

                <div className="divide-y divide-[#E5E5E7]">
                  {/* Download Path */}
                  <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-[#1D1D1F]">下载路径</p>
                      <p className="text-xs text-[#A1A1A6] mt-1">视频下载保存位置</p>
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-[320px]">
                      <input
                        type="text"
                        value={downloadPath}
                        onChange={(e) => setDownloadPath(e.target.value)}
                        placeholder="/Users/downloads/douyin"
                        className="flex-1 h-10 px-3 rounded-lg bg-[#F5F5F7] border border-[#E5E5E7] text-sm text-[#1D1D1F] transition-colors focus:outline-none focus-visible:border-[#0A84FF] focus-visible:ring-2 focus-visible:ring-[#0A84FF]/20"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const path = await window.api.system.openDirectoryDialog()
                          if (path) setDownloadPath(path)
                        }}
                        className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-lg border border-[#E5E5E7] bg-[#F5F5F7] hover:bg-[#E8E8ED] transition-colors"
                        title="选择目录"
                      >
                        <FolderOpen className="h-4 w-4 text-[#6E6E73]" />
                      </button>
                    </div>
                  </div>

                  {/* Max Download Count */}
                  <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-[#1D1D1F]">最大下载数量</p>
                      <p className="text-xs text-[#A1A1A6] mt-1">0 表示无限制</p>
                    </div>
                    <input
                      type="number"
                      value={maxDownloadCount}
                      onChange={(e) => setMaxDownloadCount(e.target.value)}
                      className="w-full md:w-[140px] h-10 px-3 rounded-lg bg-[#F5F5F7] border border-[#E5E5E7] text-sm text-[#1D1D1F] transition-colors focus:outline-none focus-visible:border-[#0A84FF] focus-visible:ring-2 focus-visible:ring-[#0A84FF]/20 text-center"
                    />
                  </div>

                  {/* Concurrency */}
                  <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-[#1D1D1F]">并发下载数</p>
                      <p className="text-xs text-[#A1A1A6] mt-1">同时下载的视频数量</p>
                    </div>
                    <input
                      type="number"
                      value={videoDownloadConcurrency}
                      onChange={(e) => setVideoDownloadConcurrency(e.target.value)}
                      min="1"
                      className="w-20 h-9 px-3 rounded-md bg-[#F5F5F7] border border-[#E5E5E7] text-sm text-[#1D1D1F] font-mono text-center focus:outline-none focus:border-[#0A84FF]"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSaveDownload}
                    className="h-9 px-4 rounded-lg bg-[#0A84FF] text-sm text-white font-medium hover:bg-[#0060D5] transition-colors"
                  >
                    保存下载设置
                  </button>
                </div>
              </div>

              {/* Analysis Settings Card */}
              <div className="bg-white rounded-2xl border border-[#E5E5E7] shadow-sm p-6">
                <h2 className="text-base font-semibold text-[#1D1D1F] mb-4">分析设置</h2>
                <p className="text-xs text-[#A1A1A6] mb-4">配置视频内容分析参数</p>

                <div className="divide-y divide-[#E5E5E7]">
                  {/* Analysis Model */}
                  <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-[#1D1D1F]">AI 模型</p>
                      <p className="text-xs text-[#A1A1A6] mt-1">用于视频分析的模型</p>
                    </div>
                    <input
                      type="text"
                      value={analysisModel}
                      onChange={(e) => setAnalysisModel(e.target.value)}
                      placeholder="grok-4-fast"
                      className="w-48 h-9 px-3 rounded-md bg-[#F5F5F7] border border-[#E5E5E7] text-sm text-[#1D1D1F] focus:outline-none focus:border-[#0A84FF]"
                    />
                  </div>

                  {/* Analysis Concurrency */}
                  <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-[#1D1D1F]">分析并发数</p>
                      <p className="text-xs text-[#A1A1A6] mt-1">同时分析的视频数量</p>
                    </div>
                    <input
                      type="number"
                      value={analysisConcurrency}
                      onChange={(e) => setAnalysisConcurrency(e.target.value)}
                      min="1"
                      className="w-20 h-9 px-3 rounded-md bg-[#F5F5F7] border border-[#E5E5E7] text-sm text-[#1D1D1F] font-mono text-center focus:outline-none focus:border-[#0A84FF]"
                    />
                  </div>

                  {/* Analysis RPM */}
                  <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-[#1D1D1F]">RPM 限制</p>
                      <p className="text-xs text-[#A1A1A6] mt-1">每分钟最大请求数</p>
                    </div>
                    <input
                      type="number"
                      value={analysisRpm}
                      onChange={(e) => setAnalysisRpm(e.target.value)}
                      className="w-full md:w-[140px] h-10 px-3 rounded-lg bg-[#F5F5F7] border border-[#E5E5E7] text-sm text-[#1D1D1F] transition-colors focus:outline-none focus-visible:border-[#0A84FF] focus-visible:ring-2 focus-visible:ring-[#0A84FF]/20 text-center"
                    />
                  </div>

                  {/* Analysis Slices */}
                  <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-[#1D1D1F]">视频切片数</p>
                      <p className="text-xs text-[#A1A1A6] mt-1">每个视频分析的帧数</p>
                    </div>
                    <input
                      type="number"
                      value={analysisSlices}
                      onChange={(e) => setAnalysisSlices(e.target.value)}
                      min="1"
                      className="w-20 h-9 px-3 rounded-md bg-[#F5F5F7] border border-[#E5E5E7] text-sm text-[#1D1D1F] font-mono text-center focus:outline-none focus:border-[#0A84FF]"
                    />
                  </div>

                  {/* Analysis Prompt */}
                  <div className="py-4">
                    <div className="mb-2">
                      <p className="text-sm text-[#1D1D1F]">自定义 Prompt</p>
                      <p className="text-xs text-[#A1A1A6] mt-1">留空使用默认 Prompt</p>
                    </div>
                    <textarea
                      value={analysisPrompt}
                      onChange={(e) => setAnalysisPrompt(e.target.value)}
                      placeholder="自定义分析提示词..."
                      rows={4}
                      className="w-full px-3 py-2 rounded-lg bg-[#F5F5F7] border border-[#E5E5E7] text-sm text-[#1D1D1F] resize-none transition-colors focus:outline-none focus-visible:border-[#0A84FF] focus-visible:ring-2 focus-visible:ring-[#0A84FF]/20"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSaveAnalysis}
                    className="h-9 px-4 rounded-lg bg-[#0A84FF] text-sm text-white font-medium hover:bg-[#0060D5] transition-colors"
                  >
                    保存分析设置
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-[#6E6E73] uppercase tracking-widest">系统</p>
              <h2 className="text-lg font-semibold text-[#1D1D1F] mt-1">版本与安全</h2>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Version & Update Card */}
              <div className="bg-white rounded-2xl border border-[#E5E5E7] shadow-sm p-6">
                <h2 className="text-base font-semibold text-[#1D1D1F] mb-4">关于</h2>

                <div className="divide-y divide-[#E5E5E7]">
                  <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-[#1D1D1F]">当前版本</p>
                      <p className="text-xs text-[#A1A1A6] mt-1">v{currentVersion}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {updateStatus?.status === 'available' && (
                        <button
                          onClick={handleDownloadUpdate}
                          className="h-9 px-4 rounded-lg bg-[#0A84FF] text-sm text-white font-medium hover:bg-[#0060D5] transition-colors flex items-center gap-2"
                        >
                          <Download className="h-4 w-4" />
                          下载 v{updateStatus.info?.version}
                        </button>
                      )}
                      {updateStatus?.status === 'downloading' && (
                        <div className="flex items-center gap-2 text-sm text-[#A1A1A6]">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          下载中 {Math.round(updateStatus.progress || 0)}%
                        </div>
                      )}
                      {updateStatus?.status === 'downloaded' && (
                        <button
                          onClick={handleInstallUpdate}
                          className="h-9 px-4 rounded-lg bg-[#22C55E] text-sm text-white font-medium hover:bg-[#16A34A] transition-colors flex items-center gap-2"
                        >
                          <RefreshCw className="h-4 w-4" />
                          重启安装
                        </button>
                      )}
                      {(!updateStatus ||
                        updateStatus.status === 'not-available' ||
                        updateStatus.status === 'error') && (
                        <button
                          onClick={handleCheckUpdate}
                          disabled={checkingUpdate}
                          className="h-9 px-4 rounded-lg border border-[#E5E5E7] text-sm text-[#1D1D1F] hover:bg-[#F2F2F4] transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                          {checkingUpdate ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          检查更新
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-[#1D1D1F]">GitHub</p>
                      <p className="text-xs text-[#A1A1A6] mt-1">查看源代码和发布记录</p>
                    </div>
                    <a
                      href="https://github.com/Everless321/dYm"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-[#0A84FF] hover:underline"
                    >
                      Everless321/dYm
                    </a>
                  </div>

                  <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm text-[#1D1D1F]">数据目录</p>
                      <p className="text-xs text-[#A1A1A6] mt-1">数据库及配置文件所在位置</p>
                    </div>
                    <button
                      onClick={() => window.api.system.openDataDirectory()}
                      className="h-9 px-4 rounded-lg border border-[#E5E5E7] text-sm text-[#1D1D1F] hover:bg-[#F2F2F4] transition-colors flex items-center gap-2"
                    >
                      <Database className="h-4 w-4" />
                      打开目录
                    </button>
                  </div>

                  {/* 视频时长回填 */}
                  <div className="flex flex-col gap-3 py-4 border-t border-[#E5E5E7]">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <p className="text-sm text-[#1D1D1F]">视频时长回填</p>
                        <p className="text-xs text-[#A1A1A6] mt-1">
                          为旧视频补充时长信息（新下载的视频会自动提取）
                        </p>
                      </div>
                      <button
                        onClick={handleBackfill}
                        disabled={backfilling}
                        className="h-9 px-4 rounded-lg border border-[#E5E5E7] text-sm text-[#1D1D1F] hover:bg-[#F2F2F4] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {backfilling ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            处理中...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4" />
                            回填时长
                          </>
                        )}
                      </button>
                    </div>

                    {/* 进度条 */}
                    {backfillProgress && backfillProgress.status === 'running' && (
                      <div className="bg-[#F2F2F4] rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-[#1D1D1F]">{backfillProgress.message}</span>
                          <span className="text-xs text-[#6E6E73]">
                            {backfillProgress.processed}/{backfillProgress.total}
                          </span>
                        </div>
                        <div className="h-2 bg-white rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#0A84FF] transition-all"
                            style={{
                              width: `${(backfillProgress.processed / backfillProgress.total) * 100}%`
                            }}
                          />
                        </div>
                        <div className="text-xs text-[#6E6E73] mt-2">
                          成功 {backfillProgress.succeeded} 个，跳过 {backfillProgress.failed} 个
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Danger Zone Card */}
              <div className="bg-white rounded-2xl border border-[#FF3B30]/30 shadow-sm p-6">
                <h2 className="text-base font-semibold text-[#FF3B30] mb-4">危险区域</h2>

                <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm text-[#1D1D1F]">清除所有数据</p>
                    <p className="text-xs text-[#A1A1A6] mt-1">删除所有下载的视频和用户数据</p>
                  </div>
                  <button
                    onClick={handleClearData}
                    className="h-9 px-4 rounded-lg border border-[#0A84FF] text-sm font-medium text-[#0A84FF] hover:bg-[#E8F0FE] transition-colors"
                  >
                    清除数据
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Migration Dialog */}
      {showMigrationDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-[480px] shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E5E7]">
              <div className="flex items-center gap-3">
                <FolderSync className="h-5 w-5 text-[#0A84FF]" />
                <h3 className="text-base font-semibold text-[#1D1D1F]">检测到下载路径变更</h3>
              </div>
              <button
                onClick={() => setShowMigrationDialog(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-[#F2F2F4] transition-colors"
              >
                <X className="h-4 w-4 text-[#6E6E73]" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5">
              <p className="text-sm text-[#1D1D1F] mb-4">
                发现 <span className="font-medium text-[#0A84FF]">{migrationCount}</span>{' '}
                个视频文件夹在旧路径中。
              </p>
              <p className="text-sm text-[#6E6E73] mb-4">
                是否将文件迁移到新路径？迁移后数据库记录将自动更新。
              </p>
              <div className="text-xs text-[#A1A1A6] space-y-1 bg-[#F2F2F4] rounded-lg p-3">
                <p>
                  <span className="text-[#6E6E73]">旧路径:</span>{' '}
                  {originalDownloadPath.current || '默认路径'}
                </p>
                <p>
                  <span className="text-[#6E6E73]">新路径:</span> {pendingNewPath}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#E5E5E7]">
              <button
                onClick={handleSkipMigration}
                disabled={migrating}
                className="h-9 px-4 rounded-lg border border-[#E5E5E7] text-sm text-[#1D1D1F] hover:bg-[#F2F2F4] transition-colors disabled:opacity-50"
              >
                跳过迁移
              </button>
              <button
                onClick={handleMigrate}
                disabled={migrating}
                className="h-9 px-4 rounded-lg bg-[#0A84FF] text-sm text-white font-medium hover:bg-[#0060D5] transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {migrating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    迁移中...
                  </>
                ) : (
                  <>
                    <FolderSync className="h-4 w-4" />
                    迁移文件
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
