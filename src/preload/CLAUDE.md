# Preload 桥接层模块

[根目录](../../CLAUDE.md) > **src/preload**

---

## 模块职责

Preload 脚本作为 Electron 主进程和渲染进程的桥梁，负责：
- **安全的 API 暴露**：通过 `contextBridge.exposeInMainWorld` 将主进程功能暴露给渲染进程
- **类型定义与约束**：提供完整的 TypeScript 类型定义，确保调用安全
- **IPC 调用封装**：将 `ipcRenderer.invoke` 封装为类型安全的异步函数
- **事件订阅管理**：提供取消订阅机制，避免内存泄漏

---

## 入口与启动

### 主入口：`src/preload/index.ts`
```typescript
const api = {
  db: dbAPI,
  settings: settingsAPI,
  cookie: cookieAPI,
  douyin: douyinAPI,
  user: userAPI,
  task: taskAPI,
  download: downloadAPI,
  sync: syncAPI,
  scheduler: schedulerAPI,
  post: postAPI,
  grok: grokAPI,
  analysis: analysisAPI,
  video: videoAPI,
  system: systemAPI,
  updater: updaterAPI,
  migration: migrationAPI,
  clipboard: clipboardAPI,
  files: filesAPI,
  dashboard: dashboardAPI
}

contextBridge.exposeInMainWorld('api', api)
```

**暴露的 API**：
- `window.api.*` - 主要业务 API
- `window.electron` - Electron 工具 API（来自 `@electron-toolkit/preload`）

---

## 对外接口（API 分类）

### API 模块结构

#### 1. 数据库 API (`db`)
```typescript
{
  execute: (sql: string, params?: unknown[]) => Promise<unknown>
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>
  queryOne: <T>(sql: string, params?: unknown[]) => Promise<T | undefined>
}
```

#### 2. 设置 API (`settings`)
```typescript
{
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
  getAll: () => Promise<Record<string, string>>
  getDefaultDownloadPath: () => Promise<string>
}
```

#### 3. 用户 API (`user`)
```typescript
{
  getAll: () => Promise<DbUser[]>
  add: (url: string) => Promise<DbUser>
  delete: (id: number, deleteFiles?: boolean) => Promise<void>
  refresh: (id: number, url: string) => Promise<DbUser>
  batchRefresh: (users: { id: number; homepage_url: string; nickname: string }[])
    => Promise<{ success: number; failed: number; details: string[] }>
  setShowInHome: (id: number, show: boolean) => Promise<void>
  updateSettings: (id: number, input: UpdateUserSettingsInput) => Promise<DbUser | undefined>
  batchUpdateSettings: (ids: number[], input: Omit<UpdateUserSettingsInput, 'remark'>) => Promise<void>
}
```

#### 4. 同步 API (`sync`)
```typescript
{
  start: (userId: number) => Promise<void>
  stop: (userId: number) => Promise<void>
  isRunning: (userId: number) => Promise<boolean>
  getAnySyncing: () => Promise<number | null>
  getAllSyncing: () => Promise<number[]>
  validateCron: (expression: string) => Promise<boolean>
  updateUserSchedule: (userId: number) => Promise<void>
  onProgress: (callback: (progress: SyncProgress) => void) => (() => void)
}
```

#### 5. 分析 API (`analysis`)
```typescript
{
  start: (secUid?: string) => Promise<void>
  stop: () => Promise<void>
  isRunning: () => Promise<boolean>
  getUnanalyzedCount: (secUid?: string) => Promise<number>
  getUnanalyzedCountByUser: () => Promise<{ sec_uid: string; nickname: string; count: number }[]>
  getUserStats: () => Promise<UserAnalysisStats[]>
  getTotalStats: () => Promise<TotalAnalysisStats>
  onProgress: (callback: (progress: AnalysisProgress) => void) => (() => void)
}
```

#### 6. 数据看板 API (`dashboard`)
```typescript
{
  getOverview: () => Promise<DashboardOverview>
  getDownloadTrend: (days?: number) => Promise<TrendPoint[]>
  getUserDistribution: (limit?: number) => Promise<UserDistItem[]>
  getTopTags: (limit?: number) => Promise<TagStatItem[]>
  getContentLevelDistribution: () => Promise<LevelDistItem[]>
}
```

---

## 关键依赖与配置

### 核心依赖
- `electron` - Electron API（`contextBridge`, `ipcRenderer`）
- `@electron-toolkit/preload` - Electron 工具库（提供 `electronAPI`）

### 类型定义文件：`src/preload/index.d.ts`
```typescript
// 全局类型声明
interface Window {
  electron: ElectronAPI
  api: API
}

// 数据模型类型
interface DbUser { ... }
interface DbPost { ... }
interface SyncProgress { ... }
interface AnalysisProgress { ... }
...
```

---

## 数据模型

### 进度类型定义

#### `SyncProgress` - 同步进度
```typescript
interface SyncProgress {
  userId: number
  status: 'syncing' | 'completed' | 'failed' | 'stopped'
  nickname: string
  currentVideo: number
  totalVideos: number
  downloadedCount: number
  skippedCount: number
  message: string
}
```

#### `AnalysisProgress` - 分析进度
```typescript
interface AnalysisProgress {
  status: 'running' | 'completed' | 'failed' | 'stopped'
  currentPost: string | null
  currentIndex: number
  totalPosts: number
  analyzedCount: number
  failedCount: number
  message: string
}
```

#### `DownloadProgress` - 下载进度
```typescript
interface DownloadProgress {
  taskId: number
  status: 'running' | 'completed' | 'failed'
  currentUser: string | null
  currentUserIndex: number
  totalUsers: number
  currentVideo: number
  totalVideos: number
  message: string
  downloadedPosts: number
}
```

---

## 测试与质量

- **无单元测试**
- **类型安全**：完整的 TypeScript 类型定义，编译时检查
- **内存泄漏防护**：所有事件订阅提供 unsubscribe 函数

---

## 常见问题 (FAQ)

### Q1: 如何在渲染进程调用 API？
A: 直接使用 `window.api.*`
```tsx
const users = await window.api.user.getAll()
```

### Q2: 如何订阅进度事件？
A: 使用 `on*` 方法，返回的函数用于取消订阅
```tsx
useEffect(() => {
  const unsubscribe = window.api.sync.onProgress((progress) => {
    console.log(progress)
  })
  return unsubscribe // 组件卸载时自动取消订阅
}, [])
```

### Q3: 如何添加新 API？
A: 分三步：
1. 在 `src/main/index.ts` 注册 IPC handler
2. 在 `src/preload/index.ts` 添加 API 封装
3. 在 `src/preload/index.d.ts` 添加类型定义

### Q4: 为什么不直接在渲染进程使用 `ipcRenderer`？
A: 安全考虑。`contextBridge` 可以限制暴露的 API 范围，避免渲染进程获得过多权限。

---

## 相关文件清单

- `src/preload/index.ts` - API 封装，242 行
- `src/preload/index.d.ts` - 类型定义，约 200+ 行

---

## 变更记录 (Changelog)

### 2026-02-12
- 初始化模块文档
- 整理 API 分类、类型定义、使用示例
