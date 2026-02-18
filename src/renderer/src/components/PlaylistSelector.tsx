import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Loader2 } from 'lucide-react'

interface YouTubePlaylistInfo {
  id: string
  title: string
  description: string
  itemCount: number
}

interface PlaylistSelectorProps {
  value?: string
  onChange: (playlistId: string) => void
  className?: string
}

const NONE_VALUE = '__none__' // 特殊值表示"不添加到播放列表"

export function PlaylistSelector({ value, onChange, className }: PlaylistSelectorProps) {
  const [playlists, setPlaylists] = useState<YouTubePlaylistInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadPlaylists()
  }, [])

  const handleChange = (newValue: string) => {
    // 如果选择了"不添加到播放列表"，传递空字符串给父组件
    onChange(newValue === NONE_VALUE ? '' : newValue)
  }

  const loadPlaylists = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await window.api.youtube.listPlaylists()
      if (data) {
        setPlaylists(data)
      } else {
        setError('获取播放列表失败')
      }
    } catch (err) {
      console.error('[PlaylistSelector] Failed to load playlists:', err)
      setError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">正在加载播放列表...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div className={className}>
      <Select value={value || NONE_VALUE} onValueChange={handleChange}>
        <SelectTrigger>
          <SelectValue placeholder="选择播放列表(可选)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>不添加到播放列表</SelectItem>
          {playlists.map((playlist) => (
            <SelectItem key={playlist.id} value={playlist.id}>
              {playlist.title} ({playlist.itemCount} 个视频)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground mt-1.5">
        {playlists.length === 0 ? '您还没有创建任何播放列表' : `共 ${playlists.length} 个播放列表`}
      </p>
    </div>
  )
}
