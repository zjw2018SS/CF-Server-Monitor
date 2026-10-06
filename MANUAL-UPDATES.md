# CF-Server-Monitor 手动更新

上游：`https://github.com/huilang-me/CF-Server-Monitor.git`。

## 手动策略

本个人 Fork 的上游同步只在本地执行；GitHub Actions 只保留 `workflow_dispatch`。
上游更新由使用者或受其明确指示的 AI 发起；没有定时同步、机器人推送或 GitHub 工作流连锁部署。
允许保留 Cloudflare 原生 Git 自动构建；推送是否同时部署按既有 CF 配置执行。
GitHub Actions 账号权限受限时，手动按钮也可能无法运行，使用下面的本地检查命令。

## 同步前准备

1. 先检查 `git status --short`，妥善保存已有修改；不要覆盖业务配置、数据迁移或其他未提交工作。
2. 核实 Cloudflare 当前连接、构建分支及部署命令，明确推送的线上影响；允许保留原生自动构建，无需关闭或断开连接。
3. `git remote -v` 核实自己的 `origin` 与本项目的 `upstream`；已有 upstream 时不要重复添加。

```powershell
git remote -v
git status --short
git switch main
git fetch upstream main
git log --oneline HEAD..upstream/main
git diff HEAD...upstream/main
```

确认上游版本和变更范围后，再手动合并。为先检查结果，使用 `git merge --no-commit --no-ff upstream/main`。
发生冲突时只处理已了解的改动；不确定时 `git merge --abort` 退出，不能使用 force push 或覆盖当前定制。

合并后必须检查 `.github/workflows`：上游可能重新引入自动工作流，也可能产生新的工作流文件。
保留本 Fork 的手动策略，删除上游同步入口；每个保留入口的 `on` 必须只有 `workflow_dispatch`。
核查 `schedule`、`cron` 触发器、`SYNC_PAT`、Git 推送、其他工作流调用/dispatch 和同步后的部署钩子。
服务运行所需的业务定时任务不属于源码更新，不要误删。

## 检查后决定推送与发布

先运行下面的本地检查并看 `git diff`，再由使用者明确决定是否提交、推送。
推送前说明 CF 既有流程是否会自动部署，并取得涵盖本次推送及其线上影响的授权。
CF 已完成部署时不要再次触发备用部署入口；独立部署命令仅在明确请求时执行。
部署前备份既有实例的数据和配置，并核对 Worker/Pages、D1、KV、R2 和域名；不要复制上游默认资源覆盖现有实例。
凭据保留在本地受控配置或既有 Secrets 中，不创建新的 PAT，不把值写入聊天、仓库或说明文档。

## Cloudflare 原生 Git 构建

- 2026-10-07 用户明确接受 CF 自动构建；保留既有 Pages / Workers Git 连接与构建配置。
- 自动构建与是否部署由当前项目配置决定。推送前核对分支和部署命令，含迁移时先按既有流程备份。
- 本次仅修改本地说明与工作流，没有核验或变更控制台设置；不删除 GitHub OAuth/App 授权。

参考：[Pages 分支构建控制](https://developers.cloudflare.com/pages/configuration/branch-build-controls/) ·
[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)。

不存在 upstream 时只需添加一次：`git remote add upstream https://github.com/huilang-me/CF-Server-Monitor.git`。

## 本地检查与独立部署

```powershell
npm ci
npm run test
npm run build:frontend
```

核对本地 `wrangler.toml` 中既有 Worker、D1、Durable Objects 和域名后，先进行
`npx wrangler deploy --dry-run`，再独立决定是否使用 `npm run deploy` 部署。
本地配置与 Actions 生成的生产配置并非默认相同，不要把仓库默认文件直接覆盖生产绑定。
`keep_vars = true` 会保留未声明的线上变量，但不能阻止本地 `[vars]` 覆盖同名值。
本地模板不再声明用户名及跨域设置；它们由现有 Worker 管理。部署前仍要读回线上绑定与变量，
核对 Secrets、D1、Durable Objects、业务 Cron 及备份监控设置；发现差异时先修正实例配置再发布。
备用的 Workers / GitHub Pages Actions 入口均手动执行，Workers 不接受其他工作流调用。
Worker 每小时的表轮换和到期检测属于业务定时任务，保留不动。
