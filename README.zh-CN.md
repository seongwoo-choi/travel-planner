<div align="center">

# Travel Planner

**面向 Claude Code 和 Codex 的证据驱动旅行规划**

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

[![verify](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml/badge.svg)](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-D97757)
![Codex](https://img.shields.io/badge/Codex-compatible-111827)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

Travel Planner 将自然语言旅行请求转换为有可靠依据的多日行程。Claude Code 和 Codex 共用同一套工作流程、证据数据格式、行程计算器、验证规则和报告生成器。

> LLM 不是地点、营业时间、天气或交通时间的事实依据。智能体负责收集证据数据，核心程序再进行验证和排程。

## Travel Planner 解决的问题

看似完善的行程也可能藏着危险的假设：没有交通时间就按 0 分钟计算，不知道营业时间就当作全天开放，尚未发布的天气预报却被写成事实。Travel Planner 不会掩盖这些不确定性，而是把它们明确列为待确认事项。

| 不要 | Travel Planner 的做法 |
| --- | --- |
| 猜测事实 | 要求包含来源、收集时间和过期时间的证据数据 |
| 将缺失的交通时间视为 0 | 将该路线判定为不可排程 |
| 将未知地点断定为室内 | 要求 `indoor: true` 的正向证据 |
| 隐藏不确定性 | 返回带确认任务的 `needs_review` |
| 让智能体自动预订 | 任何外部变更前都要求明确批准 |

## 安装

### 作为 plugin 安装

在两个运行环境中安装同一个 Git marketplace，然后启动新会话。

```bash
# Claude Code
claude plugin marketplace add seongwoo-choi/travel-planner
claude plugin install travel-planner@travel-planner

# Codex
codex plugin marketplace add seongwoo-choi/travel-planner
codex plugin add travel-planner@travel-planner
```

plugin 包含作为标准流程的 skill 和 JavaScript core。无需安装全局 planner package、复制 skill，也不用维护针对不同运行环境的实现。

### 更新已安装的 plugin

```bash
# Claude Code
claude plugin update travel-planner@travel-planner

# Codex
codex plugin marketplace upgrade travel-planner
codex plugin remove travel-planner@travel-planner
codex plugin add travel-planner@travel-planner
```

### 从源代码运行

```bash
git clone https://github.com/seongwoo-choi/travel-planner.git
cd travel-planner
npm ci
```

需要 Node.js 22+ 和 Claude Code 2.x 或 Codex CLI。导出 PDF 还需要 Google Chrome、Chromium 或 `CHROME_BIN`。

## 规划一次旅行

向 Claude Code 或 Codex 用自然语言提出请求：

```text
请为两人规划一次在岘港的四日旅行。
我们从仁川乘飞机出发，住在美溪海滩附近，
偏好轻松的节奏和夜景。
```

智能体会收集证据数据，创建旅行工作目录并完成验证，然后生成行程和报告。它不会执行预订。

## 直接运行行程计算

```bash
npm run validate -- \
  --requirements=examples/danang/requirements.json \
  --evidence=examples/danang/evidence.json

npm run plan -- \
  --requirements=examples/danang/requirements.json \
  --evidence=examples/danang/evidence.json \
  --output-dir=_workspace/02_plan

npm run report -- \
  --requirements=examples/danang/requirements.json \
  --markdown=_workspace/02_plan/travel_plan.md \
  --output-dir=_workspace/03_report
```

`npm run report` 会在 PDF export 前写入 Markdown 和自包含 HTML。如果 Chrome 不可用，它会报告 PDF 失败，而不会伪造文件。

## 工作流程

```text
自然语言请求
    ↓
requirements.json + evidence.json
    ↓
validate → deterministic plan → report
    ↓
plan.json + Markdown + HTML + PDF（Chrome 可用时）
```

标准工作流程位于 [`skills/travel-planner/SKILL.md`](skills/travel-planner/SKILL.md)。Claude Code 和 Codex adapter 都指向这一个文件，没有针对不同运行环境的独立行程计算实现。

请参阅 [证据数据契约](skills/travel-planner/references/evidence-contract.md) 和 [报告契约](skills/travel-planner/references/report-contract.md)。

## Workspace 结构

```text
_workspace/
  00_input/
    requirements.json
  01_evidence/
    evidence.json
  02_plan/
    plan.json
    travel_plan.md
  03_report/
    travel_plan.md
    travel_plan.html
    travel_plan.pdf
```

收集到的证据数据和 `plan.json` 是基准数据。Markdown、HTML 和 PDF 都是由它们生成的结果。已安装的插件缓存只用于分发，不能写入旅行 artifact。

## 行程状态

| 状态 | 含义 |
| --- | --- |
| `ready` | 当前证据数据已通过验证。这不表示已经预订。 |
| `needs_review` | 行程可用，但天气、交通、收集范围或其他证据数据仍需确认。 |
| `conflict` | 违反 hard constraint。不得将该行程视为完成。 |

## Offline 示例

[`examples/danang/`](examples/danang/) 是用于试运行四日岘港行程的示例数据。它不是实时旅行建议。天气状态为 `forecast_horizon`，航班状态为 `unavailable`，因此预期结果是 `needs_review`。

```bash
npm run dogfood:offline
```

## 命令

| 命令 | 用途 |
| --- | --- |
| `npm test` | 运行契约、回归、集成和 bounded-search test |
| `npm run validate` | 不写入 plan，只验证 requirements 和证据数据 |
| `npm run plan` | 从证据数据生成 structured JSON 和 Markdown |
| `npm run report` | 在 Chrome 可用时导出 Markdown、HTML 和 PDF |
| `npm run bench` | 运行 50 个地点、31 天的 bounded benchmark |
| `npm run dogfood:offline` | 运行 offline 岘港 acceptance 示例 |

## 安全范围

- 只有在安排日期营业时间已经确认的地点才可进入行程。
- 缺失的路线证据数据不会变成 0 分钟路线。
- 证据数据必须有可识别的 status、收集时间和过期时间。
- forecast horizon 和 provider failure 是不同状态。
- search 是 bounded 且 approximate 的；不会宣称全局最优。
- 核心程序不会预订交通、住宿、餐厅或活动。
- 在预订、付款或其他外部变更前，必须展示目标、条件和操作并获得明确批准。

不要 commit 凭据、带签名的 URL、预订编号、旅行者数据或生成的个人旅行报告。

## 项目结构

```text
skills/travel-planner/          标准工作流程和契约
.claude/skills/travel-planner/  Claude Code adapter
.agents/skills/travel-planner/  Codex adapter
.claude-plugin/                 共享 marketplace 和 plugin manifest
scripts/                        Validate、plan、report CLI
src/planner/                    证据数据生命周期和行程计算器
src/report-exporter.js          HTML escaping 和 PDF export
test/                           契约和回归 test
examples/danang/                Offline acceptance 示例
```

## 开发

```bash
npm ci
npm test
npm run bench
npm run dogfood:offline
npm audit --audit-level=moderate
```

GitHub Actions 会验证 test、benchmark、audit、strict plugin validation 以及 Claude Code/Codex marketplace install。

## 贡献

欢迎聚焦明确的 issue 和 pull request。请包含：

1. 用户能看到的问题；
2. 最小复现步骤或示例数据；
3. 回归或行为 test；
4. 实际执行过的验证命令。

请把改动控制在必要范围内，不要在功能变更中混入无关 cleanup。

## 许可证

采用 [MIT License](LICENSE)。
