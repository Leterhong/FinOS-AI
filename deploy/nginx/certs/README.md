# 证书目录

将你的 TLS 证书放到本目录：

- `fullchain.pem` — 证书链
- `privkey.pem` — 私钥

Nginx 容器已挂载本目录为只读（`/etc/nginx/certs`）。

本地自签测试证书（仅开发，不要用于生产）：

```bash
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout privkey.pem -out fullchain.pem \
  -days 365 -subj "/CN=localhost"
```
