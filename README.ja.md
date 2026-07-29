<div align="center">

# Travel Planner

**Claude Code と Codex のためのエビデンスに基づく旅行プラン**

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

[![verify](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml/badge.svg)](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-D97757)
![Codex](https://img.shields.io/badge/Codex-compatible-111827)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

Travel Planner は、自然言語の旅行依頼を根拠付きの複数日程に変換します。Claude Code と Codex は、単一の workflow、evidence 契約、deterministic scheduler、fail-closed 検証、portable report を共有します。

> LLM は場所、営業時間、天気、移動時間の事実 source ではありません。agent が evidence を集め、core が検証して日程を組みます。

## Travel Planner が解決すること

見栄えの良い日程でも危険な仮定を隠しがちです。移動時間が未取得なら 0 分にする、営業時間が不明でも終日営業とみなす、未発表の予報を事実として書く、といった問題です。Travel Planner は不確実性を隠さず、確認作業として残します。

| 代わりに | Travel Planner の動作 |
| --- | --- |
| 事実を推測する | source、収集日時、有効期限を持つ evidence を要求 |
| 未取得の移動時間を 0 分とする | その経路を配置不可として扱う |
| 不明な場所を屋内と断定する | `indoor: true` の肯定的 evidence を要求 |
| 不確実性を隠す | 確認タスク付きの `needs_review` を返す |
| agent が自動予約する | 外部変更の前に明示的な承認を要求 |

## インストール

### plugin としてインストール

両 runtime に同じ Git marketplace を追加し、新しい session を開始します。

```bash
# Claude Code
claude plugin marketplace add seongwoo-choi/travel-planner
claude plugin install travel-planner@travel-planner

# Codex
codex plugin marketplace add seongwoo-choi/travel-planner
codex plugin add travel-planner@travel-planner
```

plugin には canonical skill と JavaScript core が含まれます。global planner package、skill のコピー、runtime 別実装は不要です。

### インストール済み plugin の更新

```bash
# Claude Code
claude plugin update travel-planner@travel-planner

# Codex
codex plugin marketplace upgrade travel-planner
codex plugin remove travel-planner@travel-planner
codex plugin add travel-planner@travel-planner
```

### source から実行

```bash
git clone https://github.com/seongwoo-choi/travel-planner.git
cd travel-planner
npm ci
```

Node.js 22 以上と Claude Code 2.x または Codex CLI が必要です。PDF 出力には Google Chrome、Chromium、または `CHROME_BIN` も必要です。

## 旅行を計画する

Claude Code または Codex に自然言語で依頼します。

```text
ダナンを2人で4日間旅行する計画を作ってください。
仁川から飛行機で行き、ミーケービーチ近くに滞在します。
ゆったりした日程と夜景を希望します。
```

agent は evidence を集め、trip workspace を作成・検証し、日程と report を生成します。予約は実行しません。

## deterministic pipeline を直接実行

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

`npm run report` は PDF export 前に Markdown と自己完結 HTML を作成します。Chrome が見つからない場合は、PDF を捏造せず失敗理由を報告します。

## agent が証明するフロー

```text
自然言語の依頼
    ↓
requirements.json + evidence.json
    ↓
validate → deterministic plan → report
    ↓
plan.json + Markdown + HTML + PDF（Chrome 利用可能時）
```

canonical workflow は [`skills/travel-planner/SKILL.md`](skills/travel-planner/SKILL.md) です。Claude Code と Codex の adapter はこの単一 source を指し、runtime ごとの別 planner logic はありません。

[evidence 契約](skills/travel-planner/references/evidence-contract.md) と [report 契約](skills/travel-planner/references/report-contract.md) を参照してください。

## Workspace 契約

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

Evidence snapshot と `plan.json` が source of truth です。Markdown、HTML、PDF は派生 artifact です。インストール済み plugin cache は distribution 専用であり、旅行 artifact を書き込んではいけません。

## Plan 状態

| 状態 | 意味 |
| --- | --- |
| `ready` | 現在の evidence が検証を通過しました。予約完了を意味しません。 |
| `needs_review` | 日程は使用できますが、天気、交通、coverage、その他の evidence の確認が必要です。 |
| `conflict` | hard constraint に違反しています。完了した日程として扱ってはいけません。 |

## Offline 例

[`examples/danang/`](examples/danang/) は pipeline 実行用の4日間 fixture です。実際の旅行情報ではなく test data です。天気は `forecast_horizon`、航空便は `unavailable` のため、期待 status は `needs_review` です。

```bash
npm run dogfood:offline
```

## コマンド

| コマンド | 用途 |
| --- | --- |
| `npm test` | contract、regression、integration、bounded-search test |
| `npm run validate` | plan を書かず requirements と evidence を検証 |
| `npm run plan` | evidence から structured JSON と Markdown を生成 |
| `npm run report` | Chrome 利用可能時に Markdown、HTML、PDF を出力 |
| `npm run bench` | 50 places、31 days の bounded benchmark |
| `npm run dogfood:offline` | offline ダナン acceptance fixture を実行 |

## 安全性と範囲

- 配置日の営業時間が検証された場所だけが候補になります。
- 未取得の経路 evidence は 0 分の経路になりません。
- evidence には認識可能な status、収集日時、有効期限が必要です。
- forecast horizon と provider failure は別の状態です。
- search は bounded・approximate であり、全体最適とは主張しません。
- core は交通、宿泊、飲食店、活動を予約しません。
- 予約、支払い、その他の外部変更の前には、対象、条件、操作を示して明示的な承認を得る必要があります。

credential、signed URL、予約番号、旅行者 data、生成済みの個人旅行 report を commit しないでください。

## Project layout

```text
skills/travel-planner/          Canonical workflow と契約
.claude/skills/travel-planner/  Claude Code adapter
.agents/skills/travel-planner/  Codex adapter
.claude-plugin/                 共通 marketplace と plugin manifest
scripts/                        Validate、plan、report CLI
src/planner/                    Evidence lifecycle と scheduler
src/report-exporter.js          Escaped HTML と PDF export
test/                           Contract と regression test
examples/danang/                Offline acceptance fixture
```

## 開発

```bash
npm ci
npm test
npm run bench
npm run dogfood:offline
npm audit --audit-level=moderate
```

GitHub Actions は test、benchmark、audit、strict plugin validation、Claude Code/Codex marketplace install を検証します。

## Contributing

焦点の明確な issue と pull request を歓迎します。以下を含めてください。

1. ユーザーに見える問題
2. 最小の再現または fixture
3. regression または behavior test
4. 実行した検証コマンド

変更は surgical に保ち、無関係な cleanup を behavior change に混ぜないでください。

## License

[MIT License](LICENSE) の下で提供されます。
