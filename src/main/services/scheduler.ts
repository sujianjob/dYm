import cron, { type ScheduledTask as CronScheduledTask } from 'node-cron'
import { getAutoSyncUsers, getAutoSyncTasks, updateTaskLastSyncAt, type DbUser, type DbTaskWithUsers } from '../database'
import { startUserSync, isUserSyncing, getAnyUserSyncing } from './syncer'
import { startDownloadTask, isTaskRunning } from './downloader'

interface ScheduledUserTask {
  userId: number
  task: CronScheduledTask
}

interface ScheduledDownloadTask {
  taskId: number
  task: CronScheduledTask
}

const scheduledUserTasks: Map<number, ScheduledUserTask> = new Map()
const scheduledDownloadTasks: Map<number, ScheduledDownloadTask> = new Map()

function isValidCron(expression: string): boolean {
  return cron.validate(expression)
}

async function executeUserSync(user: DbUser): Promise<void> {
  if (isUserSyncing(user.id)) {
    console.log(`[Scheduler] User ${user.nickname} is already syncing, skip`)
    return
  }

  const currentSyncing = getAnyUserSyncing()
  if (currentSyncing !== null) {
    console.log(`[Scheduler] Another user is syncing, skip ${user.nickname}`)
    return
  }

  console.log(`[Scheduler] Starting scheduled sync for ${user.nickname}`)
  try {
    await startUserSync(user.id)
  } catch (error) {
    console.error(`[Scheduler] Failed to sync ${user.nickname}:`, error)
  }
}

export function scheduleUser(user: DbUser): void {
  if (scheduledUserTasks.has(user.id)) {
    unscheduleUser(user.id)
  }

  if (!user.auto_sync || !user.sync_cron) {
    return
  }

  if (!isValidCron(user.sync_cron)) {
    console.error(`[Scheduler] Invalid cron expression for user ${user.nickname}: ${user.sync_cron}`)
    return
  }

  const task = cron.schedule(user.sync_cron, () => {
    executeUserSync(user)
  })

  scheduledUserTasks.set(user.id, { userId: user.id, task })
  console.log(`[Scheduler] Scheduled sync for ${user.nickname} with cron: ${user.sync_cron}`)
}

export function unscheduleUser(userId: number): void {
  const scheduled = scheduledUserTasks.get(userId)
  if (scheduled) {
    scheduled.task.stop()
    scheduledUserTasks.delete(userId)
    console.log(`[Scheduler] Unscheduled sync for user ${userId}`)
  }
}

// Task scheduling functions
async function executeTaskDownload(task: DbTaskWithUsers): Promise<void> {
  if (isTaskRunning(task.id)) {
    console.log(`[Scheduler] Task ${task.name} is already running, skip`)
    return
  }

  console.log(`[Scheduler] Starting scheduled download for task ${task.name}`)
  try {
    await startDownloadTask(task.id)
    updateTaskLastSyncAt(task.id)
  } catch (error) {
    console.error(`[Scheduler] Failed to execute task ${task.name}:`, error)
  }
}

export function scheduleTask(task: DbTaskWithUsers): void {
  if (scheduledDownloadTasks.has(task.id)) {
    unscheduleTask(task.id)
  }

  if (!task.auto_sync || !task.sync_cron) {
    return
  }

  if (!isValidCron(task.sync_cron)) {
    console.error(`[Scheduler] Invalid cron expression for task ${task.name}: ${task.sync_cron}`)
    return
  }

  const cronTask = cron.schedule(task.sync_cron, () => {
    executeTaskDownload(task)
  })

  scheduledDownloadTasks.set(task.id, { taskId: task.id, task: cronTask })
  console.log(`[Scheduler] Scheduled download for task ${task.name} with cron: ${task.sync_cron}`)
}

export function unscheduleTask(taskId: number): void {
  const scheduled = scheduledDownloadTasks.get(taskId)
  if (scheduled) {
    scheduled.task.stop()
    scheduledDownloadTasks.delete(taskId)
    console.log(`[Scheduler] Unscheduled download for task ${taskId}`)
  }
}

export function initScheduler(): void {
  // Initialize user-level scheduling
  const users = getAutoSyncUsers()
  console.log(`[Scheduler] Initializing with ${users.length} auto-sync users`)
  for (const user of users) {
    scheduleUser(user)
  }

  // Initialize task-level scheduling
  const tasks = getAutoSyncTasks()
  console.log(`[Scheduler] Initializing with ${tasks.length} auto-sync tasks`)
  for (const task of tasks) {
    scheduleTask(task)
  }
}

export function stopScheduler(): void {
  for (const [userId] of scheduledUserTasks) {
    unscheduleUser(userId)
  }
  for (const [taskId] of scheduledDownloadTasks) {
    unscheduleTask(taskId)
  }
  console.log('[Scheduler] All tasks stopped')
}

export function getScheduledUserIds(): number[] {
  return Array.from(scheduledUserTasks.keys())
}

export function getScheduledTaskIds(): number[] {
  return Array.from(scheduledDownloadTasks.keys())
}

export function validateCronExpression(expression: string): boolean {
  return isValidCron(expression)
}
