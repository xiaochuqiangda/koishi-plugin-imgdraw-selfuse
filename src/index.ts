import { Context, Schema, Logger, h, segment } from 'koishi'
import axios from 'axios'
import yaml from 'yaml'
import fs from 'fs'
import path from 'path'

// 尝试导入 sharp，如果未安装则给出提示
let sharp: any
try {
  sharp = require('sharp')
} catch {
  sharp = null
}

export const name = 'ai-image'

export const inject = {
  required: ['console', 'i18n', 'database'],
  optional: ['assets'],
}

const logger = new Logger('ai-image')

// ==================== 模块类型扩展 ====================
declare module 'koishi' {
  interface Tables {
    ai_image_blacklist: BlacklistEntry
  }

  interface Context {
    assets?: any
  }
}

interface BlacklistEntry {
  id: string
  createdAt: Date
}

// ==================== 预置提示词单项配置 ====================
const PresetItem = Schema.object({
  enable: Schema.boolean().default(true).description('启用此预置提示词'),
  text: Schema.string().default('').description('预置提示词文本（将自动添加到 prompt 前）'),
  command: Schema.string().default('').description('触发指令（如 draw0，留空则默认使用 presetN，N 为序号）'),
  keyword: Schema.string().default('').description('匹配关键词（如 猫娘，留空则不启用关键词匹配）'),
  enableKeywordMatch: Schema.boolean().default(false).description('启用关键词匹配（用户 prompt 包含关键词时自动添加）'),
}).description('预置提示词配置项')

// ==================== 独立大类 1：模型配置项 ====================
// 副模型单项配置
const SubModelItem = Schema.object({
  enable: Schema.boolean().default(true).description('启用此副模型'),
  name: Schema.string().default('').description('副模型名称（仅用于标识，如"二次元模型"）'),
  model: Schema.string().default('').description('模型名称（如 gpt-4o-mini）'),
  apiKey: Schema.string().default('').description('API Key（留空则使用主模型的 API Key）'),

  // 副模型独立配置 API 类型和地址
  apiType: Schema.union([
    Schema.const('auto').description('跟随主模型设置'),
    Schema.const('chat').description('强制聊天补全模式 (/v1/chat/completions)'),
    Schema.const('images').description('强制图像生成模式 (/v1/images/generations)'),
  ]).default('auto').description('副模型 API 调用类型（auto=跟随主模型）'),

  baseUrl: Schema.string().default('').description('接口地址（留空则使用主模型的接口地址，需符合 OpenAI 标准）'),

  // 新增：副模型独立配置参考图片字段名
  imageRefField: Schema.union([
    Schema.const('auto').description('跟随主模型设置'),
    Schema.const('image').description('image（OpenAI 标准）'),
    Schema.const('image_url').description('image_url（部分中转站）'),
    Schema.const('reference_image').description('reference_image（自定义）'),
  ]).default('auto').description('图生图时参考图片的字段名（auto=跟随主模型）'),

  txt2imgCommand: Schema.string().default('').description('文生图触发指令（如 draw2，留空则默认使用 drawN，N 为序号）'),
  img2imgCommand: Schema.string().default('').description('图生图触发指令（如 imgdraw2，留空则默认使用 imgdrawN，N 为序号）'),
}).description('副模型配置项')

export const ModelConfig = Schema.object({
  // 主模型配置
  model: Schema.string().default('gpt-4o-mini').description('主模型名称'),
  txt2imgModel: Schema.string().default('').description('主模型文生图专用模型，留空则使用主模型名称'),
  img2imgModel: Schema.string().default('').description('主模型图生图专用模型，留空则使用主模型名称'),
  apiKey: Schema.string().default('').description('主模型 API Key'),

  // 主模型独立配置 API 类型和地址
  apiType: Schema.union([
    Schema.const('auto').description('自动检测（先尝试标准图像API，失败则回退到聊天API）'),
    Schema.const('chat').description('强制聊天补全模式 (/v1/chat/completions)'),
    Schema.const('images').description('强制图像生成模式 (/v1/images/generations)'),
  ]).default('auto').description('主模型 API 调用类型'),

  baseUrl: Schema.string().default('').description('主模型接口地址，需符合 OpenAI 标准'),

  // 新增：主模型独立配置参考图片字段名
  imageRefField: Schema.union([
    Schema.const('image').description('image（OpenAI 标准）'),
    Schema.const('image_url').description('image_url（部分中转站）'),
    Schema.const('reference_image').description('reference_image（自定义）'),
  ]).default('image').description('图生图时参考图片的字段名（标准图像API使用）'),

  // 副模型列表
  subModels: Schema.array(SubModelItem).default([]).description('副模型列表（可添加多个，每个副模型拥有独立的模型名、API、触发指令）'),
}).description('模型配置项')

// ==================== 独立大类 2：AI 绘图插件配置 ====================
export const BaseConfig = Schema.object({
  debug: Schema.boolean().default(false).description('开启调试模式，输出完整请求日志'),
  apiStrategy: Schema.union([
    Schema.const('sequence').description('顺序模式'),
    Schema.const('roundrobin').description('负载均衡模式'),
  ]).default('roundrobin').description('API 调度策略'),
  timeout: Schema.number().default(300000).description('接口请求超时时间（毫秒）'),
  rateLimit: Schema.number().default(200).description('每小时调用次数限制'),
  imgWaitTime: Schema.number().default(60).description('图生图等待图片超时时间（秒）'),
  maxImages: Schema.number().default(5).description('图生图最大支持图片数量'),

  // ==================== 图片压缩配置 ====================
  enableImgCompress: Schema.boolean().default(true).description('启用图生图图片压缩（推荐开启，可防止大图超时）'),
  imgMaxWidth: Schema.number().default(1536).description('图片压缩最大宽度（像素）'),
  imgMaxHeight: Schema.number().default(1536).description('图片压缩最大高度（像素）'),
  imgQuality: Schema.number().default(85).description('JPEG 压缩质量 1-100（越高越清晰，建议 80-90）'),
  imgMaxFileSize: Schema.number().default(3).description('图片最大体积（MB），超过会进一步压缩'),
  // ==========================================================

  // ==================== 图生图 base64 转换开关 ====================
  enableImg2ImgBase64: Schema.boolean().default(true).description('图生图将图片转换为 base64（关闭则直接传 URL，部分 API 不需要 base64）'),
  // ==========================================================

  // 多 API 负载均衡列表（兼容旧配置，与主模型/副模型独立）
  apiList: Schema.array(Schema.object({
    enable: Schema.boolean().default(true).description('启用此 API'),
    apiKey: Schema.string().description('API Key'),
    baseUrl: Schema.string().description('接口地址，需符合 OpenAI 标准'),
  })).default([]).description('多 API 负载均衡列表（支持多账号负载，与主/副模型配置独立，优先级低于模型专属配置）'),

  enableTxt2Img: Schema.boolean().default(true).description('启用文生图'),
  enableImg2Img: Schema.boolean().default(true).description('启用图生图'),
  command: Schema.string().default('draw').description('主模型文生图主指令'),
  aliases: Schema.array(String).default([]).description('主模型文生图指令别名'),
  img2imgCommand: Schema.string().default('imgdraw').description('主模型图生图指令'),
  img2imgAliases: Schema.array(String).default([]).description('主模型图生图指令别名'),
  txt2imgPrompt: Schema.string().default('请严格遵循我的要求生成一张图片，不要询问或添加额外说明，直接输出图片。你可以使用联网功能获取最新的数据或信息。\n要求：{prompt}').description('文生图提示词模板'),
  img2imgPrompt: Schema.string().default('图片链接：{url} 请严格根据以下指令对提供的图片进行编辑或重绘，不要询问，直接输出结果。你可以使用联网功能获取最新的数据或信息。\n指令：{prompt}').description('图生图提示词模板'),
  blacklistAdmins: Schema.array(String).default([]).description('允许管理黑名单的 QQ 号列表'),
}).description('AI 绘图插件配置')

// ==================== 独立大类 3：预置提示词配置 ====================
export const PresetConfig = Schema.object({
  enablePresets: Schema.boolean().default(false).description('启用预置提示词功能（指令触发仅主模型文生图可用，关键词匹配任何生图都可用）'),
  presets: Schema.array(PresetItem).default([]).description('预置提示词列表（可添加多个，支持指令触发和关键词匹配。指令留空则默认使用 presetN，N 为序号）'),
}).description('预置提示词配置')

// ==================== 独立大类 4：提示文案配置 ====================
export const MessageConfig = Schema.object({
  messages: Schema.object({
    generating: Schema.string().default('⏳ 生成中...'),
    waitImage: Schema.string().default('请在60秒内发送需要编辑的图片'),
    timeout: Schema.string().default('等待图片超时，已取消'),
    empty: Schema.string().default('❌ 请输入提示词'),
    noApi: Schema.string().default('❌ 未配置可用API'),
    fail: Schema.string().default('❌ 生成失败'),
    modelTextOnly: Schema.string().default('❌ 模型未生成图片，返回文字：{text}'),
    needAssets: Schema.string().default('❌ 图生图需要正确配置 assets 服务（selfUrl 未正确设置或服务未启动）'),
    txt2imgDisabled: Schema.string().default('❌ 文生图功能未启用'),
    img2imgDisabled: Schema.string().default('❌ 图生图功能未启用'),
    rateLimit: Schema.string().default('❌ 调用次数已达上限，请稍后再试'),
    alreadyWaiting: Schema.string().default('你已在等待发送图片，请直接发送图片或等待超时'),
    multiImageReceived: Schema.string().default('已收到 {count} 张图片，可继续发送或输入"完成"开始生成'),
    multiImageLimit: Schema.string().default('已达到最大图片数量，自动开始生成'),
    noImageReceived: Schema.string().default('未发送任何图片'),
    blacklisted: Schema.string().default('❌ 你已被加入黑名单，无法使用绘图功能'),
    noPermission: Schema.string().default('❌ 你没有权限管理黑名单'),
    blacklistAddSuccess: Schema.string().default('✅ 已将 {targets} 加入黑名单'),
    blacklistRemoveSuccess: Schema.string().default('✅ 已将 {targets} 移出黑名单'),
    blacklistAddFail: Schema.string().default('⚠️ {targets} 已在黑名单中或无效'),
    blacklistRemoveFail: Schema.string().default('⚠️ {targets} 不在黑名单中'),
    invalidUserId: Schema.string().default('⚠️ 无效的QQ号：{targets}'),
    blacklistListEmpty: Schema.string().default('✅ 当前黑名单为空'),
    blacklistListTitle: Schema.string().default('📋 当前黑名单：'),
  }).description('提示文案配置'),
}).description('提示文案配置')

// ==================== 组合配置（四个并列大类）====================
export const Config = Schema.intersect([
  ModelConfig,
  BaseConfig,
  PresetConfig,
  MessageConfig,
])

export type Config = any

// ==================== 主函数 ====================
export async function apply(ctx: Context, cfg: any) {
  const debug = cfg.debug

  // 检查 sharp 是否安装
  if (cfg.enableImgCompress && !sharp) {
    logger.warn('图片压缩已启用，但未检测到 sharp 库。请运行：npm install sharp')
    logger.warn('在未安装 sharp 的情况下，将跳过压缩，可能导致大图超时')
  }

  // 加载本地化文件
  try {
    const loc = path.join(__dirname, 'locales', 'zh-CN.yml')
    if (fs.existsSync(loc)) {
      ctx.i18n.define('zh-CN', yaml.parse(fs.readFileSync(loc, 'utf8')))
    }
  } catch { }

  const waitingMap = new Map()
  const apiIdx = { val: 0 }
  const apiCallTimestamps: number[] = []

  // 扩展数据库表
  ctx.model.extend('ai_image_blacklist', {
    id: 'string',
    createdAt: 'date',
  }, {
    primary: 'id',
  })

  // 清理定时器
  ctx.on('dispose', () => {
    for (const [, task] of waitingMap) {
      clearTimeout(task.timer)
    }
    waitingMap.clear()
  })

  // ==================== 工具函数 ====================
  function checkRateLimit(): boolean {
    const now = Date.now()
    const oneHourAgo = now - 3600000
    while (apiCallTimestamps.length > 0 && apiCallTimestamps[0] < oneHourAgo) {
      apiCallTimestamps.shift()
    }
    return apiCallTimestamps.length < cfg.rateLimit
  }

  function recordApiCall(): void {
    apiCallTimestamps.push(Date.now())
  }

  /**
   * 获取 API 配置
   * @param subModel 副模型配置（可选），如果提供则优先使用副模型的 API，否则使用主模型
   */
  function getApi(subModel?: any): any {
    // 如果指定了副模型，优先使用副模型的专属 API
    if (subModel) {
      const subApiKey = subModel.apiKey?.trim()
      const subBaseUrl = subModel.baseUrl?.trim()
      if (subApiKey && subBaseUrl) {
        return { apiKey: subApiKey, baseUrl: subBaseUrl }
      }
      // 副模型只填了 baseUrl，用主模型的 apiKey
      if (subBaseUrl && cfg.apiKey) {
        return { apiKey: cfg.apiKey, baseUrl: subBaseUrl }
      }
    }

    // 使用主模型的 API
    const mainApiKey = cfg.apiKey?.trim()
    const mainBaseUrl = cfg.baseUrl?.trim()
    if (mainApiKey && mainBaseUrl) {
      return { apiKey: mainApiKey, baseUrl: mainBaseUrl }
    }

    // 回退到多 API 负载均衡列表
    const list = cfg.apiList.filter((v: any) => v.enable && v.apiKey && v.baseUrl)
    if (!list.length) return null
    if (cfg.apiStrategy === 'sequence') return list[0]
    const api = list[apiIdx.val % list.length]
    apiIdx.val++
    return api
  }

  /**
   * 获取模型名称
   * @param subModel 副模型配置（可选）
   * @param mode 'txt2img' | 'img2img'
   */
  function getModel(subModel?: any, mode?: 'txt2img' | 'img2img'): string {
    if (subModel) {
      return subModel.model?.trim() || cfg.model
    }
    if (mode === 'txt2img') {
      return cfg.txt2imgModel?.trim() || cfg.model
    }
    if (mode === 'img2img') {
      return cfg.img2imgModel?.trim() || cfg.model
    }
    return cfg.model
  }

  /**
   * 获取实际使用的 API 类型
   * @param subModel 副模型配置（可选）
   */
  function getEffectiveApiType(subModel?: any): string {
    if (subModel) {
      const subType = subModel.apiType
      if (subType && subType !== 'auto') {
        return subType
      }
      // 副模型跟随主模型
      return cfg.apiType || 'auto'
    }
    // 主模型
    return cfg.apiType || 'auto'
  }

  /**
   * 获取实际使用的参考图片字段名
   * @param subModel 副模型配置（可选）
   */
  function getEffectiveImageRefField(subModel?: any): string {
    if (subModel) {
      const subField = subModel.imageRefField
      if (subField && subField !== 'auto') {
        return subField
      }
      // 副模型跟随主模型
      return cfg.imageRefField || 'image'
    }
    // 主模型
    return cfg.imageRefField || 'image'
  }

  // ==================== 修复：增强 HTML/XML 清理 ====================
  function cleanHtmlTags(str: string): string {
    if (!str) return ''
    // 1. 清理标准 HTML 标签
    let cleaned = str.replace(/<[^>]+>/g, ' ')
    // 2. 清理 QQ XML 图片标签（如 <img src="..." file="..."/>）
    cleaned = cleaned.replace(/<img\s+[^>]+\/>/gi, ' ')
    // 3. 清理其他 XML 标签
    cleaned = cleaned.replace(/<[^>]+>/g, ' ')
    // 4. 清理多余空格和换行
    cleaned = cleaned.replace(/\s+/g, ' ').trim()
    return cleaned
  }

  // 增强图片提取函数
  function getImageUrlFromContent(text: string): string | null {
    if (!text) return null
    const httpReg = /https?:\/\/[^<> \n\r()\[\]]+\.(png|jpg|jpeg|gif|webp)/i
    const httpMatch = text.match(httpReg)
    if (httpMatch) return httpMatch[0]
    const base64Reg = /data:image\/(png|jpg|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+/
    const base64Match = text.match(base64Reg)
    if (base64Match) return base64Match[0]
    const markdownReg = /!\[.*?\]\((.*?)\)/
    const markdownMatch = text.match(markdownReg)
    if (markdownMatch) return markdownMatch[1]
    return null
  }

  // ==================== 图片压缩函数 ====================
  async function compressImage(buffer: Buffer): Promise<Buffer> {
    if (!sharp || !cfg.enableImgCompress) {
      return buffer
    }

    try {
      let image = sharp(buffer)
      const metadata = await image.metadata()

      // 计算缩放比例
      let width = metadata.width || cfg.imgMaxWidth
      let height = metadata.height || cfg.imgMaxHeight
      const ratio = Math.min(
        cfg.imgMaxWidth / width,
        cfg.imgMaxHeight / height,
        1  // 不放大
      )

      if (ratio < 1) {
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
        image = image.resize(width, height, { fit: 'inside' })
      }

      // 压缩并转换格式
      let quality = Math.max(1, Math.min(100, cfg.imgQuality))
      let compressed = await image
        .jpeg({ quality, progressive: true, mozjpeg: true })
        .toBuffer()

      // 如果还超过限制，进一步降低质量
      const maxBytes = cfg.imgMaxFileSize * 1024 * 1024
      while (compressed.length > maxBytes && quality > 40) {
        quality -= 5
        compressed = await image
          .jpeg({ quality, progressive: true, mozjpeg: true })
          .toBuffer()
      }

      if (debug) {
        logger.info(`图片压缩: ${buffer.length} -> ${compressed.length} bytes ` +
          `(${Math.round(compressed.length / buffer.length * 100)}%), ` +
          `尺寸: ${Math.round(width)}x${Math.round(height)}, 质量: ${quality}`)
      }

      return compressed
    } catch (e) {
      logger.error('图片压缩失败，使用原图', e)
      return buffer
    }
  }

  async function compressBase64Image(base64Url: string): Promise<string> {
    if (!sharp || !cfg.enableImgCompress) {
      return base64Url
    }

    try {
      const base64Data = base64Url.split(',')[1]
      const buffer = Buffer.from(base64Data, 'base64')
      const compressed = await compressImage(buffer)
      return `data:image/jpeg;base64,${compressed.toString('base64')}`
    } catch (e) {
      logger.error('base64 图片压缩失败，使用原图', e)
      return base64Url
    }
  }
  // ==========================================================

  // ==================== 修改：URL 转 base64（支持开关）====================
  /**
   * 处理图片 URL，根据配置决定返回 base64 还是原始 URL
   * @param url 图片 URL
   * @param forceBase64 强制使用 base64（覆盖全局配置）
   */
  async function processImageUrl(url: string, forceBase64?: boolean): Promise<string | null> {
    if (!url) return null

    // 如果已经是 base64，检查是否需要压缩
    if (url.startsWith('data:image/')) {
      if (cfg.enableImgCompress && sharp) {
        return await compressBase64Image(url)
      }
      return url
    }

    // 判断是否转换为 base64
    const needBase64 = forceBase64 !== undefined ? forceBase64 : cfg.enableImg2ImgBase64

    if (!needBase64) {
      // 直接返回 URL（不转换 base64）
      if (debug) logger.info('图生图使用原始 URL:', url.slice(0, 100))
      return url
    }

    // 转换为 base64
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000,
      })
      const compressed = await compressImage(Buffer.from(res.data as ArrayBuffer))
      return `data:image/jpeg;base64,${compressed.toString('base64')}`
    } catch (e) {
      logger.error('图片转 base64 失败', e)
      throw new Error('图片下载失败，请检查 selfUrl 是否可访问')
    }
  }
  // ==========================================================

  // 统一发送图片函数
  async function sendImage(session: any, imgUrl: string): Promise<void> {
    const trimmed = imgUrl.trim()
    if (trimmed.startsWith('data:image/')) {
      if (debug) logger.info('发送 base64 图片，长度:', trimmed.length)
      await safeSend(session, h('img', { src: trimmed }))
    } else if (/^https?:\/\//.test(trimmed)) {
      if (debug) logger.info('发送 URL 图片:', trimmed.slice(0, 100))
      await safeSend(session, segment.image(trimmed))
    } else {
      logger.warn('未知的图片格式:', trimmed.slice(0, 100))
      await safeSend(session, cfg.messages.fail + '（图片格式异常）')
    }
  }

  async function safeSend(session: any, message: any): Promise<void> {
    try {
      await session.send(message)
    } catch (e) {
      logger.error('发送消息失败', e)
    }
  }

  function getErrorMessage(err: any): string {
    if (axios.isAxiosError(err)) {
      if (err.code === 'ECONNABORTED') return '请求超时'
      if (err.code === 'ERR_NETWORK' || err.code?.startsWith('ERR_')) return '网络连接失败'
      if (err.code === 'ECONNRESET') return '连接被重置（服务端可能不支持此API格式或负载过高）'
      if (err.response) {
        const status = err.response.status
        if (status === 404) return 'API端点不存在（404）'
        if (status === 400) return '请求参数错误（400）'
        if (status === 401) return 'API Key 无效（401）'
        if (status === 429) return '请求过于频繁（429）'
        if (status >= 500) return `服务器错误 (${status})`
        if (status >= 400) return `请求错误 (${status})，请检查 API Key 或参数`
      }
      return err.message?.slice(0, 100) || '未知网络错误'
    }
    return '未知错误'
  }

  function extractFilenameFromAssetUrl(assetUrl: string): string | null {
    if (!assetUrl) return null
    try {
      if (assetUrl.startsWith('file://')) {
        return path.basename(assetUrl.replace('file://', ''))
      }
      const urlObj = new URL(assetUrl)
      const parts = urlObj.pathname.split('/')
      const rawName = parts[parts.length - 1] || ''
      return rawName ? path.basename(rawName) : null
    } catch {
      return null
    }
  }

  function deleteCachedFile(assetUrl: string): void {
    const filename = extractFilenameFromAssetUrl(assetUrl)
    if (!filename) return
    const defaultRoot = path.join(ctx.baseDir, 'data', 'assets')
    const filePath = path.join(defaultRoot, filename)
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        if (debug) logger.info('已删除缓存文件:', filePath)
      }
    } catch (e) {
      logger.error('删除缓存文件失败', e)
    }
  }

  function deleteAllCachedFiles(urls: string[]): void {
    for (const url of urls) {
      deleteCachedFile(url)
    }
  }

  function isValidQQ(id: string): boolean {
    return /^\d{5,11}$/.test(id)
  }

  async function isBlacklisted(userId: string): Promise<boolean> {
    try {
      const rows = await ctx.database.get('ai_image_blacklist', { id: userId })
      return rows.length > 0
    } catch (e) {
      logger.error('查询黑名单失败', e)
      return false
    }
  }

  async function addToBlacklist(ids: string[]): Promise<any> {
    const success: string[] = []
    const fail: string[] = []
    for (const id of ids) {
      if (!isValidQQ(id)) {
        fail.push(id)
        continue
      }
      try {
        const exists = await ctx.database.get('ai_image_blacklist', { id })
        if (exists.length === 0) {
          await ctx.database.create('ai_image_blacklist', { id, createdAt: new Date() })
          success.push(id)
        } else {
          fail.push(id)
        }
      } catch (e) {
        logger.error('添加黑名单失败', e)
        fail.push(id)
      }
    }
    return { success, fail }
  }

  async function removeFromBlacklist(ids: string[]): Promise<any> {
    const success: string[] = []
    const fail: string[] = []
    for (const id of ids) {
      if (!isValidQQ(id)) {
        fail.push(id)
        continue
      }
      try {
        const exists = await ctx.database.get('ai_image_blacklist', { id })
        if (exists.length > 0) {
          await ctx.database.remove('ai_image_blacklist', { id })
          success.push(id)
        } else {
          fail.push(id)
        }
      } catch (e) {
        logger.error('移除黑名单失败', e)
        fail.push(id)
      }
    }
    return { success, fail }
  }

  // ==================== 预置提示词处理函数 ====================

  /**
   * 获取所有启用的预置提示词配置
   */
  function getEnabledPresets(): any[] {
    if (!cfg.enablePresets || !cfg.presets) return []
    return cfg.presets.filter((p: any) => p.enable && p.text)
  }

  /**
   * 根据指令名查找匹配的预置提示词
   * @param cmd 指令名，如 "draw0"
   */
  function findPresetByCommand(cmd: string): any | null {
    const presets = getEnabledPresets()
    for (const preset of presets) {
      const presetCmd = preset.command?.trim()
      if (presetCmd && presetCmd === cmd) {
        return preset
      }
    }
    return null
  }

  /**
   * 根据用户 prompt 关键词匹配预置提示词
   * @param prompt 用户输入的 prompt
   */
  function findPresetsByKeyword(prompt: string): any[] {
    const presets = getEnabledPresets()
    const matched: any[] = []
    if (!prompt) return matched
    const lowerPrompt = prompt.toLowerCase()
    for (const preset of presets) {
      if (preset.enableKeywordMatch && preset.keyword) {
        const keywords = preset.keyword.split(/[,，|\/\s]+/).map((k: string) => k.trim().toLowerCase()).filter(Boolean)
        for (const kw of keywords) {
          if (lowerPrompt.includes(kw)) {
            matched.push(preset)
            break
          }
        }
      }
    }
    return matched
  }

  /**
   * 拼接预置提示词和用户 prompt
   * @param prompt 用户输入的原始 prompt
   * @param presets 要应用的预置提示词列表
   */
  function buildPromptWithPresets(prompt: string, presets: any[]): string {
    if (!presets || presets.length === 0) return prompt
    const presetTexts = presets.map((p: any) => p.text.trim()).filter(Boolean)
    if (presetTexts.length === 0) return prompt
    const combinedPreset = presetTexts.join('，')
    // 预置提示词放在前面，用户 prompt 在后面
    return `${combinedPreset}，${prompt}`
  }
  // ==========================================================

  // ==================== 通用 API 调用函数 ====================

  /**
   * 尝试用标准图像生成 API 调用
   */
  async function tryImagesApi(session: any, prompt: string, imageUrl: string | undefined, api: any, model: string, subModel?: any): Promise<{ success: boolean; result?: any; error?: string; rawError?: any }> {
    // 直接使用 baseUrl 作为图像API地址（用户需自行填写正确的图像API端点）
    const url = api.baseUrl

    const body: any = {
      model,
      prompt,
      n: 1,
      size: '1024x1024',
    }

    // 图生图：添加参考图片（gpt-image-2 图像API可能不支持，但尝试传入）
    if (imageUrl) {
      // imageUrl 已经由调用方处理过，直接使用
      const refField = getEffectiveImageRefField(subModel)
      body[refField] = imageUrl
      if (debug) logger.info(`图生图添加参考图片字段: ${refField}`)
    }

    if (debug) {
      const logBody = { ...body }
      if (logBody.image) logBody.image = '[图片数据]'
      if (logBody.image_url) logBody.image_url = '[图片数据]'
      if (logBody.reference_image) logBody.reference_image = '[图片数据]'
      logger.info('尝试图像生成API:', url)
      logger.info('请求体:', JSON.stringify(logBody, null, 2))
    }

    try {
      const res = await axios.post(url, body, {
        headers: {
          Authorization: `Bearer ${api.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: cfg.timeout,
      })

      if (debug) logger.info('图像生成API返回:', JSON.stringify(res.data, null, 2))

      // 标准格式: { data: [{ url: "...", revised_prompt: "..." }] }
      const imgUrl = res.data?.data?.[0]?.url || null
      const b64Data = res.data?.data?.[0]?.b64_json || null

      if (imgUrl || b64Data) {
        return {
          success: true,
          result: {
            url: imgUrl,
            base64: b64Data ? `data:image/png;base64,${b64Data}` : null
          }
        }
      }

      // 有些中转站可能返回不同格式，尝试兼容
      const altUrl = res.data?.url || res.data?.image_url || res.data?.data?.url || null
      if (altUrl) {
        return { success: true, result: { url: altUrl, base64: null } }
      }

      return { success: false, error: '返回格式不正确' }
    } catch (err: any) {
      // 404 = 端点不存在，400 = 参数不支持，405 = 方法不允许，这些情况下可以回退
      const status = err.response?.status
      if (status === 404 || status === 400 || status === 405) {
        if (debug) logger.info(`图像生成API不支持 (${status})，将回退到聊天API`)
        return { success: false, error: 'not_supported', rawError: err }
      }
      // 其他错误（如 ECONNRESET）直接抛出，让上层处理
      throw err
    }
  }

  /**
   * 用聊天补全 API 调用（兼容 gpt-image-2 多模态格式）
   */
  async function tryChatApi(session: any, prompt: string, imageUrl: string | undefined, api: any, model: string): Promise<{ success: boolean; result?: any; error?: string }> {
    // gpt-image-2 在聊天模式下需要多模态消息格式，即使是文生图也要用数组格式
    const content: any[] = [
      { type: 'text', text: prompt },
    ]

    if (imageUrl) {
      const processedUrl = await processImageUrl(imageUrl)
      if (!processedUrl) {
        return { success: false, error: '图片处理失败' }
      }
      content.push({ type: 'image_url', image_url: { url: processedUrl } })
    }

    const body = {
      model,
      messages: [{ role: 'user', content }],
    }

    if (debug) logger.info('聊天API请求体:', JSON.stringify(body, null, 2))

    try {
      const res = await axios.post(api.baseUrl, body, {
        headers: { Authorization: `Bearer ${api.apiKey}` },
        timeout: cfg.timeout,
      })

      if (debug) logger.info('聊天API返回:', JSON.stringify(res.data, null, 2))

      // 尝试各种可能的返回格式
      let imgUrl: string | null = res.data?.data?.[0]?.url || null
      if (!imgUrl) {
        const contentText = res.data?.choices?.[0]?.message?.content || ''
        imgUrl = getImageUrlFromContent(contentText)
        if (imgUrl) {
          return { success: true, result: { url: imgUrl, base64: null } }
        }
        // 如果没有图片URL，返回文本内容
        if (contentText && typeof contentText === 'string' && contentText.trim().length > 0) {
          return { success: true, result: { text: contentText.trim() } }
        }
      } else {
        return { success: true, result: { url: imgUrl, base64: null } }
      }

      return { success: false, error: '未返回任何内容' }
    } catch (err) {
      throw err
    }
  }
  // ==========================================================

  // ==================== 修改后的 generate 函数（通用兼容）====================
  async function generate(session: any, prompt: string, imageUrl?: string, subModel?: any, mode?: 'txt2img' | 'img2img'): Promise<void> {
    if (!checkRateLimit()) {
      await safeSend(session, cfg.messages.rateLimit)
      return
    }
    const api = getApi(subModel)
    if (!api) {
      if (debug) logger.info('无可用API')
      await safeSend(session, cfg.messages.noApi)
      return
    }
    const model = getModel(subModel, mode)
    const apiType = getEffectiveApiType(subModel)

    let result: any = null
    let usedApiType = ''

    try {
      // 根据配置选择调用策略
      if (apiType === 'images') {
        // 强制使用图像生成 API
        const res = await tryImagesApi(session, prompt, imageUrl, api, model, subModel)
        if (res.success) {
          result = res.result
          usedApiType = 'images'
        } else {
          throw new Error(res.error || '图像生成API失败')
        }
      } else if (apiType === 'chat') {
        // 强制使用聊天 API
        const res = await tryChatApi(session, prompt, imageUrl, api, model)
        if (res.success) {
          result = res.result
          usedApiType = 'chat'
        } else {
          throw new Error(res.error || '聊天API失败')
        }
      } else {
        // 自动模式：先尝试图像API，不支持则回退到聊天API
        const imagesRes = await tryImagesApi(session, prompt, imageUrl, api, model, subModel)
        if (imagesRes.success) {
          result = imagesRes.result
          usedApiType = 'images'
          if (debug) logger.info('自动模式：使用图像生成API成功')
        } else if (imagesRes.error === 'not_supported') {
          // 图像API不支持，回退到聊天API
          const chatRes = await tryChatApi(session, prompt, imageUrl, api, model)
          if (chatRes.success) {
            result = chatRes.result
            usedApiType = 'chat'
            if (debug) logger.info('自动模式：图像API不支持，回退到聊天API成功')
          } else {
            throw new Error(chatRes.error || '聊天API失败')
          }
        } else {
          throw new Error(imagesRes.error || '图像生成API失败')
        }
      }

      // 处理结果
      if (result.url || result.base64) {
        const imgUrl = result.base64 || result.url
        await sendImage(session, imgUrl)
        if (debug) logger.info(`生成成功，使用API类型: ${usedApiType}`)
      } else if (result.text) {
        const msg = cfg.messages.modelTextOnly.replace('{text}', result.text.slice(0, 500))
        await safeSend(session, msg)
        if (debug) logger.info(`返回文本内容，使用API类型: ${usedApiType}`)
      } else {
        await safeSend(session, cfg.messages.fail + '（未返回任何内容）')
      }
    } catch (err) {
      const reason = getErrorMessage(err)
      logger.error(`API请求失败 [${reason}]`, err)
      await safeSend(session, `${cfg.messages.fail} [${reason}]`)
    }
  }

  // ==================== 修改后的 generateWithMultipleImages 函数（通用兼容）====================
  async function generateWithMultipleImages(session: any, prompt: string, imageUrls: string[], subModel?: any, mode?: 'txt2img' | 'img2img'): Promise<void> {
    if (!checkRateLimit()) {
      await safeSend(session, cfg.messages.rateLimit)
      return
    }
    const api = getApi(subModel)
    if (!api) {
      if (debug) logger.info('无可用API')
      await safeSend(session, cfg.messages.noApi)
      return
    }
    const model = getModel(subModel, mode)
    const apiType = getEffectiveApiType(subModel)

    // 多图处理：标准图像API通常只支持单图，聊天API支持多图
    // 自动模式下，如果有多图且>1张，优先尝试聊天API（支持多图）
    const finalPrompt = prompt.replace('{url}', imageUrls.join(', '))

    let result: any = null
    let usedApiType = ''

    try {
      if (apiType === 'chat') {
        // 强制聊天模式：使用聊天API（支持多图）
        const processedUrls = (await Promise.all(imageUrls.map(url => processImageUrl(url)))).filter((url: any) => url !== null)
        if (processedUrls.length === 0) {
          await safeSend(session, cfg.messages.fail + '（图片处理失败）')
          return
        }

        const content: any[] = [
          { type: 'text', text: finalPrompt },
          ...processedUrls.map(url => ({ type: 'image_url', image_url: { url } })),
        ]

        const body = {
          model,
          messages: [{ role: 'user', content }],
        }

        if (debug) logger.info('多图聊天API请求体:', JSON.stringify(body, null, 2))

        recordApiCall()
        const res = await axios.post(api.baseUrl, body, {
          headers: { Authorization: `Bearer ${api.apiKey}` },
          timeout: cfg.timeout,
        })

        if (debug) logger.info('多图聊天API返回:', JSON.stringify(res.data, null, 2))

        let imgUrl: string | null = res.data?.data?.[0]?.url || null
        if (!imgUrl) {
          const contentText = res.data?.choices?.[0]?.message?.content || ''
          imgUrl = getImageUrlFromContent(contentText)
          if (imgUrl) {
            result = { url: imgUrl }
          } else if (contentText && typeof contentText === 'string' && contentText.trim().length > 0) {
            result = { text: contentText.trim() }
          }
        } else {
          result = { url: imgUrl }
        }

        usedApiType = 'chat'
      } else if (apiType === 'images' || apiType === 'auto') {
        // 强制图像模式 或 自动模式：尝试图像API
        // 注意：标准图像API可能不支持参考图，这里尝试传入
        const processedUrl = await processImageUrl(imageUrls[0])
        if (!processedUrl) {
          await safeSend(session, cfg.messages.fail + '（图片处理失败）')
          return
        }
        const imagesRes = await tryImagesApi(session, finalPrompt, processedUrl, api, model, subModel)
        if (imagesRes.success) {
          result = imagesRes.result
          usedApiType = 'images'
        } else if (apiType === 'auto' && imagesRes.error === 'not_supported') {
          // 回退到聊天API
          const chatRes = await tryChatApi(session, finalPrompt, processedUrl, api, model)
          if (chatRes.success) {
            result = chatRes.result
            usedApiType = 'chat'
          } else {
            throw new Error(chatRes.error || '聊天API失败')
          }
        } else {
          throw new Error(imagesRes.error || '图像生成API失败')
        }
      }

      // 处理结果
      if (result?.url || result?.base64) {
        const imgUrl = result.base64 || result.url
        await sendImage(session, imgUrl)
      } else if (result?.text) {
        const msg = cfg.messages.modelTextOnly.replace('{text}', result.text.slice(0, 500))
        await safeSend(session, msg)
      } else {
        await safeSend(session, cfg.messages.fail + '（未返回任何内容）')
      }
    } catch (err) {
      const reason = getErrorMessage(err)
      logger.error(`多图API请求失败 [${reason}]`, err)
      await safeSend(session, `${cfg.messages.fail} [${reason}]`)
    } finally {
      deleteAllCachedFiles(imageUrls)
    }
  }

  // ==================== 新增：处理带图片的合并消息 ====================
  async function processImg2ImgWithImages(session: any, prompt: string, images: any[], subModel?: any): Promise<void> {
    const assets = ctx.assets
    if (!assets) {
      await safeSend(session, cfg.messages.needAssets)
      return
    }

    // 上传所有图片
    const uploadResults = await Promise.allSettled(
      images.map(img => assets.upload(img.attrs.src, 'ref_image.jpg'))
    )

    const imageUrls: string[] = []
    for (const res of uploadResults) {
      if (res.status === 'fulfilled' && /^https?:\/\//.test(res.value as string)) {
        imageUrls.push(res.value as string)
      }
    }

    if (imageUrls.length === 0) {
      await safeSend(session, cfg.messages.needAssets)
      return
    }

    // 限制图片数量
    const finalUrls = imageUrls.slice(0, cfg.maxImages)
    if (finalUrls.length < imageUrls.length) {
      logger.warn(`图片数量超过限制，已截取前 ${cfg.maxImages} 张`)
    }

    // 构建 prompt
    const finalPrompt = cfg.img2imgPrompt
      .replace('{url}', finalUrls.join(', '))
      .replace('{prompt}', prompt)

    await safeSend(session, cfg.messages.generating)
    await generateWithMultipleImages(session, finalPrompt, finalUrls, subModel, 'img2img')
  }

  // ==================== 新增：从 session.elements 提取纯文本 ====================
  function extractTextFromElements(elements: any[]): string {
    if (!elements || !Array.isArray(elements)) return ''
    const textParts: string[] = []
    for (const el of elements) {
      if (el.type === 'text') {
        textParts.push(el.attrs?.content || el.attrs?.text || '')
      }
    }
    return cleanHtmlTags(textParts.join(' '))
  }

  // ==================== 新增：文生图核心逻辑（支持预置提示词，仅主模型）====================
  async function doTxt2Img(session: any, rawPrompt: string, explicitPresets?: any[], subModel?: any): Promise<void> {
    if (!session) return
    if (await isBlacklisted(session.userId)) {
      await safeSend(session, cfg.messages.blacklisted)
      return
    }
    if (!cfg.enableTxt2Img) {
      await safeSend(session, cfg.messages.txt2imgDisabled)
      return
    }

    let prompt = cleanHtmlTags(rawPrompt || '')
    if (!prompt) {
      await safeSend(session, cfg.messages.empty)
      return
    }

    // 处理预置提示词（指令触发仅主模型文生图可用，关键词匹配任何生图都可用）
    const appliedPresets: any[] = []

    // 1. 显式指定的预置提示词（通过指令触发）—— 仅主模型文生图
    if (!subModel && explicitPresets && explicitPresets.length > 0) {
      appliedPresets.push(...explicitPresets)
    }

    // 2. 关键词匹配 —— 任何生图都可用（主模型/副模型、文生图/图生图）
    if (cfg.enablePresets) {
      const keywordPresets = findPresetsByKeyword(prompt)
      for (const kp of keywordPresets) {
        // 避免重复添加
        if (!appliedPresets.some((p: any) => p.text === kp.text)) {
          appliedPresets.push(kp)
        }
      }
    }

    // 拼接预置提示词
    if (appliedPresets.length > 0) {
      prompt = buildPromptWithPresets(prompt, appliedPresets)
      if (debug) {
        logger.info(`应用预置提示词: ${appliedPresets.map((p: any) => p.command || 'keyword').join(', ')}`)
        logger.info(`最终 prompt: ${prompt.slice(0, 200)}...`)
      }
    }

    await safeSend(session, cfg.messages.generating)
    const finalPrompt = cfg.txt2imgPrompt.replace('{prompt}', prompt)
    const model = getModel(subModel, 'txt2img')
    await generate(session, finalPrompt, undefined, subModel, 'txt2img')
  }
  // ==========================================================

  // ==================== 新增：图生图核心逻辑 ====================
  async function doImg2Img(session: any, rawPrompt: string, subModel?: any): Promise<void> {
    if (!session) return
    if (await isBlacklisted(session.userId)) {
      await safeSend(session, cfg.messages.blacklisted)
      return
    }
    if (!cfg.enableImg2Img) {
      await safeSend(session, cfg.messages.img2imgDisabled)
      return
    }

    let prompt = ''
    if (session.elements && session.elements.length > 0) {
      prompt = extractTextFromElements(session.elements)
      if (debug) logger.info('从 elements 提取的 prompt:', prompt)
    }
    if (!prompt && rawPrompt) {
      prompt = cleanHtmlTags(rawPrompt)
    }

    // 检查消息中是否包含图片（QQ 合并消息）
    const messageImages = session.elements ? h.select(session.elements, 'img') : []

    if (messageImages.length > 0) {
      // 合并消息：同时包含文字和图片，直接处理
      if (debug) logger.info(`检测到合并消息，包含 ${messageImages.length} 张图片，prompt: "${prompt}"`)
      if (!prompt) {
        await processImg2ImgWithImages(session, '请根据图片内容进行编辑', messageImages, subModel)
      } else {
        await processImg2ImgWithImages(session, prompt, messageImages, subModel)
      }
      return
    }

    // 处理预置提示词关键词匹配（任何生图都可用）
    if (cfg.enablePresets) {
      const keywordPresets = findPresetsByKeyword(prompt)
      if (keywordPresets.length > 0) {
        prompt = buildPromptWithPresets(prompt, keywordPresets)
        if (debug) {
          logger.info(`图生图应用关键词预置提示词: ${keywordPresets.map((p: any) => p.keyword).join(', ')}`)
          logger.info(`图生图最终 prompt: ${prompt.slice(0, 200)}...`)
        }
      }
    }

    // 传统模式：只发送了文字，进入等待图片状态
    if (!prompt) {
      await safeSend(session, cfg.messages.empty)
      return
    }

    const assets = ctx.assets
    if (!assets) {
      await safeSend(session, cfg.messages.needAssets)
      return
    }

    const key = `${session.guildId || 'private'}-${session.userId}`
    if (waitingMap.has(key)) {
      await safeSend(session, cfg.messages.alreadyWaiting)
      return
    }

    await safeSend(session, cfg.messages.waitImage.replace('60', String(cfg.imgWaitTime)))
    const timer = setTimeout(() => {
      const task = waitingMap.get(key)
      if (!task) return
      waitingMap.delete(key)
      if (task.imageUrls.length > 0) {
        safeSend(session, cfg.messages.generating).catch(() => { })
        generateWithMultipleImages(session, task.prompt, task.imageUrls, task.subModel, 'img2img')
      } else {
        safeSend(session, cfg.messages.timeout).catch(() => { })
      }
    }, cfg.imgWaitTime * 1000)
    waitingMap.set(key, { prompt, timer, imageUrls: [], subModel })
  }
  // ==========================================================

  // ==================== 命令注册 ====================

  // 主文生图指令（主模型）
  const cmd = ctx.command(`${cfg.command} <raw:text>`, 'draw')
  cfg.aliases.forEach((alias: string) => cmd.alias(alias))
  cmd.action(async ({ session }: any, raw: string) => {
    try {
      await doTxt2Img(session, raw)
    } catch (e) {
      logger.error('文生图命令异常', e)
      await safeSend(session, cfg.messages.fail)
    }
  })

  // ==================== 新增：预置提示词指令注册（仅主模型）====================
  if (cfg.enablePresets && cfg.presets) {
    const presets = getEnabledPresets()
    for (let i = 0; i < presets.length; i++) {
      const preset = presets[i]
      const presetCmd = preset.command?.trim() || `preset${i}`

      // 注册指令
      const pCmd = ctx.command(`${presetCmd} <raw:text>`, `使用预置提示词: ${preset.text.slice(0, 20)}...`)
      pCmd.action(async ({ session }: any, raw: string) => {
        try {
          if (debug) logger.info(`预置指令触发: ${presetCmd}, 预置文本: ${preset.text.slice(0, 50)}`)
          await doTxt2Img(session, raw, [preset])
        } catch (e) {
          logger.error(`预置指令 ${presetCmd} 异常`, e)
          await safeSend(session, cfg.messages.fail)
        }
      })

      if (debug) logger.info(`注册预置提示词指令: ${presetCmd}`)
    }
  }
  // ==========================================================

  // ==================== 新增：副模型指令注册 ====================
  if (cfg.subModels && cfg.subModels.length > 0) {
    for (let i = 0; i < cfg.subModels.length; i++) {
      const subModel = cfg.subModels[i]
      if (!subModel.enable) continue

      // 文生图指令
      const subTxtCmd = subModel.txt2imgCommand?.trim() || `draw${i}`
      const subTxtDesc = subModel.name ? `${subModel.name} - 文生图` : `副模型 ${i} - 文生图`
      const stCmd = ctx.command(`${subTxtCmd} <raw:text>`, subTxtDesc)
      stCmd.action(async ({ session }: any, raw: string) => {
        try {
          if (debug) logger.info(`副模型文生图指令触发: ${subTxtCmd}, 模型: ${subModel.model || cfg.model}`)
          await doTxt2Img(session, raw, undefined, subModel)
        } catch (e) {
          logger.error(`副模型文生图指令 ${subTxtCmd} 异常`, e)
          await safeSend(session, cfg.messages.fail)
        }
      })

      // 图生图指令
      const subImgCmd = subModel.img2imgCommand?.trim() || `imgdraw${i}`
      const subImgDesc = subModel.name ? `${subModel.name} - 图生图` : `副模型 ${i} - 图生图`
      const siCmd = ctx.command(`${subImgCmd} <raw:text>`, subImgDesc)
      siCmd.action(async ({ session }: any, raw: string) => {
        try {
          if (debug) logger.info(`副模型图生图指令触发: ${subImgCmd}, 模型: ${subModel.model || cfg.model}`)
          await doImg2Img(session, raw, subModel)
        } catch (e) {
          logger.error(`副模型图生图指令 ${subImgCmd} 异常`, e)
          await safeSend(session, cfg.messages.fail)
        }
      })

      if (debug) logger.info(`注册副模型指令: 文生图=${subTxtCmd}, 图生图=${subImgCmd}`)
    }
  }
  // ==========================================================

  // ==================== 修改：图生图命令支持合并消息（主模型）====================
  const imgCmd = ctx.command(`${cfg.img2imgCommand} <raw:text>`, 'imgdraw')
  cfg.img2imgAliases.forEach((alias: string) => imgCmd.alias(alias))

  // 修改 action 以支持检测消息中的图片
  imgCmd.action(async ({ session }: any, raw: string) => {
    try {
      await doImg2Img(session, raw)
    } catch (e) {
      logger.error('图生图命令异常', e)
      await safeSend(session, cfg.messages.fail)
    }
  })

  // ==================== 修改：消息监听支持追加图片 ====================
  ctx.on('message', async (session: any) => {
    try {
      if (!session.elements) return
      if (session.bot?.selfId && session.userId === session.bot.selfId) return

      const key = `${session.guildId || 'private'}-${session.userId}`
      const task = waitingMap.get(key)

      // 如果没有等待任务，检查是否是新的合并消息（已在上面的 imgCmd action 中处理）
      if (!task) return

      const imgs = h.select(session.elements, 'img')
      if (imgs.length > 0) {
        const assets = ctx.assets
        if (!assets) {
          await safeSend(session, cfg.messages.needAssets)
          return
        }
        const uploadResults = await Promise.allSettled(imgs.map((img: any) => assets.upload(img.attrs.src, 'ref_image.jpg')))
        const newUrls: string[] = []
        for (const res of uploadResults) {
          if (res.status === 'fulfilled' && /^https?:\/\//.test(res.value as string)) {
            newUrls.push(res.value as string)
          }
        }
        if (newUrls.length === 0) {
          await safeSend(session, cfg.messages.needAssets)
          return
        }
        task.imageUrls.push(...newUrls)
        if (task.imageUrls.length >= cfg.maxImages) {
          clearTimeout(task.timer)
          waitingMap.delete(key)
          await safeSend(session, cfg.messages.generating)
          await generateWithMultipleImages(session, task.prompt, task.imageUrls, task.subModel, 'img2img')
          return
        }
        clearTimeout(task.timer)
        task.timer = setTimeout(() => {
          waitingMap.delete(key)
          if (task.imageUrls.length > 0) {
            safeSend(session, cfg.messages.generating).catch(() => { })
            generateWithMultipleImages(session, task.prompt, task.imageUrls, task.subModel, 'img2img')
          } else {
            safeSend(session, cfg.messages.timeout).catch(() => { })
          }
        }, cfg.imgWaitTime * 1000)
        await safeSend(session, cfg.messages.multiImageReceived.replace('{count}', String(task.imageUrls.length)))
        return
      }

      const text = session.content?.trim()
      if (text === '完成' || text === 'done' || text === '生成') {
        clearTimeout(task.timer)
        waitingMap.delete(key)
        if (task.imageUrls.length > 0) {
          await safeSend(session, cfg.messages.generating)
          await generateWithMultipleImages(session, task.prompt, task.imageUrls, task.subModel, 'img2img')
        } else {
          await safeSend(session, cfg.messages.noImageReceived)
        }
      }
    } catch (e) {
      logger.error('消息监听异常', e)
      await safeSend(session, cfg.messages.fail)
    }
  })

  // ==================== 黑名单命令 ====================
  const blacklistCmd = ctx.command('blacklist', 'blacklist')
  blacklistCmd.subcommand('.list', 'blacklist.list').action(async ({ session }: any) => {
    if (!session) return
    if (!cfg.blacklistAdmins.includes(session.userId)) {
      return safeSend(session, cfg.messages.noPermission)
    }
    try {
      const entries = await ctx.database.get('ai_image_blacklist', {})
      if (entries.length === 0) {
        return safeSend(session, cfg.messages.blacklistListEmpty)
      }
      const list = entries.map((e: any) => e.id).join('\n')
      return safeSend(session, `${cfg.messages.blacklistListTitle}\n${list}`)
    } catch (e) {
      logger.error('获取黑名单失败', e)
      return safeSend(session, cfg.messages.fail)
    }
  })

  blacklistCmd.subcommand('.add <...targets:string>', 'blacklist.add').action(async ({ session }: any, ...targets: string[]) => {
    if (!session) return
    if (!cfg.blacklistAdmins.includes(session.userId)) {
      return safeSend(session, cfg.messages.noPermission)
    }
    const ids: string[] = []
    targets.forEach(t => {
      const num = t.replace(/\D/g, '')
      if (num) ids.push(num)
    })
    if (ids.length === 0) {
      return safeSend(session, '请提供有效的QQ号')
    }
    const invalid = ids.filter(id => !isValidQQ(id))
    if (invalid.length > 0) {
      return safeSend(session, cfg.messages.invalidUserId.replace('{targets}', invalid.join(', ')))
    }
    const { success, fail } = await addToBlacklist(ids)
    if (success.length) {
      await safeSend(session, cfg.messages.blacklistAddSuccess.replace('{targets}', success.join(', ')))
    }
    if (fail.length) {
      await safeSend(session, cfg.messages.blacklistAddFail.replace('{targets}', fail.join(', ')))
    }
  })

  blacklistCmd.subcommand('.remove <...targets:string>', 'blacklist.remove').action(async ({ session }: any, ...targets: string[]) => {
    if (!session) return
    if (!cfg.blacklistAdmins.includes(session.userId)) {
      return safeSend(session, cfg.messages.noPermission)
    }
    const ids: string[] = []
    targets.forEach(t => {
      const num = t.replace(/\D/g, '')
      if (num) ids.push(num)
    })
    if (ids.length === 0) {
      return safeSend(session, '请提供有效的QQ号')
    }
    const invalid = ids.filter(id => !isValidQQ(id))
    if (invalid.length > 0) {
      return safeSend(session, cfg.messages.invalidUserId.replace('{targets}', invalid.join(', ')))
    }
    const { success, fail } = await removeFromBlacklist(ids)
    if (success.length) {
      await safeSend(session, cfg.messages.blacklistRemoveSuccess.replace('{targets}', success.join(', ')))
    }
    if (fail.length) {
      await safeSend(session, cfg.messages.blacklistRemoveFail.replace('{targets}', fail.join(', ')))
    }
  })
}

