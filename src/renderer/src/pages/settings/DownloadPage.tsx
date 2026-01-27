import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  Plus,
  FileText,
  Pencil,
  Trash2,
  Download,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'

const PAGE_SIZE = 10

const statusConfig = {
  pending: { label: '待执行', icon: Clock, variant: 'secondary' as const },
  running: { label: '执行中', icon: Loader2, variant: 'default' as const },
  completed: { label: '已完成', icon: CheckCircle2, variant: 'outline' as const },
  failed: { label: '失败', icon: XCircle, variant: 'destructive' as const }
}

export default function DownloadPage() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<DbTaskWithUsers[]>([])
  const [users, setUsers] = useState<DbUser[]>([])
  const [open, setOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<DbTaskWithUsers | null>(null)
  const [taskName, setTaskName] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [concurrency, setConcurrency] = useState('3')
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    loadTasks()
    loadUsers()
  }, [])

  const loadTasks = async () => {
    const data = await window.api.task.getAll()
    setTasks(data)
  }

  const loadUsers = async () => {
    const data = await window.api.user.getAll()
    setUsers(data)
  }

  // 搜索过滤
  const filteredTasks = useMemo(() => {
    if (!searchTerm.trim()) return tasks
    const term = searchTerm.toLowerCase()
    return tasks.filter((t) => t.name.toLowerCase().includes(term))
  }, [tasks, searchTerm])

  // 分页
  const totalPages = Math.ceil(filteredTasks.length / PAGE_SIZE)
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredTasks.slice(start, start + PAGE_SIZE)
  }, [filteredTasks, currentPage])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  const generateTaskName = (userIds: number[]) => {
    if (userIds.length === 0) return ''
    const selectedUsers = users.filter((u) => userIds.includes(u.id))
    const date = new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
    if (selectedUsers.length === 1) {
      return `${selectedUsers[0].nickname} - ${date}`
    }
    return `${selectedUsers[0].nickname} 等${selectedUsers.length}人 - ${date}`
  }

  const handleOpenAdd = () => {
    setEditingTask(null)
    setTaskName('')
    setSelectedUserIds([])
    setConcurrency('3')
    setOpen(true)
  }

  const handleOpenEdit = (task: DbTaskWithUsers) => {
    setEditingTask(task)
    setTaskName(task.name)
    setSelectedUserIds(task.users.map((u) => u.id))
    setConcurrency(String(task.concurrency))
    setOpen(true)
  }

  const handleUserToggle = (userId: number) => {
    setSelectedUserIds((prev) => {
      const next = prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
      if (!editingTask) {
        setTaskName(generateTaskName(next))
      }
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedUserIds.length === users.length) {
      setSelectedUserIds([])
      if (!editingTask) setTaskName('')
    } else {
      const allIds = users.map((u) => u.id)
      setSelectedUserIds(allIds)
      if (!editingTask) setTaskName(generateTaskName(allIds))
    }
  }

  const handleSave = async () => {
    if (!taskName.trim()) {
      toast.error('请输入任务名称')
      return
    }
    if (selectedUserIds.length === 0) {
      toast.error('请选择至少一个用户')
      return
    }

    setLoading(true)
    const concurrencyNum = parseInt(concurrency) || 3
    try {
      if (editingTask) {
        await window.api.task.update(editingTask.id, { name: taskName.trim(), concurrency: concurrencyNum })
        await window.api.task.updateUsers(editingTask.id, selectedUserIds)
        toast.success('任务已更新')
      } else {
        await window.api.task.create({ name: taskName.trim(), user_ids: selectedUserIds, concurrency: concurrencyNum })
        toast.success('任务已创建')
      }
      setOpen(false)
      loadTasks()
    } catch {
      toast.error(editingTask ? '更新失败' : '创建失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await window.api.task.delete(id)
      toast.success('任务已删除')
      loadTasks()
    } catch {
      toast.error('删除失败')
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">视频下载</h2>
          <p className="text-sm text-muted-foreground mt-1.5">创建下载任务，批量下载用户视频</p>
        </div>
        <Button onClick={handleOpenAdd}>
          <Plus className="h-4 w-4 mr-2" />
          添加任务
        </Button>
      </div>

      {/* Task List */}
      <Card className="overflow-hidden">
        <CardHeader className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">任务列表</CardTitle>
              <CardDescription className="mt-1">
                共 <span className="font-medium text-foreground">{tasks.length}</span> 个任务
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="搜索任务名称..."
                  className="pl-9 w-64"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px] font-semibold">任务名称</TableHead>
                <TableHead className="font-semibold">用户</TableHead>
                <TableHead className="text-center font-semibold">状态</TableHead>
                <TableHead className="text-center font-semibold">创建时间</TableHead>
                <TableHead className="text-right w-[140px] font-semibold">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedTasks.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="h-48 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                        <Download className="h-8 w-8 opacity-40" />
                      </div>
                      <p className="text-base font-medium">
                        {searchTerm ? '未找到匹配的任务' : '暂无任务'}
                      </p>
                      <p className="text-sm mt-1 opacity-70">
                        {searchTerm ? '尝试其他搜索关键词' : '点击上方"添加任务"按钮开始'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                paginatedTasks.map((task) => {
                  const status = statusConfig[task.status]
                  const StatusIcon = status.icon
                  return (
                    <TableRow key={task.id} className="group transition-colors">
                      <TableCell className="py-3">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <span className="font-medium">{task.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <div className="flex -space-x-2">
                            {task.users.slice(0, 3).map((user) => (
                              <Avatar key={user.id} className="h-7 w-7 border-2 border-background">
                                <AvatarImage src={user.avatar} />
                                <AvatarFallback className="text-xs">
                                  {user.nickname?.charAt(0) || 'U'}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                          </div>
                          {task.users.length > 3 && (
                            <span className="text-xs text-muted-foreground ml-1">
                              +{task.users.length - 3}
                            </span>
                          )}
                          <span className="text-sm text-muted-foreground ml-2">
                            {task.users.length} 人
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={status.variant} className="gap-1">
                          <StatusIcon
                            className={`h-3 w-3 ${task.status === 'running' ? 'animate-spin' : ''}`}
                          />
                          {status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {formatDate(task.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => navigate(`/settings/download/${task.id}`)}
                            title="查看详情"
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => handleOpenEdit(task)}
                            title="编辑任务"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(task.id)}
                            title="删除任务"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                第 {currentPage} / {totalPages} 页，共 {filteredTasks.length} 条
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  下一页
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Task Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {editingTask ? '编辑任务' : '添加下载任务'}
            </DialogTitle>
            <DialogDescription>
              {editingTask ? '修改任务名称和下载用户' : '选择要下载视频的用户，系统将自动生成任务名称'}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">任务名称</label>
                <Input
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="输入任务名称..."
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">并发数</label>
                <Input
                  type="number"
                  min="1"
                  max="10"
                  value={concurrency}
                  onChange={(e) => setConcurrency(e.target.value)}
                  placeholder="3"
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground">同时下载的用户数</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">选择用户</label>
                <Button variant="ghost" size="sm" onClick={handleSelectAll} disabled={loading}>
                  {selectedUserIds.length === users.length ? '取消全选' : '全选'}
                </Button>
              </div>
              <ScrollArea className="h-64 rounded-md border">
                <div className="p-3 space-y-2">
                  {users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <p className="text-sm">暂无用户</p>
                      <p className="text-xs mt-1">请先在用户管理中添加用户</p>
                    </div>
                  ) : (
                    users.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => handleUserToggle(user.id)}
                      >
                        <Checkbox
                          checked={selectedUserIds.includes(user.id)}
                          onCheckedChange={() => handleUserToggle(user.id)}
                          disabled={loading}
                        />
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback>{user.nickname?.charAt(0) || 'U'}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{user.nickname}</p>
                          <p className="text-xs text-muted-foreground">
                            {user.aweme_count} 个视频
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
              <p className="text-xs text-muted-foreground">
                已选择 {selectedUserIds.length} 个用户
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="flex-1 sm:flex-none"
            >
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading || !taskName.trim() || selectedUserIds.length === 0}
              className="flex-1 sm:flex-none"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  {editingTask ? '保存' : '创建'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
