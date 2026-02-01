import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  User,
  Video,
  Calendar,
  FileText,
  Play,
  Square,
  Zap
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

const statusConfig = {
  pending: { label: '待执行', icon: Clock, color: '#7A7570', bg: '#F7F5F3' },
  running: { label: '执行中', icon: Loader2, color: '#FE2C55', bg: '#FEE2E8' },
  completed: { label: '已完成', icon: CheckCircle2, color: '#22C55E', bg: '#DCFCE7' },
  failed: { label: '失败', icon: XCircle, color: '#EF4444', bg: '#FEE2E2' }
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [task, setTask] = useState<DbTaskWithUsers | null>(null)
  const [loading, setLoading] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [activeUsers, setActiveUsers] = useState<Set<string>>(new Set())
  const lastRefreshRef = useRef<number>(0)

  const handleProgress = useCallback(
    (p: DownloadProgress) => {
      if (p.taskId === parseInt(id || '0')) {
        setProgress(p)
        setIsRunning(p.status === 'running')

        if (p.status === 'running' && p.currentUser) {
          setActiveUsers((prev) => {
            if (prev.has(p.currentUser!)) return prev
            const next = new Set(prev)
            next.add(p.currentUser!)
            return next
          })
        }

        if (p.message?.includes('完成') && p.currentUser) {
          setActiveUsers((prev) => {
            if (!prev.has(p.currentUser!)) return prev
            const next = new Set(prev)
            next.delete(p.currentUser!)
            return next
          })
        }

        if (p.status === 'completed') {
          toast.success(p.message)
          setActiveUsers(new Set())
          loadTask(parseInt(id || '0'))
        } else if (p.status === 'failed') {
          toast.error(p.message)
          setActiveUsers(new Set())
          loadTask(parseInt(id || '0'))
        } else if (p.status === 'running') {
          const now = Date.now()
          if (now - lastRefreshRef.current > 5000) {
            lastRefreshRef.current = now
            loadTask(parseInt(id || '0'))
          }
        }
      }
    },
    [id]
  )

  useEffect(() => {
    if (id) {
      loadTask(parseInt(id))
      window.api.download.isRunning(parseInt(id)).then(setIsRunning)
    }
  }, [id])

  useEffect(() => {
    const unsubscribe = window.api.download.onProgress(handleProgress)
    return () => unsubscribe()
  }, [handleProgress])

  const sortedUsers = useMemo(() => {
    if (!task) return []
    if (!isRunning || activeUsers.size === 0) return task.users
    return [...task.users].sort((a, b) => {
      const aIsActive = activeUsers.has(a.nickname)
      const bIsActive = activeUsers.has(b.nickname)
      if (aIsActive && !bIsActive) return -1
      if (!aIsActive && bIsActive) return 1
      return 0
    })
  }, [task?.users, isRunning, activeUsers])

  const loadTask = async (taskId: number) => {
    setLoading(true)
    try {
      const data = await window.api.task.getById(taskId)
      if (data) {
        setTask(data)
      } else {
        toast.error('任务不存在')
        navigate('/settings/download')
      }
    } catch {
      toast.error('加载任务失败')
      navigate('/settings/download')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatNumber = (num: number) => {
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + 'w'
    }
    return num.toString()
  }

  const handleStartDownload = async () => {
    if (!task) return
    try {
      setIsRunning(true)
      await window.api.download.start(task.id)
    } catch (error) {
      setIsRunning(false)
      toast.error((error as Error).message)
    }
  }

  const handleStopDownload = () => {
    if (!task) return
    window.api.download.stop(task.id)
    toast.info('正在停止下载...')
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#B8B2AD]" />
      </div>
    )
  }

  if (!task) {
    return null
  }

  const status = statusConfig[task.status]
  const StatusIcon = status.icon
  const totalVideos = task.users.reduce((sum, u) => sum + u.aweme_count, 0)
  const totalDownloaded = task.users.reduce((sum, u) => sum + (u.downloaded_count || 0), 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-16 flex items-center gap-4 px-6 border-b border-[#EAE6E1] bg-white">
        <button
          onClick={() => navigate('/settings/download')}
          className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-[#F7F5F3] transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-[#7A7570]" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-[#312E2A] truncate">{task.name}</h1>
          <p className="text-[13px] text-[#7A7570]">并发数: {task.concurrency}</p>
        </div>
        <div
          className="h-8 px-3 flex items-center gap-1.5 rounded-full text-sm font-medium"
          style={{ backgroundColor: status.bg, color: status.color }}
        >
          <StatusIcon className={`h-4 w-4 ${task.status === 'running' ? 'animate-spin' : ''}`} />
          {status.label}
        </div>
        {isRunning ? (
          <Button
            onClick={handleStopDownload}
            className="bg-[#FE2C55] hover:bg-[#FE2C55]/90 text-white"
          >
            <Square className="h-4 w-4 mr-2" />
            停止下载
          </Button>
        ) : (
          <Button
            onClick={handleStartDownload}
            className="bg-[#FE2C55] hover:bg-[#FE2C55]/90 text-white"
          >
            <Play className="h-4 w-4 mr-2" />
            开始下载
          </Button>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 space-y-5">
        {/* Stats Cards */}
        <div className="grid gap-4 grid-cols-4">
          <div className="bg-white rounded-xl border border-[#EAE6E1] p-5">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-[#F7F5F3] flex items-center justify-center">
                <User className="h-6 w-6 text-[#7A7570]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[#312E2A]">{task.users.length}</p>
                <p className="text-sm text-[#7A7570]">用户数</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-[#EAE6E1] p-5">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-[#F7F5F3] flex items-center justify-center">
                <Video className="h-6 w-6 text-[#7A7570]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[#312E2A]">{formatNumber(totalVideos)}</p>
                <p className="text-sm text-[#7A7570]">视频总数</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-[#EAE6E1] p-5">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-[#F7F5F3] flex items-center justify-center">
                <FileText className="h-6 w-6 text-[#7A7570]" />
              </div>
              <div>
                <p className="text-2xl font-bold text-[#312E2A]">
                  {totalDownloaded} / {totalVideos}
                </p>
                <p className="text-sm text-[#7A7570]">下载进度</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-[#EAE6E1] p-5">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-[#F7F5F3] flex items-center justify-center">
                <Calendar className="h-6 w-6 text-[#7A7570]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#312E2A]">{formatDate(task.created_at)}</p>
                <p className="text-sm text-[#7A7570]">创建时间</p>
              </div>
            </div>
          </div>
        </div>

        {/* Download Progress */}
        {progress && isRunning && (
          <div className="bg-white rounded-xl border border-[#EAE6E1] p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-[#FEE2E8] flex items-center justify-center">
                <Zap className="h-5 w-5 text-[#FE2C55] animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[#312E2A] truncate">{progress.message}</p>
                <p className="text-sm text-[#7A7570]">
                  用户 {progress.currentUserIndex}/{progress.totalUsers}
                  {progress.currentUser && ` · ${progress.currentUser}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-[#FE2C55]">{progress.downloadedPosts}</p>
                <p className="text-xs text-[#7A7570]">已下载</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[#7A7570]">下载进度</span>
                <span className="font-medium text-[#312E2A]">
                  {progress.currentVideo}/{progress.totalVideos}
                </span>
              </div>
              <div className="h-2 bg-[#EAE6E1] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#FE2C55] rounded-full transition-all"
                  style={{
                    width: `${progress.totalVideos > 0 ? (progress.currentVideo / progress.totalVideos) * 100 : 0}%`
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Users List */}
        <div className="bg-white rounded-xl border border-[#EAE6E1] overflow-hidden">
          {/* List Header */}
          <div className="h-14 flex items-center justify-between px-5 border-b border-[#EAE6E1]">
            <div className="flex items-center gap-3">
              <span className="text-base font-semibold text-[#312E2A]">包含用户</span>
              <span className="text-[13px] text-[#B8B2AD]">({task.users.length})</span>
            </div>
            <p className="text-[13px] text-[#7A7570]">此任务将下载以下用户的视频</p>
          </div>

          {/* Table Header */}
          <div className="h-11 flex items-center px-5 bg-[#F7F5F3] text-[13px] font-medium text-[#7A7570]">
            <div className="flex-1">用户</div>
            <div className="w-28 text-center">抖音号</div>
            <div className="w-24 text-center">粉丝</div>
            <div className="w-24 text-center">视频数</div>
            <div className="w-32 text-center">已下载</div>
          </div>

          {/* Table Body */}
          {sortedUsers.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-[#7A7570]">
              <div className="h-16 w-16 rounded-full bg-[#F7F5F3] flex items-center justify-center mb-4">
                <User className="h-8 w-8 text-[#B8B2AD]" />
              </div>
              <p className="text-base font-medium">暂无用户</p>
              <p className="text-sm mt-1 text-[#B8B2AD]">此任务中没有添加用户</p>
            </div>
          ) : (
            sortedUsers.map((user) => {
              const isActiveUser = isRunning && activeUsers.has(user.nickname)
              return (
                <div
                  key={user.id}
                  className={`h-[72px] flex items-center px-5 border-b border-[#EAE6E1] transition-colors ${
                    isActiveUser
                      ? 'bg-[#FEE2E8]/30 border-l-2 border-l-[#FE2C55]'
                      : 'hover:bg-[#F7F5F3]/50'
                  }`}
                >
                  <div className="flex-1 flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user.avatar} className="object-cover" />
                        <AvatarFallback className="bg-[#FEE2E8] text-[#FE2C55]">
                          {user.nickname?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      {isActiveUser && (
                        <div className="absolute -right-1 -bottom-1 h-4 w-4 rounded-full bg-[#FE2C55] flex items-center justify-center">
                          <Loader2 className="h-2.5 w-2.5 text-white animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-[#312E2A] truncate">{user.nickname}</p>
                        {isActiveUser && (
                          <Badge className="text-xs px-1.5 py-0 bg-[#FE2C55] text-white">
                            下载中
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-[#B8B2AD] truncate max-w-[180px]">
                        {user.signature || '暂无签名'}
                      </p>
                    </div>
                  </div>
                  <div className="w-28 text-center">
                    <span className="text-sm text-[#7A7570] font-mono">
                      @{user.unique_id || user.short_id || '-'}
                    </span>
                  </div>
                  <div className="w-24 text-center">
                    <Badge variant="outline" className="font-medium border-[#EAE6E1] text-[#7A7570]">
                      {formatNumber(user.follower_count)}
                    </Badge>
                  </div>
                  <div className="w-24 text-center">
                    <span className="font-medium text-[#312E2A]">{user.aweme_count}</span>
                  </div>
                  <div className="w-32 flex flex-col items-center gap-1">
                    <span className="text-sm font-medium text-[#312E2A]">
                      {user.downloaded_count} / {user.aweme_count}
                    </span>
                    <div className="w-20 h-1.5 bg-[#EAE6E1] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isActiveUser ? 'bg-[#FE2C55]' : 'bg-[#312E2A]'
                        }`}
                        style={{
                          width: `${user.aweme_count > 0 ? (user.downloaded_count / user.aweme_count) * 100 : 0}%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
