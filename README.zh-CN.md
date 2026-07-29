<div align="center">

# Travel Planner

**面向 Claude Code 和 Codex 的证据驱动、skill-first 旅行规划工具**

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

[![verify](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml/badge.svg)](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml)
![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-D97757)
![Codex](https://img.shields.io/badge/Codex-compatible-111827)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

Travel Planner 将自然语言旅行请求转化为有证据支持的行程。产品本体是一份标准 skill、证据和报告契约以及 workspace template，而不是行程计算库或某个 runtime 专用 application。

> LLM 不是地点、营业时间、天气或交通时间的事实来源。智能体必须收集来源、直接检查证据数据，并将不确定性保留为待确认事项。

## 防止的问题

| 不要 | Travel Planner 的要求 |
| --- | --- |
| 猜测事实 | 有来源、收集时间和过期时间的证据数据 |
| 将缺失的交通时间当作 0 分钟 | 将该路线标记为不可排程 |
| 将未知营业时间视为营业中 | 安排日期已验证的营业时间 |
| 隐藏不确定性 | `needs_review` 和具体确认任务 |
| 让智能体自动预订 | 每次外部变更前都需明确批准 |

## 安装

> **当前访问条件：** 此仓库目前为 private。安装需要 GitHub 身份验证和仓库访问权限。向没有访问权限的用户分享前，请先设为 public。

```bash
# Claude Code
claude plugin marketplace add seongwoo-choi/travel-planner
claude plugin install travel-planner@travel-planner

# Codex
codex plugin marketplace add seongwoo-choi/travel-planner
codex plugin add travel-planner@travel-planner
```

plugin 包含标准 skill、契约和 template。安装后请启动新会话。

### 更新

```bash
claude plugin update travel-planner@travel-planner

codex plugin marketplace upgrade travel-planner
codex plugin remove travel-planner@travel-planner
codex plugin add travel-planner@travel-planner
```

## 规划旅行

```text
请为两人规划一次在岘港的三晚四日旅行。
从仁川出发，住在美溪海滩附近，
偏好轻松的节奏和夜景。
```

智能体会创建 workspace，收集只读证据并直接验证。它会写入行程和报告 artifact，再读取确认；不会执行预订。

## 工作流程

```text
自然语言请求
    ↓
requirements.json + evidence.json
    ↓
直接验证证据和行程
    ↓
plan.json + Markdown + HTML + PDF（仅在 renderer 成功时）
```

标准工作流程位于 [`skills/travel-planner/SKILL.md`](skills/travel-planner/SKILL.md)。Claude Code 和 Codex adapter 都指向此文件，任一 runtime 都没有独立的行程计算逻辑。

- [证据数据契约](skills/travel-planner/references/evidence-contract.md)
- [报告契约](skills/travel-planner/references/report-contract.md)

## Workspace 结构

```text
_workspace/
  00_input/requirements.json
  01_evidence/evidence.json
  02_plan/plan.json
  02_plan/travel_plan.md
  03_report/travel_plan.md
  03_report/travel_plan.html
  03_report/travel_plan.pdf
```

证据数据和 `plan.json` 是基准数据。Markdown、HTML、PDF 是输出。plugin cache 仅用于分发，不能写入旅行 artifact。

## 状态

| 状态 | 含义 |
| --- | --- |
| `ready` | 智能体直接验证了当前证据和 artifact，不表示已预订。 |
| `needs_review` | 行程可用，但指定证据仍需进一步确认。 |
| `conflict` | 违反 hard constraint，不得将行程视为完成。 |

## Offline 示例

[`examples/danang/`](examples/danang/) 是用于检查 skill 的三晚四日示例，不是实时旅行建议。天气为 `forecast_horizon`，航班为 `unavailable`，因此正确结果是 `needs_review`。

## 安全范围

- 直接验证输入 JSON、timestamp、status、source URL、营业时间、交通时间和行程。
- 不将缺失证据变成推测或事实。
- 只在实际 renderer 成功时提供 PDF；失败时提供已验证的 HTML 和失败原因。
- 预订、付款或其他外部变更前，展示对象、条件和操作并取得明确批准。
- 不要 commit 凭据、带签名的 URL、预订编号、旅行者数据或生成的个人报告。

## 项目结构

```text
.claude-plugin/                 marketplace 和 plugin manifest
skills/travel-planner/          标准 skill、契约和 template
.claude/skills/travel-planner/  Claude Code adapter
.agents/skills/travel-planner/  Codex adapter
examples/danang/                Offline 示例
test/skill-only-contract.sh     package 和 adapter contract 检查
```

## 开发

```bash
bash test/skill-only-contract.sh
claude plugin validate . --strict
```

GitHub Actions 会检查 skill-only package contract、strict plugin validation 以及 Claude Code/Codex marketplace 安装。

## 贡献

请将改动控制在必要范围内，并附上用户问题、最小示例或复现、实际执行的验证以及相关文档更新。

## 许可证

采用 [MIT License](LICENSE)。
