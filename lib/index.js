"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.MessageConfig = exports.PresetConfig = exports.BaseConfig = exports.inject = exports.name = void 0;
exports.apply = apply;
const koishi_1 = require("koishi");
const axios_1 = __importDefault(require("axios"));
const yaml_1 = __importDefault(require("yaml"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// 尝试导入 sharp，如果未安装则给出提示
let sharp;
try {
    sharp = require('sharp');
}
catch {
    sharp = null;
}
exports.name = 'ai-image';
exports.inject = {
    required: ['console', 'i18n', 'database'],
    optional: ['assets'],
};
const logger = new koishi_1.Logger('ai-image');
// ==================== 预置提示词单项配置 ====================
const PresetItem = koishi_1.Schema.object({
    enable: koishi_1.Schema.boolean().default(true).description('启用此预置提示词'),
    text: koishi_1.Schema.string().default('').description('预置提示词文本（将自动添加到 prompt 前）'),
    command: koishi_1.Schema.string().default('').description('触发指令（如 draw0，留空则自动生成 drawN）'),
    keyword: koishi_1.Schema.string().default('').description('匹配关键词（如 猫娘，留空则不启用关键词匹配）'),
    enableKeywordMatch: koishi_1.Schema.boolean().default(false).description('启用关键词匹配（用户 prompt 包含关键词时自动添加）'),
}).description('预置提示词配置项');
// ==================== 独立大类 1：AI 绘图插件配置 ====================
exports.BaseConfig = koishi_1.Schema.object({
    debug: koishi_1.Schema.boolean().default(false).description('开启调试模式，输出完整请求日志'),
    apiStrategy: koishi_1.Schema.union([
        koishi_1.Schema.const('sequence').description('顺序模式'),
        koishi_1.Schema.const('roundrobin').description('负载均衡模式'),
    ]).default('roundrobin').description('API 调度策略'),
    timeout: koishi_1.Schema.number().default(300000).description('接口请求超时时间（毫秒）'),
    rateLimit: koishi_1.Schema.number().default(200).description('每小时调用次数限制'),
    imgWaitTime: koishi_1.Schema.number().default(60).description('图生图等待图片超时时间（秒）'),
    model: koishi_1.Schema.string().default('gpt-4o-mini').description('通用模型名称'),
    txt2imgModel: koishi_1.Schema.string().default('').description('文生图专用模型，留空则使用通用模型'),
    img2imgModel: koishi_1.Schema.string().default('').description('图生图专用模型，留空则使用通用模型'),
    maxImages: koishi_1.Schema.number().default(5).description('图生图最大支持图片数量'),
    // ==================== 图片压缩配置 ====================
    enableImgCompress: koishi_1.Schema.boolean().default(true).description('启用图生图图片压缩（推荐开启，可防止大图超时）'),
    imgMaxWidth: koishi_1.Schema.number().default(1536).description('图片压缩最大宽度（像素）'),
    imgMaxHeight: koishi_1.Schema.number().default(1536).description('图片压缩最大高度（像素）'),
    imgQuality: koishi_1.Schema.number().default(85).description('JPEG 压缩质量 1-100（越高越清晰，建议 80-90）'),
    imgMaxFileSize: koishi_1.Schema.number().default(3).description('图片最大体积（MB），超过会进一步压缩'),
    // ==========================================================
    // ==================== 图生图 base64 转换开关 ====================
    enableImg2ImgBase64: koishi_1.Schema.boolean().default(true).description('图生图将图片转换为 base64（关闭则直接传 URL，部分 API 不需要 base64）'),
    // ==========================================================
    apiList: koishi_1.Schema.array(koishi_1.Schema.object({
        enable: koishi_1.Schema.boolean().default(true).description('启用此 API'),
        apiKey: koishi_1.Schema.string().description('API Key'),
        baseUrl: koishi_1.Schema.string().description('接口地址，需符合 OpenAI 标准'),
    })).default([]).description('API 配置列表（支持多账号负载）'),
    enableTxt2Img: koishi_1.Schema.boolean().default(true).description('启用文生图'),
    enableImg2Img: koishi_1.Schema.boolean().default(true).description('启用图生图'),
    command: koishi_1.Schema.string().default('draw').description('文生图主指令'),
    aliases: koishi_1.Schema.array(String).default([]).description('文生图指令别名'),
    img2imgCommand: koishi_1.Schema.string().default('imgdraw').description('图生图指令'),
    img2imgAliases: koishi_1.Schema.array(String).default([]).description('图生图指令别名'),
    txt2imgPrompt: koishi_1.Schema.string().default('请严格遵循我的要求生成一张图片，不要询问或添加额外说明，直接输出图片。你可以使用联网功能获取最新的数据或信息。要求：{prompt}').description('文生图提示词模板'),
    img2imgPrompt: koishi_1.Schema.string().default('图片链接：{url} 请严格根据以下指令对提供的图片进行编辑或重绘，不要询问，直接输出结果。你可以使用联网功能获取最新的数据或信息。\n指令：{prompt}').description('图生图提示词模板'),
    blacklistAdmins: koishi_1.Schema.array(String).default([]).description('允许管理黑名单的 QQ 号列表'),
}).description('AI 绘图插件配置');
// ==================== 独立大类 2：预置提示词配置 ====================
exports.PresetConfig = koishi_1.Schema.object({
    enablePresets: koishi_1.Schema.boolean().default(false).description('启用预置提示词功能（仅用于文生图）'),
    presets: koishi_1.Schema.array(PresetItem).default([]).description('预置提示词列表（可添加多个，支持指令触发和关键词匹配）'),
}).description('预置提示词配置');
// ==================== 独立大类 3：提示文案配置 ====================
exports.MessageConfig = koishi_1.Schema.object({
    messages: koishi_1.Schema.object({
        generating: koishi_1.Schema.string().default('⏳ 生成中...'),
        waitImage: koishi_1.Schema.string().default('请在60秒内发送需要编辑的图片'),
        timeout: koishi_1.Schema.string().default('等待图片超时，已取消'),
        empty: koishi_1.Schema.string().default('❌ 请输入提示词'),
        noApi: koishi_1.Schema.string().default('❌ 未配置可用API'),
        fail: koishi_1.Schema.string().default('❌ 生成失败'),
        modelTextOnly: koishi_1.Schema.string().default('❌ 模型未生成图片，返回文字：{text}'),
        needAssets: koishi_1.Schema.string().default('❌ 图生图需要正确配置 assets 服务（selfUrl 未正确设置或服务未启动）'),
        txt2imgDisabled: koishi_1.Schema.string().default('❌ 文生图功能未启用'),
        img2imgDisabled: koishi_1.Schema.string().default('❌ 图生图功能未启用'),
        rateLimit: koishi_1.Schema.string().default('❌ 调用次数已达上限，请稍后再试'),
        alreadyWaiting: koishi_1.Schema.string().default('你已在等待发送图片，请直接发送图片或等待超时'),
        multiImageReceived: koishi_1.Schema.string().default('已收到 {count} 张图片，可继续发送或输入"完成"开始生成'),
        multiImageLimit: koishi_1.Schema.string().default('已达到最大图片数量，自动开始生成'),
        noImageReceived: koishi_1.Schema.string().default('未发送任何图片'),
        blacklisted: koishi_1.Schema.string().default('❌ 你已被加入黑名单，无法使用绘图功能'),
        noPermission: koishi_1.Schema.string().default('❌ 你没有权限管理黑名单'),
        blacklistAddSuccess: koishi_1.Schema.string().default('✅ 已将 {targets} 加入黑名单'),
        blacklistRemoveSuccess: koishi_1.Schema.string().default('✅ 已将 {targets} 移出黑名单'),
        blacklistAddFail: koishi_1.Schema.string().default('⚠️ {targets} 已在黑名单中或无效'),
        blacklistRemoveFail: koishi_1.Schema.string().default('⚠️ {targets} 不在黑名单中'),
        invalidUserId: koishi_1.Schema.string().default('⚠️ 无效的QQ号：{targets}'),
        blacklistListEmpty: koishi_1.Schema.string().default('✅ 当前黑名单为空'),
        blacklistListTitle: koishi_1.Schema.string().default('📋 当前黑名单：'),
    }).description('提示文案配置'),
}).description('提示文案配置');
// ==================== 组合配置（三个并列大类）====================
exports.Config = koishi_1.Schema.intersect([
    exports.BaseConfig,
    exports.PresetConfig,
    exports.MessageConfig,
]);
// ==================== 主函数 ====================
async function apply(ctx, cfg) {
    const debug = cfg.debug;
    // 检查 sharp 是否安装
    if (cfg.enableImgCompress && !sharp) {
        logger.warn('图片压缩已启用，但未检测到 sharp 库。请运行：npm install sharp');
        logger.warn('在未安装 sharp 的情况下，将跳过压缩，可能导致大图超时');
    }
    // 加载本地化文件
    try {
        const loc = path_1.default.join(__dirname, 'locales', 'zh-CN.yml');
        if (fs_1.default.existsSync(loc)) {
            ctx.i18n.define('zh-CN', yaml_1.default.parse(fs_1.default.readFileSync(loc, 'utf8')));
        }
    }
    catch { }
    const waitingMap = new Map();
    const apiIdx = { val: 0 };
    const apiCallTimestamps = [];
    // 扩展数据库表
    ctx.model.extend('ai_image_blacklist', {
        id: 'string',
        createdAt: 'date',
    }, {
        primary: 'id',
    });
    // 清理定时器
    ctx.on('dispose', () => {
        for (const [, task] of waitingMap) {
            clearTimeout(task.timer);
        }
        waitingMap.clear();
    });
    // ==================== 工具函数 ====================
    function checkRateLimit() {
        const now = Date.now();
        const oneHourAgo = now - 3600000;
        while (apiCallTimestamps.length > 0 && apiCallTimestamps[0] < oneHourAgo) {
            apiCallTimestamps.shift();
        }
        return apiCallTimestamps.length < cfg.rateLimit;
    }
    function recordApiCall() {
        apiCallTimestamps.push(Date.now());
    }
    function getApi() {
        const list = cfg.apiList.filter((v) => v.enable && v.apiKey && v.baseUrl);
        if (!list.length)
            return null;
        if (cfg.apiStrategy === 'sequence')
            return list[0];
        const api = list[apiIdx.val % list.length];
        apiIdx.val++;
        return api;
    }
    // ==================== 修复：增强 HTML/XML 清理 ====================
    function cleanHtmlTags(str) {
        if (!str)
            return '';
        // 1. 清理标准 HTML 标签
        let cleaned = str.replace(/<[^>]+>/g, ' ');
        // 2. 清理 QQ XML 图片标签（如 <img src="..." file="..."/>）
        cleaned = cleaned.replace(/<img\s+[^>]+\/>/gi, ' ');
        // 3. 清理其他 XML 标签
        cleaned = cleaned.replace(/<[^>]+>/g, ' ');
        // 4. 清理多余空格和换行
        cleaned = cleaned.replace(/\s+/g, ' ').trim();
        return cleaned;
    }
    // 增强图片提取函数
    function getImageUrlFromContent(text) {
        if (!text)
            return null;
        const httpReg = /https?:\/\/[^<> \n\r()\[\]]+\.(png|jpg|jpeg|gif|webp)/i;
        const httpMatch = text.match(httpReg);
        if (httpMatch)
            return httpMatch[0];
        const base64Reg = /data:image\/(png|jpg|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+/;
        const base64Match = text.match(base64Reg);
        if (base64Match)
            return base64Match[0];
        const markdownReg = /!\[.*?\]\((.*?)\)/;
        const markdownMatch = text.match(markdownReg);
        if (markdownMatch)
            return markdownMatch[1];
        return null;
    }
    // ==================== 图片压缩函数 ====================
    async function compressImage(buffer) {
        if (!sharp || !cfg.enableImgCompress) {
            return buffer;
        }
        try {
            let image = sharp(buffer);
            const metadata = await image.metadata();
            // 计算缩放比例
            let width = metadata.width || cfg.imgMaxWidth;
            let height = metadata.height || cfg.imgMaxHeight;
            const ratio = Math.min(cfg.imgMaxWidth / width, cfg.imgMaxHeight / height, 1 // 不放大
            );
            if (ratio < 1) {
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
                image = image.resize(width, height, { fit: 'inside' });
            }
            // 压缩并转换格式
            let quality = Math.max(1, Math.min(100, cfg.imgQuality));
            let compressed = await image
                .jpeg({ quality, progressive: true, mozjpeg: true })
                .toBuffer();
            // 如果还超过限制，进一步降低质量
            const maxBytes = cfg.imgMaxFileSize * 1024 * 1024;
            while (compressed.length > maxBytes && quality > 40) {
                quality -= 5;
                compressed = await image
                    .jpeg({ quality, progressive: true, mozjpeg: true })
                    .toBuffer();
            }
            if (debug) {
                logger.info(`图片压缩: ${buffer.length} -> ${compressed.length} bytes ` +
                    `(${Math.round(compressed.length / buffer.length * 100)}%), ` +
                    `尺寸: ${Math.round(width)}x${Math.round(height)}, 质量: ${quality}`);
            }
            return compressed;
        }
        catch (e) {
            logger.error('图片压缩失败，使用原图', e);
            return buffer;
        }
    }
    async function compressBase64Image(base64Url) {
        if (!sharp || !cfg.enableImgCompress) {
            return base64Url;
        }
        try {
            const base64Data = base64Url.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const compressed = await compressImage(buffer);
            return `data:image/jpeg;base64,${compressed.toString('base64')}`;
        }
        catch (e) {
            logger.error('base64 图片压缩失败，使用原图', e);
            return base64Url;
        }
    }
    // ==========================================================
    // ==================== 修改：URL 转 base64（支持开关）====================
    /**
     * 处理图片 URL，根据配置决定返回 base64 还是原始 URL
     * @param url 图片 URL
     * @param forceBase64 强制使用 base64（覆盖全局配置）
     */
    async function processImageUrl(url, forceBase64) {
        if (!url)
            return null;
        // 如果已经是 base64，检查是否需要压缩
        if (url.startsWith('data:image/')) {
            if (cfg.enableImgCompress && sharp) {
                return await compressBase64Image(url);
            }
            return url;
        }
        // 判断是否转换为 base64
        const needBase64 = forceBase64 !== undefined ? forceBase64 : cfg.enableImg2ImgBase64;
        if (!needBase64) {
            // 直接返回 URL（不转换 base64）
            if (debug)
                logger.info('图生图使用原始 URL:', url.slice(0, 100));
            return url;
        }
        // 转换为 base64
        try {
            const res = await axios_1.default.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000,
            });
            const compressed = await compressImage(Buffer.from(res.data));
            return `data:image/jpeg;base64,${compressed.toString('base64')}`;
        }
        catch (e) {
            logger.error('图片转 base64 失败', e);
            throw new Error('图片下载失败，请检查 selfUrl 是否可访问');
        }
    }
    // ==========================================================
    // 统一发送图片函数
    async function sendImage(session, imgUrl) {
        const trimmed = imgUrl.trim();
        if (trimmed.startsWith('data:image/')) {
            if (debug)
                logger.info('发送 base64 图片，长度:', trimmed.length);
            await safeSend(session, (0, koishi_1.h)('img', { src: trimmed }));
        }
        else if (/^https?:\/\//.test(trimmed)) {
            if (debug)
                logger.info('发送 URL 图片:', trimmed.slice(0, 100));
            await safeSend(session, koishi_1.segment.image(trimmed));
        }
        else {
            logger.warn('未知的图片格式:', trimmed.slice(0, 100));
            await safeSend(session, cfg.messages.fail + '（图片格式异常）');
        }
    }
    async function safeSend(session, message) {
        try {
            await session.send(message);
        }
        catch (e) {
            logger.error('发送消息失败', e);
        }
    }
    function getErrorMessage(err) {
        if (axios_1.default.isAxiosError(err)) {
            if (err.code === 'ECONNABORTED')
                return '请求超时';
            if (err.code === 'ERR_NETWORK' || err.code?.startsWith('ERR_'))
                return '网络连接失败';
            if (err.response) {
                const status = err.response.status;
                if (status >= 500)
                    return `服务器错误 (${status})`;
                if (status >= 400)
                    return `请求错误 (${status})，请检查 API Key 或参数`;
            }
            return err.message?.slice(0, 100) || '未知网络错误';
        }
        return '未知错误';
    }
    function extractFilenameFromAssetUrl(assetUrl) {
        if (!assetUrl)
            return null;
        try {
            if (assetUrl.startsWith('file://')) {
                return path_1.default.basename(assetUrl.replace('file://', ''));
            }
            const urlObj = new URL(assetUrl);
            const parts = urlObj.pathname.split('/');
            const rawName = parts[parts.length - 1] || '';
            return rawName ? path_1.default.basename(rawName) : null;
        }
        catch {
            return null;
        }
    }
    function deleteCachedFile(assetUrl) {
        const filename = extractFilenameFromAssetUrl(assetUrl);
        if (!filename)
            return;
        const defaultRoot = path_1.default.join(ctx.baseDir, 'data', 'assets');
        const filePath = path_1.default.join(defaultRoot, filename);
        try {
            if (fs_1.default.existsSync(filePath)) {
                fs_1.default.unlinkSync(filePath);
                if (debug)
                    logger.info('已删除缓存文件:', filePath);
            }
        }
        catch (e) {
            logger.error('删除缓存文件失败', e);
        }
    }
    function deleteAllCachedFiles(urls) {
        for (const url of urls) {
            deleteCachedFile(url);
        }
    }
    function isValidQQ(id) {
        return /^\d{5,11}$/.test(id);
    }
    async function isBlacklisted(userId) {
        try {
            const rows = await ctx.database.get('ai_image_blacklist', { id: userId });
            return rows.length > 0;
        }
        catch (e) {
            logger.error('查询黑名单失败', e);
            return false;
        }
    }
    async function addToBlacklist(ids) {
        const success = [];
        const fail = [];
        for (const id of ids) {
            if (!isValidQQ(id)) {
                fail.push(id);
                continue;
            }
            try {
                const exists = await ctx.database.get('ai_image_blacklist', { id });
                if (exists.length === 0) {
                    await ctx.database.create('ai_image_blacklist', { id, createdAt: new Date() });
                    success.push(id);
                }
                else {
                    fail.push(id);
                }
            }
            catch (e) {
                logger.error('添加黑名单失败', e);
                fail.push(id);
            }
        }
        return { success, fail };
    }
    async function removeFromBlacklist(ids) {
        const success = [];
        const fail = [];
        for (const id of ids) {
            if (!isValidQQ(id)) {
                fail.push(id);
                continue;
            }
            try {
                const exists = await ctx.database.get('ai_image_blacklist', { id });
                if (exists.length > 0) {
                    await ctx.database.remove('ai_image_blacklist', { id });
                    success.push(id);
                }
                else {
                    fail.push(id);
                }
            }
            catch (e) {
                logger.error('移除黑名单失败', e);
                fail.push(id);
            }
        }
        return { success, fail };
    }
    // ==================== 预置提示词处理函数 ====================
    /**
     * 获取所有启用的预置提示词配置
     */
    function getEnabledPresets() {
        if (!cfg.enablePresets || !cfg.presets)
            return [];
        return cfg.presets.filter((p) => p.enable && p.text);
    }
    /**
     * 根据指令名查找匹配的预置提示词
     * @param cmd 指令名，如 "draw0"
     */
    function findPresetByCommand(cmd) {
        const presets = getEnabledPresets();
        for (const preset of presets) {
            const presetCmd = preset.command?.trim();
            if (presetCmd && presetCmd === cmd) {
                return preset;
            }
        }
        return null;
    }
    /**
     * 根据用户 prompt 关键词匹配预置提示词
     * @param prompt 用户输入的 prompt
     */
    function findPresetsByKeyword(prompt) {
        const presets = getEnabledPresets();
        const matched = [];
        if (!prompt)
            return matched;
        const lowerPrompt = prompt.toLowerCase();
        for (const preset of presets) {
            if (preset.enableKeywordMatch && preset.keyword) {
                const keywords = preset.keyword.split(/[,，|\/\s]+/).map((k) => k.trim().toLowerCase()).filter(Boolean);
                for (const kw of keywords) {
                    if (lowerPrompt.includes(kw)) {
                        matched.push(preset);
                        break;
                    }
                }
            }
        }
        return matched;
    }
    /**
     * 拼接预置提示词和用户 prompt
     * @param prompt 用户输入的原始 prompt
     * @param presets 要应用的预置提示词列表
     */
    function buildPromptWithPresets(prompt, presets) {
        if (!presets || presets.length === 0)
            return prompt;
        const presetTexts = presets.map((p) => p.text.trim()).filter(Boolean);
        if (presetTexts.length === 0)
            return prompt;
        const combinedPreset = presetTexts.join('，');
        // 预置提示词放在前面，用户 prompt 在后面
        return `${combinedPreset}，${prompt}`;
    }
    // ==========================================================
    // ==================== 核心生成函数 ====================
    async function generate(session, prompt, imageUrl, modelOverride) {
        if (!checkRateLimit()) {
            await safeSend(session, cfg.messages.rateLimit);
            return;
        }
        const api = getApi();
        if (!api) {
            if (debug)
                logger.info('无可用API');
            await safeSend(session, cfg.messages.noApi);
            return;
        }
        const model = modelOverride || cfg.model;
        let content;
        if (imageUrl) {
            const processedUrl = await processImageUrl(imageUrl);
            if (!processedUrl) {
                await safeSend(session, cfg.messages.fail + '（图片处理失败）');
                return;
            }
            content = [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: processedUrl } },
            ];
        }
        else {
            content = prompt;
        }
        const body = {
            model,
            messages: [{ role: 'user', content }],
        };
        if (debug)
            logger.info('请求体:', JSON.stringify(body, null, 2));
        try {
            recordApiCall();
            const res = await axios_1.default.post(api.baseUrl, body, {
                headers: { Authorization: `Bearer ${api.apiKey}` },
                timeout: cfg.timeout,
            });
            if (debug)
                logger.info('API返回:', JSON.stringify(res.data, null, 2));
            let imgUrl = res.data?.data?.[0]?.url || null;
            if (!imgUrl) {
                const contentText = res.data?.choices?.[0]?.message?.content || '';
                imgUrl = getImageUrlFromContent(contentText);
            }
            if (imgUrl) {
                await sendImage(session, imgUrl);
            }
            else {
                const textContent = res.data?.choices?.[0]?.message?.content;
                if (textContent && typeof textContent === 'string' && textContent.trim().length > 0) {
                    const msg = cfg.messages.modelTextOnly.replace('{text}', textContent.trim().slice(0, 500));
                    await safeSend(session, msg);
                }
                else {
                    await safeSend(session, cfg.messages.fail + '（未返回任何内容）');
                }
            }
        }
        catch (err) {
            const reason = getErrorMessage(err);
            logger.error(`API请求失败 [${reason}]`, err);
            await safeSend(session, `${cfg.messages.fail} [${reason}]`);
        }
    }
    async function generateWithMultipleImages(session, prompt, imageUrls, modelOverride) {
        if (!checkRateLimit()) {
            await safeSend(session, cfg.messages.rateLimit);
            return;
        }
        const api = getApi();
        if (!api) {
            if (debug)
                logger.info('无可用API');
            await safeSend(session, cfg.messages.noApi);
            return;
        }
        const model = modelOverride || cfg.model;
        const finalPrompt = prompt.replace('{url}', imageUrls.join(', '));
        const processedUrls = (await Promise.all(imageUrls.map(url => processImageUrl(url)))).filter((url) => url !== null);
        if (processedUrls.length === 0) {
            await safeSend(session, cfg.messages.fail + '（图片处理失败）');
            return;
        }
        const content = [
            { type: 'text', text: finalPrompt },
            ...processedUrls.map(url => ({ type: 'image_url', image_url: { url } })),
        ];
        const body = {
            model,
            messages: [{ role: 'user', content }],
        };
        if (debug)
            logger.info('多图请求体:', JSON.stringify(body, null, 2));
        try {
            recordApiCall();
            const res = await axios_1.default.post(api.baseUrl, body, {
                headers: { Authorization: `Bearer ${api.apiKey}` },
                timeout: cfg.timeout,
            });
            if (debug)
                logger.info('API返回:', JSON.stringify(res.data, null, 2));
            let imgUrl = res.data?.data?.[0]?.url || null;
            if (!imgUrl) {
                const contentText = res.data?.choices?.[0]?.message?.content || '';
                imgUrl = getImageUrlFromContent(contentText);
            }
            if (imgUrl) {
                await sendImage(session, imgUrl);
            }
            else {
                const textContent = res.data?.choices?.[0]?.message?.content;
                if (textContent && typeof textContent === 'string' && textContent.trim().length > 0) {
                    const msg = cfg.messages.modelTextOnly.replace('{text}', textContent.trim().slice(0, 500));
                    await safeSend(session, msg);
                }
                else {
                    await safeSend(session, cfg.messages.fail + '（未返回任何内容）');
                }
            }
        }
        catch (err) {
            const reason = getErrorMessage(err);
            logger.error(`API请求失败 [${reason}]`, err);
            await safeSend(session, `${cfg.messages.fail} [${reason}]`);
        }
        finally {
            deleteAllCachedFiles(imageUrls);
        }
    }
    // ==================== 新增：处理带图片的合并消息 ====================
    async function processImg2ImgWithImages(session, prompt, images) {
        const assets = ctx.assets;
        if (!assets) {
            await safeSend(session, cfg.messages.needAssets);
            return;
        }
        // 上传所有图片
        const uploadResults = await Promise.allSettled(images.map(img => assets.upload(img.attrs.src, 'ref_image.jpg')));
        const imageUrls = [];
        for (const res of uploadResults) {
            if (res.status === 'fulfilled' && /^https?:\/\//.test(res.value)) {
                imageUrls.push(res.value);
            }
        }
        if (imageUrls.length === 0) {
            await safeSend(session, cfg.messages.needAssets);
            return;
        }
        // 限制图片数量
        const finalUrls = imageUrls.slice(0, cfg.maxImages);
        if (finalUrls.length < imageUrls.length) {
            logger.warn(`图片数量超过限制，已截取前 ${cfg.maxImages} 张`);
        }
        // 构建 prompt
        const finalPrompt = cfg.img2imgPrompt
            .replace('{url}', finalUrls.join(', '))
            .replace('{prompt}', prompt);
        await safeSend(session, cfg.messages.generating);
        await generateWithMultipleImages(session, finalPrompt, finalUrls, cfg.img2imgModel || cfg.model);
    }
    // ==================== 新增：从 session.elements 提取纯文本 ====================
    function extractTextFromElements(elements) {
        if (!elements || !Array.isArray(elements))
            return '';
        const textParts = [];
        for (const el of elements) {
            if (el.type === 'text') {
                textParts.push(el.attrs?.content || el.attrs?.text || '');
            }
        }
        return cleanHtmlTags(textParts.join(' '));
    }
    // ==================== 新增：文生图核心逻辑（支持预置提示词）====================
    async function doTxt2Img(session, rawPrompt, explicitPresets) {
        if (!session)
            return;
        if (await isBlacklisted(session.userId)) {
            await safeSend(session, cfg.messages.blacklisted);
            return;
        }
        if (!cfg.enableTxt2Img) {
            await safeSend(session, cfg.messages.txt2imgDisabled);
            return;
        }
        let prompt = cleanHtmlTags(rawPrompt || '');
        if (!prompt) {
            await safeSend(session, cfg.messages.empty);
            return;
        }
        // 处理预置提示词
        const appliedPresets = [];
        // 1. 显式指定的预置提示词（通过指令触发）
        if (explicitPresets && explicitPresets.length > 0) {
            appliedPresets.push(...explicitPresets);
        }
        // 2. 关键词匹配（仅在未通过指令触发时，或允许叠加时）
        if (cfg.enablePresets) {
            const keywordPresets = findPresetsByKeyword(prompt);
            for (const kp of keywordPresets) {
                // 避免重复添加
                if (!appliedPresets.some((p) => p.text === kp.text)) {
                    appliedPresets.push(kp);
                }
            }
        }
        // 拼接预置提示词
        if (appliedPresets.length > 0) {
            prompt = buildPromptWithPresets(prompt, appliedPresets);
            if (debug) {
                logger.info(`应用预置提示词: ${appliedPresets.map((p) => p.command || 'keyword').join(', ')}`);
                logger.info(`最终 prompt: ${prompt.slice(0, 200)}...`);
            }
        }
        await safeSend(session, cfg.messages.generating);
        const finalPrompt = cfg.txt2imgPrompt.replace('{prompt}', prompt);
        const model = cfg.txt2imgModel || cfg.model;
        await generate(session, finalPrompt, undefined, model);
    }
    // ==========================================================
    // ==================== 命令注册 ====================
    // 主文生图指令
    const cmd = ctx.command(`${cfg.command} <raw:text>`, 'draw');
    cfg.aliases.forEach((alias) => cmd.alias(alias));
    cmd.action(async ({ session }, raw) => {
        try {
            await doTxt2Img(session, raw);
        }
        catch (e) {
            logger.error('文生图命令异常', e);
            await safeSend(session, cfg.messages.fail);
        }
    });
    // ==================== 新增：预置提示词指令注册 ====================
    if (cfg.enablePresets && cfg.presets) {
        const presets = getEnabledPresets();
        for (let i = 0; i < presets.length; i++) {
            const preset = presets[i];
            const presetCmd = preset.command?.trim() || `draw${i}`;
            // 注册指令
            const pCmd = ctx.command(`${presetCmd} <raw:text>`, `使用预置提示词: ${preset.text.slice(0, 20)}...`);
            pCmd.action(async ({ session }, raw) => {
                try {
                    if (debug)
                        logger.info(`预置指令触发: ${presetCmd}, 预置文本: ${preset.text.slice(0, 50)}`);
                    await doTxt2Img(session, raw, [preset]);
                }
                catch (e) {
                    logger.error(`预置指令 ${presetCmd} 异常`, e);
                    await safeSend(session, cfg.messages.fail);
                }
            });
            if (debug)
                logger.info(`注册预置提示词指令: ${presetCmd}`);
        }
    }
    // ==========================================================
    // ==================== 修改：图生图命令支持合并消息 ====================
    const imgCmd = ctx.command(`${cfg.img2imgCommand} <raw:text>`, 'imgdraw');
    cfg.img2imgAliases.forEach((alias) => imgCmd.alias(alias));
    // 修改 action 以支持检测消息中的图片
    imgCmd.action(async ({ session }, raw) => {
        try {
            if (!session)
                return;
            if (await isBlacklisted(session.userId))
                return safeSend(session, cfg.messages.blacklisted);
            if (!cfg.enableImg2Img)
                return safeSend(session, cfg.messages.img2imgDisabled);
            // ==================== 修复：从 elements 提取纯文本，避免 XML 污染 ====================
            let prompt = '';
            if (session.elements && session.elements.length > 0) {
                // 有 elements，从中提取纯文本（排除图片等）
                prompt = extractTextFromElements(session.elements);
                if (debug)
                    logger.info('从 elements 提取的 prompt:', prompt);
            }
            // 如果 elements 没有文本，回退到 raw
            if (!prompt && raw) {
                prompt = cleanHtmlTags(raw);
            }
            // 检查消息中是否包含图片（QQ 合并消息）
            const messageImages = session.elements ? koishi_1.h.select(session.elements, 'img') : [];
            if (messageImages.length > 0) {
                // 合并消息：同时包含文字和图片，直接处理
                if (debug)
                    logger.info(`检测到合并消息，包含 ${messageImages.length} 张图片，prompt: "${prompt}"`);
                if (!prompt) {
                    // 如果没有文字 prompt，使用默认提示
                    await processImg2ImgWithImages(session, '请根据图片内容进行编辑', messageImages);
                }
                else {
                    await processImg2ImgWithImages(session, prompt, messageImages);
                }
                return;
            }
            // 传统模式：只发送了文字，进入等待图片状态
            if (!prompt)
                return safeSend(session, cfg.messages.empty);
            const assets = ctx.assets;
            if (!assets)
                return safeSend(session, cfg.messages.needAssets);
            const key = `${session.guildId || 'private'}-${session.userId}`;
            if (waitingMap.has(key)) {
                return safeSend(session, cfg.messages.alreadyWaiting);
            }
            await safeSend(session, cfg.messages.waitImage.replace('60', String(cfg.imgWaitTime)));
            const timer = setTimeout(() => {
                const task = waitingMap.get(key);
                if (!task)
                    return;
                waitingMap.delete(key);
                if (task.imageUrls.length > 0) {
                    safeSend(session, cfg.messages.generating).catch(() => { });
                    generateWithMultipleImages(session, task.prompt, task.imageUrls, cfg.img2imgModel || cfg.model);
                }
                else {
                    safeSend(session, cfg.messages.timeout).catch(() => { });
                }
            }, cfg.imgWaitTime * 1000);
            waitingMap.set(key, { prompt, timer, imageUrls: [] });
        }
        catch (e) {
            logger.error('图生图命令异常', e);
            await safeSend(session, cfg.messages.fail);
        }
    });
    // ==================== 修改：消息监听支持追加图片 ====================
    ctx.on('message', async (session) => {
        try {
            if (!session.elements)
                return;
            if (session.bot?.selfId && session.userId === session.bot.selfId)
                return;
            const key = `${session.guildId || 'private'}-${session.userId}`;
            const task = waitingMap.get(key);
            // 如果没有等待任务，检查是否是新的合并消息（已在上面的 imgCmd action 中处理）
            if (!task)
                return;
            const imgs = koishi_1.h.select(session.elements, 'img');
            if (imgs.length > 0) {
                const assets = ctx.assets;
                if (!assets) {
                    await safeSend(session, cfg.messages.needAssets);
                    return;
                }
                const uploadResults = await Promise.allSettled(imgs.map((img) => assets.upload(img.attrs.src, 'ref_image.jpg')));
                const newUrls = [];
                for (const res of uploadResults) {
                    if (res.status === 'fulfilled' && /^https?:\/\//.test(res.value)) {
                        newUrls.push(res.value);
                    }
                }
                if (newUrls.length === 0) {
                    await safeSend(session, cfg.messages.needAssets);
                    return;
                }
                task.imageUrls.push(...newUrls);
                if (task.imageUrls.length >= cfg.maxImages) {
                    clearTimeout(task.timer);
                    waitingMap.delete(key);
                    await safeSend(session, cfg.messages.generating);
                    await generateWithMultipleImages(session, task.prompt, task.imageUrls, cfg.img2imgModel || cfg.model);
                    return;
                }
                clearTimeout(task.timer);
                task.timer = setTimeout(() => {
                    waitingMap.delete(key);
                    if (task.imageUrls.length > 0) {
                        safeSend(session, cfg.messages.generating).catch(() => { });
                        generateWithMultipleImages(session, task.prompt, task.imageUrls, cfg.img2imgModel || cfg.model);
                    }
                    else {
                        safeSend(session, cfg.messages.timeout).catch(() => { });
                    }
                }, cfg.imgWaitTime * 1000);
                await safeSend(session, cfg.messages.multiImageReceived.replace('{count}', String(task.imageUrls.length)));
                return;
            }
            const text = session.content?.trim();
            if (text === '完成' || text === 'done' || text === '生成') {
                clearTimeout(task.timer);
                waitingMap.delete(key);
                if (task.imageUrls.length > 0) {
                    await safeSend(session, cfg.messages.generating);
                    await generateWithMultipleImages(session, task.prompt, task.imageUrls, cfg.img2imgModel || cfg.model);
                }
                else {
                    await safeSend(session, cfg.messages.noImageReceived);
                }
            }
        }
        catch (e) {
            logger.error('消息监听异常', e);
            await safeSend(session, cfg.messages.fail);
        }
    });
    // ==================== 黑名单命令 ====================
    const blacklistCmd = ctx.command('blacklist', 'blacklist');
    blacklistCmd.subcommand('.list', 'blacklist.list').action(async ({ session }) => {
        if (!session)
            return;
        if (!cfg.blacklistAdmins.includes(session.userId)) {
            return safeSend(session, cfg.messages.noPermission);
        }
        try {
            const entries = await ctx.database.get('ai_image_blacklist', {});
            if (entries.length === 0) {
                return safeSend(session, cfg.messages.blacklistListEmpty);
            }
            const list = entries.map((e) => e.id).join('\n');
            return safeSend(session, `${cfg.messages.blacklistListTitle}\n${list}`);
        }
        catch (e) {
            logger.error('获取黑名单失败', e);
            return safeSend(session, cfg.messages.fail);
        }
    });
    blacklistCmd.subcommand('.add <...targets:string>', 'blacklist.add').action(async ({ session }, ...targets) => {
        if (!session)
            return;
        if (!cfg.blacklistAdmins.includes(session.userId)) {
            return safeSend(session, cfg.messages.noPermission);
        }
        const ids = [];
        targets.forEach(t => {
            const num = t.replace(/\D/g, '');
            if (num)
                ids.push(num);
        });
        if (ids.length === 0) {
            return safeSend(session, '请提供有效的QQ号');
        }
        const invalid = ids.filter(id => !isValidQQ(id));
        if (invalid.length > 0) {
            return safeSend(session, cfg.messages.invalidUserId.replace('{targets}', invalid.join(', ')));
        }
        const { success, fail } = await addToBlacklist(ids);
        if (success.length) {
            await safeSend(session, cfg.messages.blacklistAddSuccess.replace('{targets}', success.join(', ')));
        }
        if (fail.length) {
            await safeSend(session, cfg.messages.blacklistAddFail.replace('{targets}', fail.join(', ')));
        }
    });
    blacklistCmd.subcommand('.remove <...targets:string>', 'blacklist.remove').action(async ({ session }, ...targets) => {
        if (!session)
            return;
        if (!cfg.blacklistAdmins.includes(session.userId)) {
            return safeSend(session, cfg.messages.noPermission);
        }
        const ids = [];
        targets.forEach(t => {
            const num = t.replace(/\D/g, '');
            if (num)
                ids.push(num);
        });
        if (ids.length === 0) {
            return safeSend(session, '请提供有效的QQ号');
        }
        const invalid = ids.filter(id => !isValidQQ(id));
        if (invalid.length > 0) {
            return safeSend(session, cfg.messages.invalidUserId.replace('{targets}', invalid.join(', ')));
        }
        const { success, fail } = await removeFromBlacklist(ids);
        if (success.length) {
            await safeSend(session, cfg.messages.blacklistRemoveSuccess.replace('{targets}', success.join(', ')));
        }
        if (fail.length) {
            await safeSend(session, cfg.messages.blacklistRemoveFail.replace('{targets}', fail.join(', ')));
        }
    });
}
