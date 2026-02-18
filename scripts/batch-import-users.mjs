/**
 * 批量导入用户脚本 (无 native 依赖版本)
 * 使用方法: node scripts/batch-import-users.mjs
 *
 * 需要先从应用获取 Cookie，设置环境变量:
 * export DOUYIN_COOKIE="your_cookie_here"
 */

import { DouyinHandler, getSecUserId, getAwemeId, setConfig } from 'dy-downloader'
import { writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// 用户链接列表
const URLS = [
  'https://v.douyin.com/J0d_PQO-Qnw/',
  'https://v.douyin.com/5FsGnl61GZM/',
  'https://v.douyin.com/kHvcsukeodk/',
  'https://v.douyin.com/pUuxmfFiFD4/',
  'https://v.douyin.com/DBzS4LXnKD4/',
  'https://v.douyin.com/k3mRhRgLnDY/',
  'https://v.douyin.com/M30_FbwlWcM/',
  'https://v.douyin.com/8nuk0xO5S_0/',
  'https://v.douyin.com/T0uK3SkWP7o/',
  'https://v.douyin.com/OfK4fTfWeMc/',
  'https://v.douyin.com/Jcu41O9kf6M/',
  'https://v.douyin.com/Dq-dPlSU9Gc/',
  'https://v.douyin.com/sVuFsn7C944/',
  'https://v.douyin.com/U875MdyUK6k/',
  'https://v.douyin.com/nClA7ka0lBM/',
  'https://v.douyin.com/mP_UzhnNrsQ/',
  'https://v.douyin.com/gAmrqTE1zwM/',
  'https://v.douyin.com/Y0TFFLsmBSE/',
  'https://v.douyin.com/o3Af1BOe7M4/',
  'https://v.douyin.com/-FhaHKVP2Mw/',
  'https://v.douyin.com/KLUi9C1CXtA/',
  'https://v.douyin.com/VmIklpoEr84/',
  'https://v.douyin.com/KV2kafnl06I/',
  'https://www.douyin.com/user/MS4wLjABAAAAJVfuco97q2J64tuDX6qdiswDhn6kR8P2rDLQ3CzwQYA',
  'https://www.douyin.com/user/MS4wLjABAAAAFCPDXzFibS0_aKIOM8b9vxRuHQgpOqba19oCGk1QSK0',
  'https://www.douyin.com/user/MS4wLjABAAAAOIdhngBb3tXqAuvzSWQqiYbNNWByOtkc6vxTZykUqWg',
  'https://www.douyin.com/user/MS4wLjABAAAAxPpScMXMQARPYZPsC0OfhlAm1qNjT-FVu2tBKD9op0xNV016MYtUIect04Rlm4UH',
  'https://www.douyin.com/user/MS4wLjABAAAAWN8G_2zg1aPAQDTt0tj0xe48X7NWgmrWeta8dcsFt7U',
  'https://www.douyin.com/user/MS4wLjABAAAAB25CYouCTU6v7glcdFbsKJAmMBpIpOq0ctn4ozAG4oo',
  'https://www.douyin.com/user/MS4wLjABAAAAzgV1cjuOpK_GKLD83PhLA-NvT_vQVT4Y3jusdhgSTOoJhN54I3p-P2SDjZtVtkD5',
  'https://www.douyin.com/user/MS4wLjABAAAAgReTf8WH1krTehKLu8MqRCetHgSeHpoabEaovVvmENCPRoyFF0du7dv8dw8PTCBr',
  'https://www.douyin.com/user/MS4wLjABAAAATe-HazvJb-v2Lmc16vjGnuRIGfwixtn69d695J5olQk',
  'https://www.douyin.com/user/MS4wLjABAAAA8rYyvrYE5AVIz8AG6_F6xzLKXaQQsvS3wM23Vdljep0',
  'https://www.douyin.com/user/MS4wLjABAAAAnrOvCapklhSxLwz2NKTxlMjv4h1IVPp3yKVLc-ZKuh0pX916xqptDh5HXESw_4GX',
  'https://www.douyin.com/user/MS4wLjABAAAAxXH6xPVUSbxOp4hKsDbwiSG8A3313hUtKYcLWZXrezE',
  'https://www.douyin.com/user/MS4wLjABAAAAP-6RatIh2cL6w5qW9amZUkKZcHV5Fi3GqkSGVPkIIO0',
  'https://www.douyin.com/user/MS4wLjABAAAAMEpNMjKa5wlts2pVfVfFI3joa2nFd-I53OZR86yztHw',
  'https://www.douyin.com/user/MS4wLjABAAAA7KRGT4Nel0HrZMSuT34QdrhazvGDk-kjyBNxtvG_vDJyapdpwlalr2lK4Zw_bPmU',
  'https://www.douyin.com/user/MS4wLjABAAAAQO858DMNWD1aHlNnW7ojt4ofN_wMceJf1x0hsxhNyIGHQ3r0PcP19Z67wVKRqD4D',
  'https://www.douyin.com/user/MS4wLjABAAAAGVktIq6OX2xtd9UqVf9ufnkMtr3kinWP8YJ7-lUITSNts9ugUEzV5vmKIPDhJ9OX',
  'https://www.douyin.com/user/MS4wLjABAAAA71cMtBKfF8qT-BqHTbLGs-JjSjYsNLYDDKFiTZY5sMSHRA6s5WhR48EjR8fW4F2R',
  'https://www.douyin.com/user/MS4wLjABAAAA9cNmYo0n--AEsg38KbEmpDXjpgDJ7oFqvBu2XauKGOM',
  'https://www.douyin.com/user/MS4wLjABAAAAFJp0hUihIwdclTC-EC8jcc0z0pD5lPytcKST5oo6KElxVjlI9g9YjHZbx31UYF8A',
  'https://www.douyin.com/user/MS4wLjABAAAAABynnwybPFxL_GqBUYhexRBUzB3_6lQK-Ldp6WYn0Ek',
  'https://www.douyin.com/user/MS4wLjABAAAAI21n9KdHl9uq7XIYQfV4HB7H9zzqRiEjOvBxBqhMDbQ',
  'https://www.douyin.com/user/MS4wLjABAAAA8l-ISgicMeW0U3ymd3oTNIgofneNPvKqxm-eswzIGdKOZiBMKZjSHHyGXHVMeUvC',
  'https://www.douyin.com/user/MS4wLjABAAAA__Q_nfnHBoZs27Sq4_AigGKCMi6gu66jARaM_eLZaQB2rX5JW73poR124PhJ6lvK',
  'https://www.douyin.com/user/MS4wLjABAAAAo90cN426Vh9RQpxyXJoshl8B4K0hMwVawVUJAbK1XiKXuIzn-jeqXyALIcRJa5_H',
  'https://www.douyin.com/user/MS4wLjABAAAALg00j-jHmZeCEeatby-pHmtuo6lMlMrtGxQAbvpjC9uBq4zvtRDV3Nd-Cg0ZGg21',
  'https://www.douyin.com/user/MS4wLjABAAAAECadf3oO3JLkmfycZrAA9fJHgj8jVHVNRkQjeGRUEZ5FmeWqZs1ekqhmyJbVu0Lx',
  'https://www.douyin.com/user/MS4wLjABAAAATtM5qVZhyYjvtbVHEd4qFXHpCvIWuACCd38klJWsKEph0q3QwYu6L8f7BrwIzbxP',
  'https://www.douyin.com/user/MS4wLjABAAAAyZRA-JJvvyHTvBr1vLEXYpZvjti1lgRMKuo6rTAjNnAbLvI6cNiif9kU7ptWcG1V',
  'https://www.douyin.com/user/MS4wLjABAAAAttCEtzfPgR1vHBJ7eArUY6ULPKPqqkVg7DRy0qnHyeE',
  'https://www.douyin.com/user/MS4wLjABAAAAK2jW2BNuFA9rAPvT96GxFaTLAUb29mjfEwrlJ_9Ed7c'
]

// 输出文件路径
const OUTPUT_FILE = join(homedir(), 'Library/Application Support/dYmanager/import-users.json')

async function parseDouyinUrl(url) {
  try {
    const secUserId = await getSecUserId(url)
    if (secUserId) return { type: 'user', id: secUserId }
  } catch {}

  try {
    const awemeId = await getAwemeId(url)
    if (awemeId) return { type: 'video', id: awemeId }
  } catch {}

  return { type: 'unknown', id: '' }
}

async function main() {
  console.log('='.repeat(60))
  console.log('批量获取用户信息')
  console.log('='.repeat(60))

  // 获取 cookie
  const cookie = process.env.DOUYIN_COOKIE
  if (!cookie) {
    console.error('\n❌ 请设置 DOUYIN_COOKIE 环境变量')
    console.error('   export DOUYIN_COOKIE="your_cookie_here"')
    process.exit(1)
  }

  // 初始化 handler
  setConfig({ encryption: 'ab' })
  const handler = new DouyinHandler({ cookie })
  console.log('\n✅ DouyinHandler 初始化成功')
  console.log(`待处理链接数: ${URLS.length}`)

  const users = []
  let success = 0
  let failed = 0

  for (let i = 0; i < URLS.length; i++) {
    const url = URLS[i]
    console.log(`\n[${i + 1}/${URLS.length}] 处理: ${url.substring(0, 50)}...`)

    try {
      const parseResult = await parseDouyinUrl(url)
      console.log(`  链接类型: ${parseResult.type}`)

      let userData
      let homepageUrl = url

      if (parseResult.type === 'user') {
        const profileRes = await handler.fetchUserProfile(parseResult.id)
        userData = profileRes._data?.user
      } else if (parseResult.type === 'video') {
        const postDetail = await handler.fetchOneVideo(url)
        const secUid = postDetail.secUserId
        if (!secUid) {
          console.log('  ⚠️ 无法从作品获取用户ID，跳过')
          failed++
          continue
        }
        const profileRes = await handler.fetchUserProfile(secUid)
        userData = profileRes._data?.user
        homepageUrl = `https://www.douyin.com/user/${secUid}`
      } else {
        console.log('  ⚠️ 无法识别链接类型，跳过')
        failed++
        continue
      }

      if (!userData) {
        console.log('  ⚠️ 获取用户信息失败，跳过')
        failed++
        continue
      }

      users.push({
        sec_uid: userData.sec_uid,
        uid: userData.uid || '',
        nickname: userData.nickname || '',
        signature: userData.signature || '',
        avatar:
          userData.avatar_larger?.url_list?.[0] || userData.avatar_medium?.url_list?.[0] || '',
        short_id: userData.short_id || '',
        unique_id: userData.unique_id || '',
        following_count: userData.following_count || 0,
        follower_count: userData.follower_count || 0,
        total_favorited: userData.total_favorited || 0,
        aweme_count: userData.aweme_count || 0,
        homepage_url: homepageUrl
      })

      console.log(`  ✅ 获取成功: ${userData.nickname}`)
      success++

      // 延迟避免请求过快
      await new Promise((resolve) => setTimeout(resolve, 300))
    } catch (error) {
      console.log(`  ❌ 失败: ${error.message}`)
      failed++
    }
  }

  // 保存到文件
  writeFileSync(OUTPUT_FILE, JSON.stringify(users, null, 2))
  console.log(`\n📁 用户数据已保存到: ${OUTPUT_FILE}`)

  console.log('\n' + '='.repeat(60))
  console.log('获取完成!')
  console.log(`  成功: ${success}`)
  console.log(`  失败: ${failed}`)
  console.log('='.repeat(60))
}

main().catch(console.error)
