import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'

// 排序字段选项
const SORT_OPTIONS: { value: SortConfig['field']; label: string }[] = [
  { value: 'create_time', label: '创建时间' },
  { value: 'downloaded_at', label: '下载时间' },
  { value: 'analyzed_at', label: '分析时间' },
  { value: 'analysis_content_level', label: '内容评级' }
]

// 默认排序配置
const DEFAULT_SORT: SortConfig = { field: 'create_time', order: 'DESC' }

interface SortSelectProps {
  value?: SortConfig
  onChange: (sort: SortConfig) => void
  storageKey?: string // localStorage 键名，用于持久化
}

export function SortSelect({ value, onChange, storageKey }: SortSelectProps) {
  const [sort, setSort] = useState<SortConfig>(() => {
    // 初始化时从 localStorage 读取
    if (storageKey) {
      try {
        const saved = localStorage.getItem(storageKey)
        if (saved) {
          return JSON.parse(saved) as SortConfig
        }
      } catch {
        // 忽略解析错误
      }
    }
    return value || DEFAULT_SORT
  })

  // 同步外部 value 变化
  useEffect(() => {
    if (value && (value.field !== sort.field || value.order !== sort.order)) {
      setSort(value)
    }
  }, [value])

  // 持久化到 localStorage
  useEffect(() => {
    if (storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(sort))
    }
  }, [sort, storageKey])

  const handleFieldChange = (field: string) => {
    const newSort: SortConfig = { ...sort, field: field as SortConfig['field'] }
    setSort(newSort)
    onChange(newSort)
  }

  const toggleOrder = () => {
    const newSort: SortConfig = {
      ...sort,
      order: sort.order === 'ASC' ? 'DESC' : 'ASC'
    }
    setSort(newSort)
    onChange(newSort)
  }

  const currentLabel = SORT_OPTIONS.find((opt) => opt.value === sort.field)?.label || '排序'

  return (
    <div className="flex items-center gap-1">
      <Select value={sort.field} onValueChange={handleFieldChange}>
        <SelectTrigger className="w-[130px] h-8">
          <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 opacity-50" />
          <SelectValue placeholder="排序方式">{currentLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={toggleOrder}
        title={sort.order === 'ASC' ? '升序（点击切换为降序）' : '降序（点击切换为升序）'}
      >
        {sort.order === 'ASC' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
      </Button>
    </div>
  )
}

// 导出默认排序配置和初始化函数
export { DEFAULT_SORT }

export function getInitialSort(storageKey: string): SortConfig {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      return JSON.parse(saved) as SortConfig
    }
  } catch {
    // 忽略解析错误
  }
  return DEFAULT_SORT
}
