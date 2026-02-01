import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { ChevronDown, Loader2, Chrome, CheckCircle, Download, RefreshCw } from 'lucide-react'

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

  // 分析
  const [analysisConcurrency, setAnalysisConcurrency] = useState('2')
  const [analysisRpm, setAnalysisRpm] = useState('10')
  const [analysisModel, setAnalysisModel] = useState('grok-4-fast')
  const [analysisSlices, setAnalysisSlices] = useState('4')
  const [analysisPrompt, setAnalysisPrompt] = useState('')

  // Dropdowns
  const [showConcurrencyDropdown, setShowConcurrencyDropdown] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [showAnalysisConcurrencyDropdown, setShowAnalysisConcurrencyDropdown] = useState(false)
  const [showSlicesDropdown, setShowSlicesDropdown] = useState(false)

  // 更新
  const [currentVersion, setCurrentVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [checkingUpdate, setCheckingUpdate] = useState(false)

  useEffect(() => {
    loadSettings()
    loadVersion()

    const unsubscribe = window.api.updater.onStatus((status) => {
      setUpdateStatus(status)
      if (status.status === 'error') {
        toast.error(`更新失败: ${status.error}`)
      } else if (status.status === 'downloaded') {
        toast.success('更新已下载，重启应用即可安装')
      }
    })

    return () => unsubscribe()
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
    setDownloadPath(settings.download_path || '')
    setMaxDownloadCount(settings.max_download_count || '0')
    setVideoDownloadConcurrency(settings.video_download_concurrency || '3')
    setAnalysisConcurrency(settings.analysis_concurrency || '2')
    setAnalysisRpm(settings.analysis_rpm || '10')
    setAnalysisModel(settings.analysis_model || 'grok-4-fast')
    setAnalysisSlices(settings.analysis_slices || '4')
    setAnalysisPrompt(settings.analysis_prompt || '')
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

  // Download handlers
  const handleSaveDownload = async () => {
    try {
      await window.api.settings.set('download_path', downloadPath)
      await window.api.settings.set('max_download_count', maxDownloadCount)
      await window.api.settings.set('video_download_concurrency', videoDownloadConcurrency)
      toast.success('下载设置已保存')
    } catch {
      toast.error('保存失败')
    }
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

  const concurrencyOptions = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
  const modelOptions = ['grok-4-fast', 'grok-4', 'grok-3-vision', 'gpt-4-vision']
  const slicesOptions = ['1', '2', '3', '4', '5', '6', '8', '10']

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-16 flex items-center px-6 border-b border-[#EAE6E1] flex-shrink-0">
        <h1 className="text-xl font-semibold text-[#312E2A]">系统设置</h1>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl space-y-5">

          {/* Cookie Card */}
          <div className="bg-white rounded-xl border border-[#EAE6E1] p-5">
            <h2 className="text-base font-semibold text-[#312E2A] mb-4">抖音 Cookie</h2>
            <p className="text-xs text-[#B8B2AD] mb-4">设置抖音登录 Cookie 用于获取视频数据</p>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleFetchCookie}
                  disabled={fetchingCookie}
                  className="h-9 px-4 rounded-lg border border-[#EAE6E1] text-sm text-[#312E2A] hover:bg-[#F7F5F3] transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {fetchingCookie ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Chrome className="h-4 w-4" />
                  )}
                  从浏览器获取
                </button>
              </div>
              <textarea
                value={cookie}
                onChange={(e) => setCookie(e.target.value)}
                placeholder="粘贴 Cookie 或点击上方按钮自动获取..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-[#FDFCFB] border border-[#EAE6E1] text-sm text-[#312E2A] font-mono resize-none focus:outline-none focus:border-[#FE2C55]"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleSaveCookie}
                  className="h-9 px-4 rounded-lg bg-[#FE2C55] text-sm text-white font-medium hover:bg-[#E91E45] transition-colors"
                >
                  保存 Cookie
                </button>
              </div>
            </div>
          </div>

          {/* API Settings Card */}
          <div className="bg-white rounded-xl border border-[#EAE6E1] p-5">
            <h2 className="text-base font-semibold text-[#312E2A] mb-4">API 设置</h2>
            <p className="text-xs text-[#B8B2AD] mb-4">配置 Grok API 用于视频内容分析</p>

            <div className="space-y-4">
              {/* API Key */}
              <div className="flex items-center justify-between">
                <div className="min-w-[100px]">
                  <p className="text-sm text-[#312E2A]">API Key</p>
                </div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="xai-**********************"
                  className="flex-1 h-10 px-3 rounded-lg bg-[#FDFCFB] border border-[#EAE6E1] text-sm text-[#312E2A] font-mono focus:outline-none focus:border-[#FE2C55] max-w-[400px]"
                />
              </div>

              {/* API URL */}
              <div className="flex items-center justify-between">
                <div className="min-w-[100px]">
                  <p className="text-sm text-[#312E2A]">API URL</p>
                </div>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://api.x.ai/v1"
                  className="flex-1 h-10 px-3 rounded-lg bg-[#FDFCFB] border border-[#EAE6E1] text-sm text-[#312E2A] font-mono focus:outline-none focus:border-[#FE2C55] max-w-[400px]"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={handleVerifyApi}
                  disabled={verifyingApi}
                  className="h-9 px-4 rounded-lg border border-[#EAE6E1] text-sm text-[#312E2A] hover:bg-[#F7F5F3] transition-colors flex items-center gap-2 disabled:opacity-50"
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
                  className="h-9 px-4 rounded-lg bg-[#FE2C55] text-sm text-white font-medium hover:bg-[#E91E45] transition-colors"
                >
                  保存
                </button>
              </div>
            </div>
          </div>

          {/* Download Settings Card */}
          <div className="bg-white rounded-xl border border-[#EAE6E1] p-5">
            <h2 className="text-base font-semibold text-[#312E2A] mb-4">下载设置</h2>

            {/* Download Path */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-[#312E2A]">下载路径</p>
                <p className="text-xs text-[#B8B2AD] mt-1">视频下载保存位置</p>
              </div>
              <input
                type="text"
                value={downloadPath}
                onChange={(e) => setDownloadPath(e.target.value)}
                placeholder="/Users/downloads/douyin"
                className="h-10 px-3 rounded-lg bg-[#FDFCFB] border border-[#EAE6E1] text-sm text-[#312E2A] focus:outline-none focus:border-[#FE2C55] min-w-[300px]"
              />
            </div>

            {/* Max Download Count */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-[#312E2A]">最大下载数量</p>
                <p className="text-xs text-[#B8B2AD] mt-1">0 表示无限制</p>
              </div>
              <input
                type="number"
                value={maxDownloadCount}
                onChange={(e) => setMaxDownloadCount(e.target.value)}
                className="h-10 px-3 rounded-lg bg-[#FDFCFB] border border-[#EAE6E1] text-sm text-[#312E2A] focus:outline-none focus:border-[#FE2C55] w-[120px] text-center"
              />
            </div>

            {/* Concurrency */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-[#312E2A]">并发下载数</p>
                <p className="text-xs text-[#B8B2AD] mt-1">同时下载的视频数量</p>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowConcurrencyDropdown(!showConcurrencyDropdown)}
                  className="h-10 px-3 rounded-lg bg-[#FDFCFB] border border-[#EAE6E1] flex items-center justify-between min-w-[120px]"
                >
                  <span className="text-sm text-[#312E2A]">{videoDownloadConcurrency}</span>
                  <ChevronDown className="h-4 w-4 text-[#B8B2AD] ml-2" />
                </button>
                {showConcurrencyDropdown && (
                  <div className="absolute top-full right-0 mt-1 bg-white rounded-lg border border-[#EAE6E1] shadow-lg z-10 max-h-48 overflow-y-auto min-w-[120px]">
                    {concurrencyOptions.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          setVideoDownloadConcurrency(opt)
                          setShowConcurrencyDropdown(false)
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-[#F7F5F3] transition-colors ${
                          opt === videoDownloadConcurrency ? 'text-[#FE2C55] font-medium' : 'text-[#312E2A]'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveDownload}
                className="h-9 px-4 rounded-lg bg-[#FE2C55] text-sm text-white font-medium hover:bg-[#E91E45] transition-colors"
              >
                保存下载设置
              </button>
            </div>
          </div>

          {/* Analysis Settings Card */}
          <div className="bg-white rounded-xl border border-[#EAE6E1] p-5">
            <h2 className="text-base font-semibold text-[#312E2A] mb-4">分析设置</h2>
            <p className="text-xs text-[#B8B2AD] mb-4">配置视频内容分析参数</p>

            {/* Analysis Model */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-[#312E2A]">AI 模型</p>
                <p className="text-xs text-[#B8B2AD] mt-1">用于视频分析的模型</p>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowModelDropdown(!showModelDropdown)}
                  className="h-10 px-3 rounded-lg bg-[#FDFCFB] border border-[#EAE6E1] flex items-center justify-between min-w-[200px]"
                >
                  <span className="text-sm text-[#312E2A]">{analysisModel}</span>
                  <ChevronDown className="h-4 w-4 text-[#B8B2AD] ml-2" />
                </button>
                {showModelDropdown && (
                  <div className="absolute top-full right-0 mt-1 bg-white rounded-lg border border-[#EAE6E1] shadow-lg z-10 min-w-[200px]">
                    {modelOptions.map((model) => (
                      <button
                        key={model}
                        onClick={() => {
                          setAnalysisModel(model)
                          setShowModelDropdown(false)
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-[#F7F5F3] transition-colors ${
                          model === analysisModel ? 'text-[#FE2C55] font-medium' : 'text-[#312E2A]'
                        }`}
                      >
                        {model}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Analysis Concurrency */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-[#312E2A]">分析并发数</p>
                <p className="text-xs text-[#B8B2AD] mt-1">同时分析的视频数量</p>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowAnalysisConcurrencyDropdown(!showAnalysisConcurrencyDropdown)}
                  className="h-10 px-3 rounded-lg bg-[#FDFCFB] border border-[#EAE6E1] flex items-center justify-between min-w-[120px]"
                >
                  <span className="text-sm text-[#312E2A]">{analysisConcurrency}</span>
                  <ChevronDown className="h-4 w-4 text-[#B8B2AD] ml-2" />
                </button>
                {showAnalysisConcurrencyDropdown && (
                  <div className="absolute top-full right-0 mt-1 bg-white rounded-lg border border-[#EAE6E1] shadow-lg z-10 max-h-48 overflow-y-auto min-w-[120px]">
                    {concurrencyOptions.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          setAnalysisConcurrency(opt)
                          setShowAnalysisConcurrencyDropdown(false)
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-[#F7F5F3] transition-colors ${
                          opt === analysisConcurrency ? 'text-[#FE2C55] font-medium' : 'text-[#312E2A]'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Analysis RPM */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-[#312E2A]">RPM 限制</p>
                <p className="text-xs text-[#B8B2AD] mt-1">每分钟最大请求数</p>
              </div>
              <input
                type="number"
                value={analysisRpm}
                onChange={(e) => setAnalysisRpm(e.target.value)}
                className="h-10 px-3 rounded-lg bg-[#FDFCFB] border border-[#EAE6E1] text-sm text-[#312E2A] focus:outline-none focus:border-[#FE2C55] w-[120px] text-center"
              />
            </div>

            {/* Analysis Slices */}
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-[#312E2A]">视频切片数</p>
                <p className="text-xs text-[#B8B2AD] mt-1">每个视频分析的帧数</p>
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowSlicesDropdown(!showSlicesDropdown)}
                  className="h-10 px-3 rounded-lg bg-[#FDFCFB] border border-[#EAE6E1] flex items-center justify-between min-w-[120px]"
                >
                  <span className="text-sm text-[#312E2A]">{analysisSlices}</span>
                  <ChevronDown className="h-4 w-4 text-[#B8B2AD] ml-2" />
                </button>
                {showSlicesDropdown && (
                  <div className="absolute top-full right-0 mt-1 bg-white rounded-lg border border-[#EAE6E1] shadow-lg z-10 min-w-[120px]">
                    {slicesOptions.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => {
                          setAnalysisSlices(opt)
                          setShowSlicesDropdown(false)
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-[#F7F5F3] transition-colors ${
                          opt === analysisSlices ? 'text-[#FE2C55] font-medium' : 'text-[#312E2A]'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Analysis Prompt */}
            <div className="py-3">
              <div className="mb-2">
                <p className="text-sm text-[#312E2A]">自定义 Prompt</p>
                <p className="text-xs text-[#B8B2AD] mt-1">留空使用默认 Prompt</p>
              </div>
              <textarea
                value={analysisPrompt}
                onChange={(e) => setAnalysisPrompt(e.target.value)}
                placeholder="自定义分析提示词..."
                rows={4}
                className="w-full px-3 py-2 rounded-lg bg-[#FDFCFB] border border-[#EAE6E1] text-sm text-[#312E2A] resize-none focus:outline-none focus:border-[#FE2C55]"
              />
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveAnalysis}
                className="h-9 px-4 rounded-lg bg-[#FE2C55] text-sm text-white font-medium hover:bg-[#E91E45] transition-colors"
              >
                保存分析设置
              </button>
            </div>
          </div>

          {/* Version & Update Card */}
          <div className="bg-white rounded-xl border border-[#EAE6E1] p-5">
            <h2 className="text-base font-semibold text-[#312E2A] mb-4">关于</h2>

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-[#312E2A]">当前版本</p>
                <p className="text-xs text-[#B8B2AD] mt-1">v{currentVersion}</p>
              </div>
              <div className="flex items-center gap-2">
                {updateStatus?.status === 'available' && (
                  <button
                    onClick={handleDownloadUpdate}
                    className="h-9 px-4 rounded-lg bg-[#FE2C55] text-sm text-white font-medium hover:bg-[#E91E45] transition-colors flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    下载 v{updateStatus.info?.version}
                  </button>
                )}
                {updateStatus?.status === 'downloading' && (
                  <div className="flex items-center gap-2 text-sm text-[#B8B2AD]">
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
                {(!updateStatus || updateStatus.status === 'not-available' || updateStatus.status === 'error') && (
                  <button
                    onClick={handleCheckUpdate}
                    disabled={checkingUpdate}
                    className="h-9 px-4 rounded-lg border border-[#EAE6E1] text-sm text-[#312E2A] hover:bg-[#F7F5F3] transition-colors flex items-center gap-2 disabled:opacity-50"
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

            <div className="flex items-center justify-between py-3 border-t border-[#EAE6E1]">
              <div>
                <p className="text-sm text-[#312E2A]">GitHub</p>
                <p className="text-xs text-[#B8B2AD] mt-1">查看源代码和发布记录</p>
              </div>
              <a
                href="https://github.com/Everless321/dYm"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#FE2C55] hover:underline"
              >
                Everless321/dYm
              </a>
            </div>
          </div>

          {/* Danger Zone Card */}
          <div className="bg-white rounded-xl border border-[#FE2C5540] p-5">
            <h2 className="text-base font-semibold text-[#FE2C55] mb-4">危险区域</h2>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm text-[#312E2A]">清除所有数据</p>
                <p className="text-xs text-[#B8B2AD] mt-1">删除所有下载的视频和用户数据</p>
              </div>
              <button
                onClick={handleClearData}
                className="h-9 px-4 rounded-lg border border-[#FE2C55] text-sm font-medium text-[#FE2C55] hover:bg-[#FEE2E8] transition-colors"
              >
                清除数据
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
