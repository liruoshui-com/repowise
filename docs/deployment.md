# 部署与运营

## 适用环境

Node.js 24 单实例服务，配持久磁盘、HTTPS 反向代理和 Resend 发信账号。本应用需要服务端与数据库，不能直接部署到 GitHub Pages，也不适合把 SQLite 文件放在临时 serverless 文件系统。

本次代码交付没有创建公网服务、验证发信域名或发送真实邮件。仓库公开与网站上线是不同状态。

## 必填配置

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
BASE_URL=https://your-actual-domain.example
DATA_DIR=/app/var
MAIL_MODE=resend
RESEND_API_KEY=replace-with-your-key
MAIL_FROM=RepoWise <weekly@your-verified-domain.example>
ADMIN_TOKEN=replace-with-a-random-secret-of-at-least-32-characters
```

示例值必须替换。`BASE_URL` 是不含路径、查询或片段的外部 HTTPS origin。前端应从同一 origin 访问 API。生产模式缺失 HTTPS、邮件配置或足够长度的后台密钥时，服务拒绝启动。

## Docker

```sh
docker build -t repowise .
docker volume create repowise-data
docker run -d --name repowise --restart unless-stopped --env-file .env.production -p 127.0.0.1:3000:3000 -v repowise-data:/app/var repowise
```

容器以非 root 用户运行，程序不需要第三方 npm 运行依赖。在同机反向代理为 3000 端口提供 HTTPS。采用单实例，避免多个进程争抢同一邮件队列。`/api/health` 可作存活检查；它不验证外部邮件服务的可用性。

应用使用连接来源 IP 做请求限流，不信任客户端提供的 `X-Forwarded-For`。反向代理后多个用户会共享此限额；公开上线前在可信代理层配置按真实客户端 IP 的限流，再评估应用阈值。当前实现刻意不盲信任转发头。

## 发信验证

1. 在 Resend 验证自己的发信域名并配置要求的 DNS 记录。
2. 使用运营者自己的测试邮箱走完整确认、偏好修改、周报投递与退订流程。
3. 检查投递结果、垃圾箱、链接中的正确域名和退订后的发送抑制。
4. 在对外招募前补齐站点隐私说明中的运营联系信息、数据保留期限和备份删除流程。
5. 规模化发信前接入退信/投诉 Webhook 和抑制名单。此项尚未实现，不应声称具备完整邮件运营能力。

`sent` 仅表示 API 接受邮件。`failed` 记录请求失败，可以在创建后 23 小时内以同一幂等键重试；Resend 幂等窗口为 24 小时。进程中断留下的 `sending` 会在启动时改为 `uncertain`，需要人工核对服务商记录，不会贸然重发。

默认本地模式的 `/dev/mail` 仅允许回环来源和本地主机名，生产模式或 Resend 模式返回 404。不要把开发实例通过隧道或不当反向代理公开。

## 定时任务

在 GitHub 仓库设置中添加：

- Variable `SITE_URL`：部署的 HTTPS origin。
- Secret `ADMIN_TOKEN`：与部署配置一致。
- Variable `WEEKLY_ENABLED`：完成验证后设为 `true`。

工作流每周五 01:00 UTC（北京时间 09:00）执行。它只发送网站当前最新刊物，要求该刊物已批准。发送脚本默认预演，工作流显式传入 `--send`。GitHub 定时执行可能延迟。

## 数据、备份与恢复

数据库为 `DATA_DIR/repowise.sqlite`，使用 WAL。备份整个目录前先优雅停止服务，确保数据库连接关闭；不要在运行中仅复制主 `.sqlite` 文件而忽略 WAL。恢复时保持单实例，恢复完整备份后启动并检查订阅状态与投递记录。

邮箱、偏好和反馈存储在 SQLite。登录令牌验证表只存 SHA-256 摘要，但 outbox 保存邮件原文与有效链接，因此数据库与备份都需要限制访问、加密存储或卷加密，并制定清理周期。不要将整个数据目录作为公开构建产物上传。

应用中的数据删除会级联移除当前数据库记录；备份和邮件服务商日志应按运营者公布的策略清除。

## 已知规模限制

周报在 HTTP 请求内逐封发送，适合首批小规模试验。大量收件人可能超过反向代理或调用端的超时。扩容前增加后台任务队列、投递速度控制和可续跑批次。当前没有付费系统、多编辑角色、退信自动抑制或项目自动变更监测。
