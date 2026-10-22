import { configuration, createApp } from './app.js';
const config = configuration();
const { server, db } = createApp(config);
server.listen(config.port, config.host, () => {
  console.log(`RepoWise: ${config.baseUrl}`);
  console.log(config.mailMode === 'local' ? `本地邮件预览：${config.baseUrl}/dev/mail（不会发送真实邮件）` : '邮件模式：Resend');
});
let closing = false;
function stop() {
  if (closing) return; closing = true;
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
