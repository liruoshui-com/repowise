# v0.2 参考项目与实现取舍

调研日期：2026-10-22。目标用户是正在构建 AI 应用的开发者。此版重点是让读者筛选、比较并持续阅读，而不是增加一份按 Star 排序的链接清单。

## 参考了什么

| 一手来源 | 观察到的做法 | RepoWise 的应用 |
| --- | --- | --- |
| [HelloGitHub](https://github.com/521xueweihan/HelloGitHub) | 持续编辑精选，通过分期内容积累可回访的项目介绍 | 加入往期归档和稳定刊物链接；新增 Agent 选型专题，保留创刊样刊 |
| [Awesome-Selfhosted](https://github.com/awesome-selfhosted/awesome-selfhosted) | 用类别组织项目，并提供语言、许可证等结构化信息 | 组合筛选主题、接入语言、部署路径；展示有采集时间的官方仓库元数据 |
| [FreshRSS](https://github.com/FreshRSS/FreshRSS) | 支持 RSS 阅读，也支持将选定内容通过 RSS 等形式再次分享 | 提供全部及主题 RSS，让读者自行选择阅读器，无需留下邮箱 |

以上是产品组织方式的参考，没有复制这些仓库的源码，也没有把它们加入运行依赖。RepoWise 与参考项目不存在隶属或背书关系。

## 本版独立实现的功能

- 公开筛选与邮件推荐共用一套匹配规则；页面 URL 保存筛选条件，订阅表单继承主题、语言和部署偏好。关键词只用于即时搜索，不作为长期订阅条件。
- 最多三个项目并排比较适用任务、使用代价、接入路径、证据和来源。可分享链接、导出 Markdown。不同角色的工具明确提示可能互补，不给未经实测的分数。
- 比较候选的项目 ID 保存在本机 localStorage，分享链接只包含项目 ID。
- 编辑后台只读预览本期预计匹配人数、已处理人数和无匹配人数，不为预览生成邮件或访问令牌。
- 官方 API 元数据刷新失败时保留旧快照与旧时间，不把失败伪装成新数据；归档项目不继续进入筛选和邮件推荐。

## 新增收录及核查来源

| 项目 | 核查用途 | 来源 |
| --- | --- | --- |
| Haystack | 模块化 Python RAG 与 Agent 管线 | [官方仓库](https://github.com/deepset-ai/haystack) |
| Pydantic AI | 带类型的 Agent 输出、工具与应用开发 | [官方仓库](https://github.com/pydantic/pydantic-ai) |
| Promptfoo | 基于配置的评测、回归测试及 Python 接入路径 | [官方仓库](https://github.com/promptfoo/promptfoo)、[Python Provider 文档](https://www.promptfoo.dev/docs/providers/python/) |
| Vercel AI SDK | TypeScript AI 应用、模型接入与工具调用 | [官方仓库](https://github.com/vercel/ai) |

全部标为“资料核查”，没有安装运行这些项目，也未测量性能。语言标签指已核查的接入路径，例如 Promptfoo 的 Python Provider 并不意味着其运行时是 Python。比较建议是编辑判断，建议读者用自己的同一任务做小型验证。

## 保留的边界

没有引入支付、多编辑账户或复杂队列。没有启用自动发信、自动发布和仓库变更提醒。实际邮件仍默认保存在本地预览；真实投递与公开网站部署需按部署文档配置。对于当前验证阶段，先观察读者是否能从筛选和比较中得到可执行的选型判断。
