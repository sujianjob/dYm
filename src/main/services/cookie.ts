import { BrowserWindow, session } from 'electron'
import { setSetting } from '../database'

export async function fetchDouyinCookie(): Promise<string> {
  return new Promise((resolve, reject) => {
    // 创建独立 session 避免污染主窗口
    const partition = 'persist:douyin-login'
    const ses = session.fromPartition(partition)

    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      title: '登录抖音 - 登录后关闭此窗口',
      webPreferences: {
        partition,
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    win.loadURL('https://www.douyin.com')

    win.on('closed', async () => {
      try {
        // 获取所有 douyin.com 的 cookies
        const cookies = await ses.cookies.get({ domain: '.douyin.com' })
        const cookieString = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

        if (cookieString) {
          setSetting('douyin_cookie', cookieString)
        }

        resolve(cookieString)
      } catch (error) {
        reject(error)
      }
    })
  })
}
