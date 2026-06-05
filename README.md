koishi-plugin-ai-image
支持多模型、多 API 负载均衡的 Koishi AI 绘图插件。
安装
bash
npm install koishi-plugin-ai-image
图片压缩需额外安装 sharp：
bash
npm install sharp
快速开始
1. 配置主模型
在「模型配置项」中填写：
主模型名称：如 gpt-4o-mini
主模型 API Key：你的 API Key
主模型接口地址：如 https://api.openai.com/v1/chat/completions
2. 文生图
plain
draw 一只可爱的猫娘
3. 图生图
plain
imgdraw 把这只猫变成赛博朋克风格
然后发送图片，或直接附带图片发送。
配置项
模型配置项
表格
配置	说明
主模型名称	默认使用的模型
主模型 API Key / 接口地址	主模型的 API 配置
副模型列表	可添加多个副模型，每个独立配置模型名、API、触发指令
副模型配置：
名称：仅用于标识
模型名称 / API Key / 接口地址：留空则使用主模型的
文生图 / 图生图触发指令：留空则默认 drawN / imgdrawN
AI 绘图插件配置
表格
配置	说明
调试模式	输出完整请求日志
API 调度策略	顺序模式 / 负载均衡模式
超时 / 限流	请求超时时间和每小时调用上限
图片压缩	建议开启，防止大图超时
图生图 base64	是否将图片转为 base64 发送
多 API 负载均衡	与主/副模型配置独立，优先级更低
指令名称	主模型文生图 / 图生图指令及别名
提示词模板	文生图 / 图生图的 prompt 模板
预置提示词配置
表格
配置	说明
预置提示词文本	自动添加到用户 prompt 前面
触发指令	留空则默认 presetN
匹配关键词	用户 prompt 包含此词时自动添加
启用关键词匹配	是否开启自动匹配
注意：指令触发仅主模型文生图可用；关键词匹配任何生图场景都可用。
提示文案配置
所有用户提示文字均可自定义。
指令
表格
指令	说明	默认
主模型文生图	使用主模型生成图片	draw
主模型图生图	使用主模型编辑图片	imgdraw
预置提示词	使用预置提示词生成	preset0, preset1...
副模型文生图	使用副模型生成图片	draw0, draw1...
副模型图生图	使用副模型编辑图片	imgdraw0, imgdraw1...
黑名单	查看/添加/移除黑名单	blacklist
图生图用法
方式一：合并消息（推荐）
直接发送附带图片的消息：
plain
imgdraw 把背景换成星空
方式二：分步发送
发送 imgdraw 把背景换成星空
按提示发送图片
可继续发送多张，输入 完成 开始生成
黑名单
在「AI 绘图插件配置」中添加管理员 QQ。
plain
blacklist.list          查看黑名单
blacklist.add 123456    添加黑名单
blacklist.remove 123456 移除黑名单
注意
图生图需要配置 assets 服务（设置正确的 selfUrl）
建议开启图片压缩，防止大图超时
多 API 负载均衡优先级低于模型专属配置