# Chip Diplomacy — 中美半导体外交博弈模拟

四个独立角色（美国政府、中国政府、荷兰政府、ASML）围绕先进半导体设备出口管制进行文本谈判。默认三轮，可选1～5轮；最后一轮形成各方自己的决定。无经济分数，不预测现实政策。历史背景、虚构设定和模型内容分别标注。

## 启动

Node 22.16+ 或24。`npm ci`，复制 `.env.example` 为私有 `.env`。两个终端分别运行 `npm start`（后端5001）和 `npm run dev`（前端3000），打开 http://127.0.0.1:3000 。端口严格保留原 MiroFish 配置，不会自动换端口；若已有服务，请先确认归属再操作。也可 `npm run build` 后只运行 `npm start`，访问 http://127.0.0.1:5001 。构建同时保留 `/legacy.html` 旧游戏入口。

## DeepSeek 与演示

仅在服务端环境配置 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL=https://api.deepseek.com`、`DEEPSEEK_MODEL=deepseek-flash`。支持原 MiroFish 的 `LLM_API_KEY/LLM_BASE_URL/LLM_MODEL_NAME` 作为兼容别名；优先使用 DEEPSEEK 变量，不修改原项目配置。前端不能输入、读取或保存密钥。`.env`、配额文件与验收产物均忽略。

模型采用官方 OpenAI 兼容 Chat Completions 与 JSON 输出；独立 system prompt 由角色生成，只接收本方可见观察和历史，服务端检查动作、对象与权限。响应错误最多重试一次，每个槽位总超时默认30秒，失败明确记录并跳过，绝不伪造成功决定或混入演示脚本。关闭 thinking，不显示或保存供应商私有推理链。`reason` 是简短公开理由。

未配置密钥时可以选择**演示模式 · 示例脚本**完成界面体验。它是固定示例，不能作为自主LLM实验证据。实时模式不可用时会拒绝开局，不会悄悄切换。日调用默认上限60（重试也计数），账本保存在 `.runtime/diplomacy-quota.json`，重启不清零；并发2。HTTP限制每IP每分钟120个写请求，最多50个内存会话、空闲1小时过期。这些是运行保护，不是模拟经济参数。

## 如何体验

1. 选择模式、轮数和旁观者或任一玩家角色，开始模拟。
2. 四方依次行动，其他角色由模型自主生成；选择玩家角色后，本方步骤等待输入。
3. 选择公开声明、私下沟通、提案、接受/拒绝或修订，输入自然语言。仅有效收件人可接受提案；修改须重新同意。ASML不能签政府间协议。
4. 可暂停、继续、重置和重新推演；暂停时丢弃未完成的模型结果。重置隔离旧回复；响应丢失时先同步服务端状态，避免重复提交。
5. 在右侧“对话记录 / 最终决策”切换查看；桌面同一屏展示设置、四方会议、提案与记录，长记录只在对话区滚动。最后轮每方作出最终决定；卡片显示公开理由、相关实际历史记录和可见协议。模型失败则如实显示未形成决定。公开声明不会自动成为协议或生效法律。

私有消息只供发件人、收件人和各自模型观察使用；旁观者只见公开内容。私有角色设定仅在服务端。会话令牌只在当前页面内存，刷新会回到开局；服务端重启会丢失内存对局。完整可见记录可在本页查阅；当前不提供持久化存档。

## 验证与结构

运行 `npm run typecheck`、`npm run test`、`npm run build`。最新实测结果见 [验收记录](docs/diplomacy-progress.md)。

- `server/diplomacy/engine.mjs`：纯离散状态、秘书校验、可见性和提案。
- `server/diplomacy/scenario.mjs`：角色目标、独立私有设定、历史出处与虚构场景。
- `server/diplomacy/provider.mjs`：DeepSeek接口、超时、有限重试与配额。
- `server/diplomacy-index.mjs`：会话、身份令牌、控制及前端静态服务。
- `src/diplomacy/`：紧凑卡通圆桌、对话与决策标签页；`types.ts` 是共享契约。
- [接口契约](docs/diplomacy-contracts.md)、[本地运行与部署边界](docs/diplomacy-deployment.md)。

## 原项目与来源

用户确认重新实现，原 Chip-Wars 未删除，保留于原模块与 Git 恢复标签 `backup/chip-wars-before-diplomacy-20261029`；`npm run dev:legacy` 可单独打开旧游戏（须先释放3000）。旧模型代理 `npm run start:legacy` 使用4187；旧版完整恢复建议用备份标签建立新工作树。旧 V3 文档和 `ops/` 是历史实现，不作为新外交系统规格或部署脚本。

MiroFish 已归档到 `archive/mirofish-original/`，包括原本未提交脚本和备份、AGPL-3.0许可证；[归档说明与恢复](archive/README.md)、SHA-256清单见 `archive/manifest.json`。原桌面项目未覆盖。MiroFish来源 https://github.com/666ghj/MiroFish ，WarAgent来源 https://github.com/agiresearch/WarAgent 。新实现借鉴独立角色、公共记录、私有记忆和秘书校验思想，没有复制WarAgent战争实现，也不使用OASIS/Zep。详见 [归属说明](THIRD_PARTY_NOTICES.md)。本仓库采用AGPL-3.0。

## 研究局限

角色目标、私有信息、固定行动顺序与后续谈判都是人为模拟设定。LLM可能表达未经证实的说法；内容标注为生成内容，不自动变成事实。结构权限和协议状态由程序校验，但不对自由文本进行完整法律解释；文本不能执行或改变现实法律。最后轮强制决策会压缩谈判空间，结果对提示词、模型与调度顺序敏感，不能作实证因果结论或现实预测。没有经济模拟、数据库、战争模块或复杂框架。Codex辅助开发；SVG/CSS插画为本项目绘制，参考图不是生产素材。
