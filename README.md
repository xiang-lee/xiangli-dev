# Xiang Li - Personal Site

这是 xiangli.dev 的主站源码（多页静态站点）。包含 Home / About / Projects / Notes。

## 本地开发

```bash
python3 -m http.server 8080
```

浏览器打开 `http://localhost:8080`。

## 写文章（Notes）

1. 编辑 `notes.html` 的卡片列表，填写标题和摘要。
2. 同步更新 `index.html` 的 “Recent Notes” 区块，以展示最新文章。

## 添加项目（Projects）

1. 编辑 `projects.html` 的 “Featured Projects” 区块。
2. 每个卡片建议包含：项目名称、简短描述、状态/标签、链接（可选）。

## 联系方式

- Email 展示在 `index.html` 的 Connect 区块。
- 需要替换成你的真实邮箱（当前为占位）。

## 部署（Cloudflare Pages + GitHub）

1. 推送仓库到 GitHub：`https://github.com/xiang-lee/xiangli-dev`。
2. 登录 Cloudflare Dashboard -> Pages。
3. 选择 “Connect to Git” 并授权 GitHub。
4. 选择仓库 `xiang-lee/xiangli-dev`。
5. 构建配置：
   - Framework preset: None
   - Build command: 留空
   - Build output directory: `.`
6. 点击 Deploy，等待构建完成。

## 绑定自定义域名（xiangli.dev）

1. Cloudflare Pages 项目 -> Custom domains -> Add custom domain。
2. 填写 `xiangli.dev` 并确认。
3. 若 DNS 托管在 Cloudflare：
   - 按提示自动添加/更新 DNS 记录。
   - 确认 `A`/`CNAME` 记录已指向 Cloudflare Pages。
4. 若 DNS 不在 Cloudflare：
   - 在当前 DNS 服务商添加 Cloudflare 提示的 `CNAME`/`A` 记录。
5. 等待 SSL 证书签发（通常几分钟到数小时）。

## 未来子域名规划

- `project1.xiangli.dev` 等子域名会在 Cloudflare Pages 或 Workers 中单独部署。
- 为每个子项目创建独立 Pages 项目，并按 Cloudflare 的指引配置 DNS。
