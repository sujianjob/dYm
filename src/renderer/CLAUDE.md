# React 渲染进程模块

[根目录](../../CLAUDE.md) > **src/renderer**

---

## 模块职责

React 渲染进程负责：
- **UI 界面渲染**：使用 React 19 + TypeScript 构建用户界面
- **路由导航**：React Router v7 管理页面切换
- **状态管理**：Redux Toolkit 管理全局状态
- **用户交互**：表单输入、按钮点击、拖拽、滚动等事件处理
- **IPC 调用**：通过 `window.api.*` 与主进程通信

---

## 入口与启动

### 主入口：`src/renderer/src/main.tsx`
```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <RouterProvider router={router} />
        <Toaster position="top-center" />
      </Provider>
    </ErrorBoundary>
  </StrictMode>
)
```

**关键依赖**：
- `ErrorBoundary`：全局错误捕获，防止整个应用崩溃
- `Redux Provider`：提供 store 给所有组件
- `RouterProvider`：路由管理
- `Toaster`：全局通知（基于 sonner）

---

## 对外接口（页面路由）

### 路由配置：`src/renderer/src/routes/index.tsx`

| 路径 | 组件 | 说明 |
|------|------|------|
| `/` | `DashboardPage` | 数据看板（默认首页） |
| `/browse` | `HomePage` | 内容浏览（视频/图集） |
| `/users` | `UsersPage` | 用户管理 |
| `/download` | `DownloadPage` | 下载任务管理 |
| `/download/:id` | `TaskDetailPage` | 任务详情 |
| `/files` | `FilesPage` | 文件管理 |
| `/analysis` | `AnalysisPage` | 分析管理 |
| `/settings` | `SystemPage` | 系统设置 |
| `/logs` | `LogsPage` | 调度日志 |

### ���面功能概览

#### `DashboardPage` - 数据看板
- **4 张统计卡片**：用户总数、作品总数、已分析数、今日下载数
- **下载趋势图**：Recharts 折线图，最近 30 天
- **用户分布图**：柱状图，Top 10 用户
- **标签排行榜**：柱状图，Top 20 标签
- **内容等级分布**：柱状图，1-10 分分布

#### `HomePage` - 内容浏览
- **筛选器**：作者、标签（多选）、内容等级（范围滑块）、仅已分析
- **网格布局**：响应式网格，显示封面、标题、标签、等级
- **无限滚动**：滚动到底部自动加载下一页（分页大小 20）
- **媒体查看器**：点击卡片弹出对话框，支持视频播放、图集轮播

#### `UsersPage` - 用户管理
- **批量操作**：批量刷新、批量设置（首页可见、下载限制、自动同步）
- **单用户操作**：编辑备注、删除（可选删除文件）、查看主页、手动同步
- **状态显示**：同步状态（idle/syncing/error）、已下载数、作品总数

#### `AnalysisPage` - 分析管理
- **全局统计**：总作品数、已分析数、未分析数
- **按用户统计**：每个用户的分析进度（表格形式）
- **批量分析**：启动/停止全局分析，实时进度显示
- **单用户分析**：仅分析指定用户的未分析作品

#### `FilesPage` - 文件管理
- **用户级操作**：查看文件大小、文件夹数量、删除所有文件
- **作品级操作**：按用户筛选、分页显示、单个删除、打开文件夹

---

## 关键依赖与配置

### 核心依赖
| 依赖 | 用途 |
|------|------|
| `react` 19.x | UI 框架 |
| `react-router-dom` v7 | 路由管理 |
| `@reduxjs/toolkit` | 状态管理 |
| `tailwindcss` 4.x | CSS 框架 |
| `@radix-ui/*` | 无障碍 UI 组件库 |
| `lucide-react` | 图标库 |
| `recharts` | 数据可视化 |
| `sonner` | 通知库 |
| `cmdk` | 命令面板（未使用） |

### 配置文件
- **Tailwind**: `tailwind.config.js` + `postcss.config.js`
- **TypeScript**: `tsconfig.web.json`
- **无 Redux 持久化**：状态不持久化，每次启动重新从主进程加载

---

## 数据模型

### Redux Store 结构
```typescript
// src/renderer/src/store/index.ts
export const store = configureStore({
  reducer: {
    // 当前版本未配置 reducer，仅作占位
  }
})
```
**说明**：大部分状态通过组件内 `useState` 管理，Redux 保留用于未来扩展。

### 组件状态模式

#### 服务端状态（从主进程获取）
```tsx
const [users, setUsers] = useState<DbUser[]>([])
useEffect(() => {
  window.api.user.getAll().then(setUsers)
}, [])
```

#### 进度状态（主进程推送）
```tsx
useEffect(() => {
  const unsubscribe = window.api.sync.onProgress((progress) => {
    // 更新 UI
  })
  return unsubscribe
}, [])
```

#### 表单状态（本地管理）
```tsx
const [formData, setFormData] = useState({ name: '', cron: '' })
```

---

## 测试与质量

- **无单元测试**
- **E2E 测试**：Playwright 配置在 `playwright.config.ts`
- **类型检查**：`npm run typecheck:web`
- **Lint**：`eslint.config.mjs`

---

## 常见问题 (FAQ)

### Q1: 如何添加新页面？
A:
1. 在 `src/renderer/src/pages/` 创建组件
2. 在 `src/renderer/src/routes/index.tsx` 添加路由
3. 在 `AppLayout.tsx` 的侧边栏添加导航链接

### Q2: 如何调用主进程 API？
A: 使用 `window.api.*`，类型定义在 `src/preload/index.d.ts`
```tsx
const result = await window.api.user.add('https://...')
```

### Q3: 如何处理长时间任务？
A: 订阅进度事件
```tsx
useEffect(() => {
  const unsubscribe = window.api.download.onProgress((progress) => {
    console.log(progress.currentVideo, progress.totalVideos)
  })
  return unsubscribe
}, [])
```

### Q4: 如何显示通知？
A: 使用 `sonner` 的 `toast` API
```tsx
import { toast } from 'sonner'
toast.success('操作成功')
toast.error('操作失败')
```

---

## 相关文件清单

### 页面组件
- `src/renderer/src/pages/DashboardPage.tsx` - 数据看板
- `src/renderer/src/pages/HomePage.tsx` - 内容浏览
- `src/renderer/src/pages/settings/UsersPage.tsx` - 用户管理
- `src/renderer/src/pages/settings/DownloadPage.tsx` - 下载管理
- `src/renderer/src/pages/settings/AnalysisPage.tsx` - 分析管理
- `src/renderer/src/pages/settings/FilesPage.tsx` - 文件管理
- `src/renderer/src/pages/settings/SystemPage.tsx` - 系统设置
- `src/renderer/src/pages/settings/LogsPage.tsx` - 调度日志

### 通用组件
- `src/renderer/src/components/AppLayout.tsx` - 应用布局（侧边栏 + 内容区）
- `src/renderer/src/components/ErrorBoundary.tsx` - 错误边界
- `src/renderer/src/components/MediaViewer.tsx` - 媒体查看器
- `src/renderer/src/components/VideoDownloadDialog.tsx` - 视频下载对话框
- `src/renderer/src/components/ui/*` - shadcn/ui 组件库

### 工具函数
- `src/renderer/src/lib/utils.ts` - 通用工具（`cn` 函数：合并 className）

---

## 变更记录 (Changelog)

### 2026-02-12
- 初始化模块文档
- 整理页面结构、路由配置、组件清单
