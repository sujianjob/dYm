import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import {
  HardDrive,
  Trash2,
  Loader2,
  Video,
  Images,
  Play,
  FolderOpen,
  ChevronDown,
  Search,
  X,
  Upload,
  Check
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { MediaViewer } from '@/components/MediaViewer'
import { SortSelect, getInitialSort } from '@/components/SortSelect'
import { PlaylistSelector } from '@/components/PlaylistSelector'

const IMAGE_AWEME_TYPE = 68
const PAGE_SIZE = 50
const SORT_STORAGE_KEY = 'files-page-sort'

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return (bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0) + ' ' + units[i]
}

// 格式化视频时长
function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return ''
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

interface UserWithSize extends DbUser {
  fileSize: number
  folderCount: number
}

export default function FilesPage() {
  const [users, setUsers] = useState<UserWithSize[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<UserWithSize | null>(null)
  const [posts, setPosts] = useState<DbPost[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [postTotal, setPostTotal] = useState(0)
  const [coverPaths, setCoverPaths] = useState<Record<string, string>>({})
  const [selectedPost, setSelectedPost] = useState<DbPost | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: 'post' | 'batch' | 'user'
    id?: number
    count?: number
  } | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [sort, setSort] = useState<SortConfig>(() => getInitialSort(SORT_STORAGE_KEY))
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // YouTube 上传状态
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<YouTubeUploadProgress | null>(null)
  const [youtubeFilter, setYoutubeFilter] = useState<'all' | 'uploaded' | 'not-uploaded'>('all')
  const [selectedPlaylist, setSelectedPlaylist] = useState('')
  const [isShortsBatch, setIsShortsBatch] = useState(false)
  const [showPlaylistDialog, setShowPlaylistDialog] = useState(false)
  const [validPostIds, setValidPostIds] = useState<number[]>([])
  const [isFixing, setIsFixing] = useState(false)

  const totalSize = users.reduce((sum, u) => sum + u.fileSize, 0)
  const totalFiles = users.reduce((sum, u) => sum + u.folderCount, 0)

  useEffect(() => {
    loadUsers()
  }, [])

  useEffect(() => {
    if (selectedUser) {
      setPosts([])
      setPage(1)
      setHasMore(true)
      setCoverPaths({})
      setSelectedIds(new Set())
      loadPosts(selectedUser, 1, true)
    }
  }, [selectedUser, sort])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !postsLoading && !loadingMore) {
          loadMorePosts()
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, postsLoading, loadingMore, page, selectedUser])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowUserDropdown(false)
      }
    }
    if (showUserDropdown) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserDropdown])

  // YouTube 进度订阅
  useEffect(() => {
    const unsubscribe = window.api.youtube.onProgress((progress) => {
      setUploadProgress(progress)
      if (progress.status === 'completed' || progress.status === 'failed' || progress.status === 'cancelled') {
        setIsUploading(false)
        setTimeout(() => setUploadProgress(null), 3000)
        // 刷新列表
        if (progress.status === 'completed') {
          reloadCurrentUser()
        }
      }
    })
    return unsubscribe
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const allUsers = (await window.api.user.getAll()) ?? []
      const withSize: UserWithSize[] = await Promise.all(
        allUsers.map(async (u) => {
          const sizes = await window.api.files.getFileSizes(u.sec_uid)
          return { ...u, fileSize: sizes?.totalSize ?? 0, folderCount: sizes?.folderCount ?? 0 }
        })
      )
      const sorted = withSize
        .filter((u) => u.folderCount > 0)
        .sort((a, b) => b.fileSize - a.fileSize)
      setUsers(sorted)
      if (!selectedUser && sorted.length > 0) {
        setSelectedUser(sorted[0])
      }
    } catch {
      toast.error('加载失败')
    } finally {
      setLoading(false)
    }
  }

  const loadPosts = async (user: UserWithSize, pageNum: number, reset = false) => {
    if (reset) setPostsLoading(true)
    else setLoadingMore(true)
    try {
      const result = await window.api.files.getUserPosts(user.id, pageNum, PAGE_SIZE, sort)
      const newPosts = result?.posts ?? []
      if (reset) {
        setPosts(newPosts)
      } else {
        setPosts((prev) => [...prev, ...newPosts])
      }
      setPostTotal(result?.total ?? 0)
      setHasMore(newPosts.length === PAGE_SIZE)
      loadCoverPaths(result.posts)
    } catch {
      toast.error('加载作品失败')
    } finally {
      setPostsLoading(false)
      setLoadingMore(false)
    }
  }

  const loadMorePosts = useCallback(() => {
    if (!selectedUser) return
    const nextPage = page + 1
    setPage(nextPage)
    loadPosts(selectedUser, nextPage, false)
  }, [page, selectedUser])

  const loadCoverPaths = async (postList: DbPost[]) => {
    const paths: Record<string, string> = {}
    for (const post of postList) {
      if (post.folder_name) {
        const coverPath = await window.api.post.getCoverPath(post.sec_uid, post.folder_name)
        if (coverPath) paths[post.aweme_id] = coverPath
      }
    }
    setCoverPaths(paths)
  }

  const reloadCurrentUser = async () => {
    if (!selectedUser) return
    setPosts([])
    setPage(1)
    setHasMore(true)
    setCoverPaths({})
    await loadPosts(selectedUser, 1, true)
    await loadUsers()
  }

  const handleDeletePost = async (postId: number) => {
    setDeleteLoading(true)
    try {
      await window.api.files.deletePost(postId)
      toast.success('文件已删除')
      setDeleteConfirm(null)
      await reloadCurrentUser()
    } catch {
      toast.error('删除失败')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleDeleteBatch = async () => {
    setDeleteLoading(true)
    try {
      let deleted = 0
      for (const id of selectedIds) {
        const ok = await window.api.files.deletePost(id)
        if (ok) deleted++
      }
      toast.success(`已删除 ${deleted} 个文件`)
      setDeleteConfirm(null)
      setSelectedIds(new Set())
      await reloadCurrentUser()
    } catch {
      toast.error('批量删除失败')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleDeleteUserFiles = async () => {
    if (!selectedUser) return
    setDeleteLoading(true)
    try {
      await window.api.files.deleteUserFiles(selectedUser.id, selectedUser.sec_uid)
      toast.success('用户文件已清空')
      setDeleteConfirm(null)
      setPosts([])
      setSelectedIds(new Set())
      await loadUsers()
      setSelectedUser(null)
    } catch {
      toast.error('删除失败')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleFixAllTitles = async () => {
    if (
      !confirm(
        '确定要修复所有视频标题吗？\n\n这将从 _desc.txt 文件读取原始标题并更新数据库。'
      )
    ) {
      return
    }

    setIsFixing(true)
    try {
      const result = await window.api.files.fixAllTitles()
      if (result.success && result.result) {
        toast.success(
          `修复完成！\n\n` +
            `✓ 成功: ${result.result.fixed} 个\n` +
            `⊘ 跳过: ${result.result.skipped} 个\n` +
            `✗ 失败: ${result.result.failed} 个`
        )
        // 刷新当前用户列表
        if (selectedUser) {
          await loadPosts(selectedUser, 1, true)
        }
      } else {
        toast.error(`修复失败: ${result.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('[FilesPage] fixAllTitles error:', error)
      toast.error(`修复失败: ${error}`)
    } finally {
      setIsFixing(false)
    }
  }

  const handleBatchUpload = async () => {
    if (selectedIds.size === 0) {
      toast.error('请先选择要上传的视频')
      return
    }
    const authenticated = await window.api.youtube.isAuthenticated()
    if (!authenticated) {
      toast.error('请先在设置页面连接 YouTube 账号')
      return
    }
    // 过滤掉图集和已上传的视频
    const validIds: number[] = []
    for (const id of selectedIds) {
      const post = posts.find((p) => p.id === id)
      if (post && post.aweme_type !== IMAGE_AWEME_TYPE && post.youtube_uploaded !== 1) {
        validIds.push(id)
      }
    }
    if (validIds.length === 0) {
      toast.error('所选作品中没有可上传的视频')
      return
    }
    // 显示播放列表选择对话框
    setValidPostIds(validIds)
    setShowPlaylistDialog(true)
  }

  const confirmBatchUpload = async () => {
    setShowPlaylistDialog(false)
    setIsUploading(true)
    setUploadProgress(null)
    try {
      await window.api.youtube.uploadBatch(
        validPostIds,
        selectedPlaylist || undefined,
        isShortsBatch // 传递 Shorts 选择
      )
    } catch (error) {
      toast.error(`批量上传启动失败: ${(error as Error).message}`)
      setIsUploading(false)
    }
  }

  const handleCancelUpload = async () => {
    try {
      await window.api.youtube.cancelUpload()
      toast.info('正在取消上传...')
    } catch (error) {
      toast.error(`取消失败: ${(error as Error).message}`)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return
    if (deleteConfirm.type === 'post' && deleteConfirm.id) {
      await handleDeletePost(deleteConfirm.id)
    } else if (deleteConfirm.type === 'batch') {
      await handleDeleteBatch()
    } else if (deleteConfirm.type === 'user') {
      await handleDeleteUserFiles()
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === filteredPosts.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(filteredPosts.map((p) => p.id)))
  }

  const getCoverUrl = (post: DbPost) => {
    const path = coverPaths[post.aweme_id]
    return path ? `local://${path}` : null
  }

  const isImagePost = (post: DbPost) => post.aweme_type === IMAGE_AWEME_TYPE

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const cleaned = dateStr.replace(/[-:T]/g, '').substring(0, 8)
    if (cleaned.length === 8) {
      return `${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`
    }
    return dateStr
  }

  const filteredUsers = (() => {
    if (!userSearch.trim()) return users
    const s = userSearch.toLowerCase()
    return users.filter((u) => u.nickname.toLowerCase().includes(s))
  })()

  const filteredPosts = (() => {
    if (youtubeFilter === 'all') return posts
    if (youtubeFilter === 'uploaded') return posts.filter((p) => p.youtube_uploaded === 1)
    return posts.filter((p) => p.youtube_uploaded !== 1)
  })()

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-[#E5E5E7] bg-white">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-[#1D1D1F]">文件管理</h1>
          <span className="text-sm text-[#A1A1A6]">
            {totalFiles} 个文件 / {formatSize(totalSize)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={isUploading ? handleCancelUpload : handleBatchUpload}
                disabled={isUploading && !uploadProgress}
                className={
                  isUploading
                    ? 'border-red-200 text-red-600 hover:bg-red-50'
                    : 'border-[#0A84FF] text-[#0A84FF] hover:bg-blue-50'
                }
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    取消上传
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    批量上传到 YouTube ({selectedIds.size})
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteConfirm({ type: 'batch', count: selectedIds.size })}
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                删除选中 ({selectedIds.size})
              </Button>
            </>
          )}
          {selectedUser && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirm({ type: 'user' })}
              className="border-red-200 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              清空用户文件
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleFixAllTitles}
            disabled={isFixing}
            className="border-[#0A84FF] text-[#0A84FF] hover:bg-blue-50"
          >
            {isFixing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                修复中...
              </>
            ) : (
              <>
                🔧 修复所有标题
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="px-6 py-3 bg-[#F5F5F7] border-b border-[#E5E5E7]">
        <div className="flex items-center gap-3 flex-wrap">
          {/* User Selector */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="h-9 px-3 flex items-center gap-2 rounded-lg border border-[#E5E5E7] bg-white text-sm text-[#1D1D1F] hover:bg-[#F2F2F4] transition-colors"
            >
              <HardDrive className="h-4 w-4 text-[#6E6E73]" />
              <span>{selectedUser?.nickname || '选择用户'}</span>
              {selectedUser && (
                <span className="text-xs text-[#A1A1A6]">
                  ({formatSize(selectedUser.fileSize)})
                </span>
              )}
              <ChevronDown
                className={`h-4 w-4 text-[#6E6E73] transition-transform ${showUserDropdown ? 'rotate-180' : ''}`}
              />
            </button>
            {selectedUser && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedUser(null)
                  setPosts([])
                }}
                className="absolute -right-2 -top-2 h-5 w-5 flex items-center justify-center rounded-full bg-[#0A84FF] text-white"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            {showUserDropdown && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-[#E5E5E7] rounded-lg shadow-md z-50 overflow-hidden">
                <div className="p-2 border-b border-[#E5E5E7]">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#A1A1A6]" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      defaultValue=""
                      onInput={(e) => setUserSearch((e.target as HTMLInputElement).value)}
                      placeholder="搜索用户..."
                      className="w-full h-8 pl-7 pr-2 rounded-md bg-[#F2F2F4] text-sm text-[#1D1D1F] placeholder:text-[#A1A1A6] focus:outline-none focus:ring-1 focus:ring-[#0A84FF]"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        setSelectedUser(u)
                        setShowUserDropdown(false)
                        setUserSearch('')
                        if (searchInputRef.current) searchInputRef.current.value = ''
                      }}
                      className={`w-full h-11 px-3 flex items-center justify-between text-sm hover:bg-[#F2F2F4] transition-colors ${selectedUser?.id === u.id ? 'bg-[#E8F0FE] text-[#0A84FF]' : 'text-[#1D1D1F]'}`}
                    >
                      <span className="truncate">{u.nickname}</span>
                      <span className="text-xs text-[#A1A1A6] flex-shrink-0 ml-2">
                        {u.folderCount} 个 / {formatSize(u.fileSize)}
                      </span>
                    </button>
                  ))}
                  {filteredUsers.length === 0 && (
                    <div className="py-4 text-center text-sm text-[#A1A1A6]">无匹配用户</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {posts.length > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedIds.size === filteredPosts.length && filteredPosts.length > 0}
                  onCheckedChange={selectAll}
                />
                <span className="text-sm text-[#6E6E73]">全选 ({filteredPosts.length})</span>
              </div>
              {/* YouTube 过滤器 */}
              <div className="flex items-center gap-1 border-l border-[#D1D1D6] pl-3">
                <button
                  onClick={() => setYoutubeFilter('all')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${youtubeFilter === 'all' ? 'bg-[#0A84FF] text-white' : 'text-[#6E6E73] hover:bg-[#E5E5E7]'}`}
                >
                  全部
                </button>
                <button
                  onClick={() => setYoutubeFilter('uploaded')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${youtubeFilter === 'uploaded' ? 'bg-[#34C759] text-white' : 'text-[#6E6E73] hover:bg-[#E5E5E7]'}`}
                >
                  已上传
                </button>
                <button
                  onClick={() => setYoutubeFilter('not-uploaded')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${youtubeFilter === 'not-uploaded' ? 'bg-[#8E8E93] text-white' : 'text-[#6E6E73] hover:bg-[#E5E5E7]'}`}
                >
                  未上传
                </button>
              </div>
              <SortSelect value={sort} onChange={setSort} storageKey={SORT_STORAGE_KEY} />
            </div>
          )}
        </div>

        {/* YouTube 上传进度条 */}
        {uploadProgress && uploadProgress.status !== 'completed' && (
          <div className="mt-3 p-3 bg-white rounded-lg border border-[#E5E5E7]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[#1D1D1F]">
                {uploadProgress.status === 'preparing' && '准备上传...'}
                {uploadProgress.status === 'uploading' && `上传中: ${uploadProgress.currentPost}`}
                {uploadProgress.status === 'processing' && '处理中...'}
                {uploadProgress.status === 'failed' && '上传失败'}
                {uploadProgress.status === 'cancelled' && '已取消'}
              </span>
              <span className="text-xs text-[#6E6E73]">
                {uploadProgress.uploadedCount}/{uploadProgress.totalPosts}
                {uploadProgress.failedCount > 0 && ` (失败: ${uploadProgress.failedCount})`}
              </span>
            </div>
            <div className="h-2 bg-[#F2F2F4] rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${uploadProgress.status === 'failed' ? 'bg-red-500' : uploadProgress.status === 'cancelled' ? 'bg-[#8E8E93]' : 'bg-[#0A84FF]'}`}
                style={{ width: `${uploadProgress.progress}%` }}
              />
            </div>
            {uploadProgress.message && (
              <p className="text-xs text-[#6E6E73] mt-1">{uploadProgress.message}</p>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 pb-8">
        <div className="mx-auto max-w-6xl">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0A84FF]" />
            </div>
          ) : !selectedUser ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="rounded-full bg-[#F2F2F4] p-6 mb-4">
                <HardDrive className="h-12 w-12 text-[#A1A1A6]" />
              </div>
              <h2 className="text-xl font-semibold text-[#1D1D1F] mb-2">
                {users.length === 0 ? '暂无已下载文件' : '选择一个用户'}
              </h2>
              <p className="text-[#6E6E73]">
                {users.length === 0
                  ? '下载视频后，可在这里管理文件'
                  : '从上方下拉选择用户，查看和管理已下载的文件'}
              </p>
            </div>
          ) : postsLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0A84FF]" />
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="rounded-full bg-[#F2F2F4] p-6 mb-4">
                <Video className="h-12 w-12 text-[#A1A1A6]" />
              </div>
              <h2 className="text-xl font-semibold text-[#1D1D1F] mb-2">暂无文件</h2>
              <p className="text-[#6E6E73]">该用户没有已下载的文件记录</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 pt-4">
                {filteredPosts.map((post) => (
                  <ContextMenu key={post.id}>
                    <ContextMenuTrigger asChild>
                      <Card
                        className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow group border-[#E5E5E7] bg-white relative"
                        onClick={() => {
                          setSelectedPost(post)
                          setViewerOpen(true)
                        }}
                      >
                        {/* Select checkbox */}
                        <div
                          className="absolute top-2 right-2 z-10"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleSelect(post.id)
                          }}
                        >
                          <div
                            className={`h-6 w-6 rounded-md border-2 flex items-center justify-center transition-colors ${selectedIds.has(post.id) ? 'bg-[#0A84FF] border-[#0A84FF]' : 'bg-white/80 border-white/60 group-hover:border-white'}`}
                          >
                            {selectedIds.has(post.id) && (
                              <svg
                                className="h-4 w-4 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={3}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                        </div>

                        <div className="aspect-[9/16] bg-[#F2F2F4] relative">
                          {getCoverUrl(post) ? (
                            <img
                              src={getCoverUrl(post)!}
                              alt={post.desc}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              {isImagePost(post) ? (
                                <Images className="h-12 w-12 text-[#A1A1A6]" />
                              ) : (
                                <Video className="h-12 w-12 text-[#A1A1A6]" />
                              )}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                            {isImagePost(post) ? (
                              <Images className="h-12 w-12 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            ) : (
                              <Play className="h-12 w-12 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </div>
                          <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                            {isImagePost(post) ? '图集' : '视频'}
                          </div>
                          {/* YouTube 上传状态 */}
                          {post.youtube_uploaded === 1 && !isImagePost(post) && (
                            <div className="absolute top-2 left-14 bg-[#34C759] text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                              <Check className="h-3 w-3" />
                              YouTube
                            </div>
                          )}
                          {/* Duration badge - 左下角，增强可见性 */}
                          {post.video_duration && post.aweme_type !== IMAGE_AWEME_TYPE && (
                            <div className="absolute bottom-2 left-2 bg-black/80 text-white text-xs px-2 py-0.5 rounded font-mono z-10 shadow-sm">
                              {formatDuration(post.video_duration)}
                            </div>
                          )}
                          {post.create_time && (
                            <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                              {formatDate(post.create_time)}
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="text-sm font-medium text-[#1D1D1F] line-clamp-2">
                            {post.desc || post.caption || '无标题'}
                          </p>
                          <p className="text-xs text-[#6E6E73] mt-1">@{post.nickname}</p>
                        </div>
                      </Card>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem
                        onClick={() => window.api.post.openFolder(post.sec_uid, post.folder_name)}
                      >
                        <FolderOpen className="h-4 w-4 mr-2" />
                        在文件管理器中打开
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={() => setDeleteConfirm({ type: 'post', id: post.id })}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        删除文件
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                ))}
              </div>

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="h-10 flex items-center justify-center mt-4">
                {loadingMore && (
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#0A84FF]" />
                )}
                {!hasMore && posts.length > 0 && (
                  <span className="text-sm text-[#A1A1A6]">已加载全部 {postTotal} 个作品</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <MediaViewer
        post={selectedPost}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        allPosts={posts}
        onSelectPost={setSelectedPost}
      />

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              {deleteConfirm?.type === 'post' && '确定要删除该作品的文件吗？'}
              {deleteConfirm?.type === 'batch' &&
                `确定要删除选中的 ${deleteConfirm.count} 个文件吗？`}
              {deleteConfirm?.type === 'user' &&
                `确定要删除 ${selectedUser?.nickname} 的所有文件吗？`}
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-red-500 px-1">此操作不可撤销，文件将被永久删除</p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
              disabled={deleteLoading}
            >
              取消
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleteLoading}>
              {deleteLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Playlist Selection Dialog */}
      <Dialog open={showPlaylistDialog} onOpenChange={setShowPlaylistDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>批量上传到 YouTube</DialogTitle>
            <DialogDescription>
              将选中的 {validPostIds.length} 个视频上传到 YouTube
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* 视频类型选择 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">视频类型</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="batchVideoType"
                    checked={!isShortsBatch}
                    onChange={() => setIsShortsBatch(false)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">普通视频</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="batchVideoType"
                    checked={isShortsBatch}
                    onChange={() => setIsShortsBatch(true)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">YouTube Shorts</span>
                </label>
              </div>
            </div>

            {/* 播放列表选择 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">播放列表（可选）</label>
              <PlaylistSelector
                value={selectedPlaylist}
                onChange={setSelectedPlaylist}
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPlaylistDialog(false)}
            >
              取消
            </Button>
            <Button onClick={confirmBatchUpload} className="bg-[#0A84FF] hover:bg-[#0060D5]">
              <Upload className="h-4 w-4 mr-2" />
              开始上传
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
