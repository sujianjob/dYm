# Electron 主进程模块

[根目录](../../CLAUDE.md) > **src/main**

---

## 模块职责

Electron 主进程是应用的核心控制中心，负责：
- **IPC 通信中心**：处理来自渲染进程的所有 API 请求
- **数据库操作**：管理 SQLite 数据库的增删改查
- **文件系统管理**：处理视频下载、封面提取、文件迁移
- **业务服务调度**：协调下载、分析、同步、定时任务等服务
- **系统���成**：系统托盘、剪贴板监听、自动更新

---

## 入口与启动

### 主入口：`src/main/index.ts`
- **职责**：应用生命周期管理、窗口创建、IPC handlers 注册
- **关键流程**：
  1. `app.whenReady()` → 初始化数据库、抖音客户端、调度器
  2. 注册自定义协议 `local://`（用于本地视频播放，支持 Range 请求）
  3. 注册 100+ IPC handlers（覆盖设置、用户、任务、下载、分析等）
  4. 创建系统托盘和主窗口
  5. 监听剪贴板（检测抖音链接，带防抖和冷却机制）

### 窗口管理
- **主窗口**：1200x800，支持最小化到托盘
- **关闭行为**：弹出对话框选择「最小化到托盘」或「退出程序」
- **辅助窗口**：Cookie 获取窗口、应用内浏览器（复用抖音登录态）

---

## 对外接口（IPC Handlers）

### 分类索引

| 类别 | IPC 通道前缀 | 说明 |
|------|------------|------|
| 设置 | `settings:*` | 读写配置项（Cookie、API Key、下载路径等） |
| Cookie | `cookie:*` | 获取/刷新抖音 Cookie |
| 抖音 API | `douyin:*` | 解析链接、获取用户资料、视频详情 |
| 用户管理 | `user:*` | 增删改查用户、批量刷新 |
| 任务管理 | `task:*` | 增删改查下载任务 |
| 下载 | `download:*` | 启动/停止下载、进度通知 |
| 同步 | `sync:*` | 启动/停止用户同步、定时调度 |
| 分析 | `analysis:*` | 启动/停止视频分析、统计数据 |
| 文件管理 | `files:*` | 查询文件大小、删除文件 |
| 数据看板 | `dashboard:*` | 获取统计数据、趋势图表 |
| 系统 | `system:*` | 打开目录、获取资源占用 |
| 迁移 | `migration:*` | 迁移下载路径 |
| 更新 | `updater:*` | 检查/下载/安装更新 |

### 核心 API 示例

#### 用户管理
```typescript
// 添加用户（智能识别用户链接或视频链接）
ipcMain.handle('user:add', async (_event, url: string) => {
  const parseResult = await parseDouyinUrl(url)
  if (parseResult.type === 'user') {
    // 直接获取用户资料
  } else if (parseResult.type === 'video') {
    // 先获取视频详情，再提取作者信息
  }
  // 检查重复、创建用户
})

// 批量刷新用户信息
ipcMain.handle('user:batchRefresh', async (_event, users) => {
  // 遍历用户，逐个调用 API，延迟 300ms 避免过快
})
```

#### 下载服务
```typescript
ipcMain.handle('download:start', async (_event, taskId: number) => {
  // 并发控制、进度上报、数据库记录
})

// 进度推送（主进程 → 渲染进程）
win.webContents.send('download:progress', {
  taskId, status, currentUser, currentVideo, totalVideos, ...
})
```

#### 自定义协议
```typescript
// 支持视频进度条拖动的 Range 请求
protocol.handle('local', async (request) => {
  const rangeHeader = request.headers.get('Range')
  if (rangeHeader) {
    // 解析 Range，返回 206 Partial Content
  }
  // 无 Range 则返回完整文件
})
```

---

## 关键依赖与配置

### 核心依赖
| 依赖 | 用途 |
|------|------|
| `better-sqlite3` | SQLite 数据库（WAL 模式） |
| `dy-downloader` | 抖音视频下载核心库 |
| `fluent-ffmpeg` | 视频帧提取（用于 AI 分析） |
| `@ffmpeg-installer/ffmpeg` | 内置 ffmpeg 二进制 |
| `node-cron` | 定时任务调度 |
| `electron-updater` | 自动更新 |

### 配置文件
- 无独立配置文件，所有配置存储在数据库 `settings` 表
- 默认配置在 `initDatabase()` 中初始化

---

## 数据模型

### 数据库表结构

#### `settings` - 系统设置
```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
)
```
**常用配置**：
- `douyin_cookie`：抖音 Cookie
- `grok_api_key`、`grok_api_url`：AI 分析配置
- `download_path`：下载目录
- `max_download_count`：全局下载数量限制
- `analysis_concurrency`、`analysis_rpm`：分析并发与速率

#### `users` - 用户表
**关键字段**：
- `sec_uid`（唯一标识）、`nickname`、`avatar`
- `aweme_count`（作品总数）、`downloaded_count`（已下载数，动态统计）
- `show_in_home`（首页可见）、`max_download_count`（用户级下载限制）
- `auto_sync`、`sync_cron`、`sync_status`（定时同步）

#### `posts` - 作品表
**关键字段**：
- `aweme_id`（唯一标识）、`user_id`、`sec_uid`、`nickname`
- `aweme_type`（0=视频，68=图集）
- `folder_name`、`video_path`、`cover_path`、`music_path`
- `analysis_tags`、`analysis_category`、`analysis_summary`、`analysis_content_level`、`analyzed_at`

#### `download_tasks` - 下载任务表
- 已废弃，迁移到用户同步系统
- 保留表结构但在 `initDatabase()` 中清空数据

**索引优化**：
- `posts` 表有 5 个索引：`user_id`、`sec_uid`、`create_time`、`analyzed_at`、`downloaded_at`

---

## 测试与质量

- **无单元测试**
- **手动测试**：开发模式下通过真实场景验证（下载、分析、同步、定时任务）
- **日志**：主进程日志输出到终端，包含调度器日志、下载进度、错误信息

---

## 常见问题 (FAQ)

### Q1: 如何调试主进程？
A: 在 VSCode 中添加 `launch.json` 配置，附加到 Electron 主进程。开发模式下日志输出到终端。

### Q2: 数据库锁定怎么办？
A: SQLite 已启用 WAL 模式，支持并发读。避免在事务中嵌套事务，长事务应拆分为多个短事务。

### Q3: 如何处理文件路径差异？
A: 使用 `path.join` 而非字符串拼接，Windows 路径需转换为 URL 友好格式（反斜杠 → 正斜杠）。

### Q4: ffmpeg 在生产环境找不到？
A: 已在代码中处理 asar 解包路径（`.replace('app.asar', 'app.asar.unpacked')`），确保 `electron-builder.yml` 配置了 `asarUnpack`。

---

## 相关文件清单

### 核心文件
- `src/main/index.ts` - 主入口，1149 行
- `src/main/database/index.ts` - 数据库操作，1175 行

### 服务模块
- `src/main/services/downloader.ts` - 下载服务（并发控制、进度上报）
- `src/main/services/analyzer.ts` - 分析服务（视频帧提取、Grok API 调用）
- `src/main/services/syncer.ts` - 同步服务（单用户增量同步）
- `src/main/services/scheduler.ts` - 调度服务（基于 node-cron 的定时任务）
- `src/main/services/douyin.ts` - 抖音 API 封装（用户资料、视频详情）
- `src/main/services/cookie.ts` - Cookie 管理（获取、刷新、持久化）
- `src/main/services/updater.ts` - 自动更新（electron-updater）

---

## 变更记录 (Changelog)

### 2026-02-12
- 初始化模块文档
- 整理 IPC 接口、数据模型、服务架构
