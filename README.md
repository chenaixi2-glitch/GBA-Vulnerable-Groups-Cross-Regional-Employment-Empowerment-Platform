# GBA 跨境就业赋能平台

面向粤港澳大湾区弱势群体的 AI 驱动跨境就业服务平台。

## 文档索引

| 文档 | 说明 |
|------|------|
| [需求与技术方案](GBA_Cross-Border_Employment_Empowerment_Platform_Requirements_and_Technical_Solution_Document.md) | 产品需求与功能范围 |
| [Python 部署指南](backend/DEPLOYMENT.md) | RDS / Redis / 生产环境 |
| [后端测试指南](backend/TESTING_GUIDE.md) | API 与集成测试 |
| [测试资源汇总](TESTING_SUMMARY.md) | 全项目测试索引 |

## 快速启动

```bash
# Docker（backend + frontend）
cp .env.docker.example .env.docker   # 填入 RDS / API Keys
docker compose up -d

# 或本地开发：见 backend/DEPLOYMENT.md 与 backend/TESTING_GUIDE.md
```

## 仓库结构

```
├── individual/          # 个人用户前端
├── corporate/           # 企业用户前端
├── server/              # Node.js 认证与岗位 API
├── backend/             # Python AI 后端（LangGraph Agents）
├── docker/              # Dockerfile 与 nginx 配置
└── test-data/           # 测试与 Golden 数据
```
