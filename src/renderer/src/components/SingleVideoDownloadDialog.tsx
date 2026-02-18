import { useState, useEffect, useCallback } from 'react'
import { Download, Loader2, CheckCircle2, XCircle, AlertCircle, Link } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'

interface SingleVideoDownloadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function SingleVideoDownloadDialog({
  open,
  onOpenChange,
  onSuccess
}: SingleVideoDownloadDialogProps) {
  const [url, setUrl] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<SingleDownloadProgress | null>(null)

  // 检查剪贴板是否有抖音链接
  const checkClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text && (text.includes('douyin.com') || text.includes('v.douyin.com'))) {
        const urlMatch = text.match(/https?:\/\/[^\s]+douyin\.com[^\s]*/i)
        if (urlMatch) {
          setUrl(urlMatch[0])
        }
      }
    } catch {
      // 剪贴板访问失败，忽略
    }
  }, [])

  // 打开对话框时检查剪贴板
  useEffect(() => {
    if (open) {
      checkClipboard()
      setProgress(null)
    } else {
      setUrl('')
      setProgress(null)
      setDownloading(false)
    }
  }, [open, checkClipboard])

  // 订阅下载进度
  useEffect(() => {
    const unsubscribe = window.api.video.onSingleProgress((p) => {
      setProgress(p)

      if (p.status === 'completed') {
        toast.success(p.message)
        setDownloading(false)
        onSuccess?.()
        // 延迟关闭对话框，让用户看到成功状态
        setTimeout(() => {
          onOpenChange(false)
        }, 1500)
      } else if (p.status === 'failed') {
        toast.error(p.message)
        setDownloading(false)
      }
    })

    return unsubscribe
  }, [onOpenChange, onSuccess])

  const handleDownload = async () => {
    if (!url.trim()) {
      toast.error('请输入视频链接')
      return
    }

    // 检查是否已有下载任务
    const isRunning = await window.api.video.isSingleDownloadRunning()
    if (isRunning) {
      toast.error('已有下载任务在进行中，请稍后再试')
      return
    }

    setDownloading(true)
    setProgress({ status: 'parsing', progress: 0, message: '准备下载...' })

    try {
      const result = await window.api.video.downloadSingle(url)
      if (!result.success && result.error) {
        // 错误已通过 progress 推送，这里只是最终确认
        if (!progress || progress.status !== 'failed') {
          toast.error(result.error)
        }
        setDownloading(false)
      }
    } catch (err) {
      toast.error((err as Error).message || '下载失败')
      setDownloading(false)
    }
  }

  const getStatusIcon = () => {
    if (!progress) return null

    switch (progress.status) {
      case 'parsing':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
      case 'downloading':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
      case 'saving':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />
      default:
        return null
    }
  }

  const getStatusColor = () => {
    if (!progress) return 'bg-gray-200'

    switch (progress.status) {
      case 'parsing':
      case 'downloading':
      case 'saving':
        return 'bg-blue-500'
      case 'completed':
        return 'bg-green-500'
      case 'failed':
        return 'bg-red-500'
      default:
        return 'bg-gray-200'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="h-5 w-5 text-[#0A84FF]" />
            下载单个视频
          </DialogTitle>
          <DialogDescription>输入抖音视频链接，下载并存入数据库管理</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 输入区域 */}
          <div className="space-y-2">
            <Input
              placeholder="粘贴抖音视频链接..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !downloading && handleDownload()}
              disabled={downloading}
              className="h-10"
            />
            <p className="text-xs text-muted-foreground">
              支持分享链接或完整链接，如: https://v.douyin.com/xxx
            </p>
          </div>

          {/* 进度显示 */}
          {progress && (
            <div className="space-y-3 p-4 rounded-lg bg-[#F5F5F7]">
              <div className="flex items-center gap-3">
                {getStatusIcon()}
                <span className="text-sm font-medium text-[#1D1D1F]">{progress.message}</span>
              </div>

              {progress.status !== 'completed' && progress.status !== 'failed' && (
                <Progress
                  value={progress.progress}
                  className="h-2"
                  // 使用自定义颜色
                  style={
                    {
                      '--progress-background': getStatusColor()
                    } as React.CSSProperties
                  }
                />
              )}

              {progress.status === 'completed' && (
                <p className="text-xs text-green-600">
                  视频已下载并存入数据库，可在「内容浏览」或「文件管理」中查看
                </p>
              )}
            </div>
          )}

          {/* 下载按钮 */}
          <Button
            className="w-full h-10 bg-[#0A84FF] hover:bg-[#0A84FF]/90 text-white"
            onClick={handleDownload}
            disabled={downloading || !url.trim()}
          >
            {downloading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                下载中...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                开始下载
              </>
            )}
          </Button>

          {/* 提示信息 */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p>下载的视频将按作者分组存储，并自动关联到用户列表</p>
              <p>如果作者不在用户列表中，将自动创建用户记录</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
