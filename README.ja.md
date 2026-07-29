<div align="center">

# Travel Planner

**Claude Code と Codex のための根拠に基づく旅行プラン**

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

[![verify](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml/badge.svg)](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml)
![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-D97757)
![Codex](https://img.shields.io/badge/Codex-compatible-111827)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

Travel Planner は、自然言語の旅行依頼を確認可能な根拠に基づく複数日程に変換します。Claude Code と Codex は、同じ手順、根拠データの形式、日程計算、検証規則、レポート出力を共有します。

> LLM は場所、営業時間、天気、移動時間を事実と判断する根拠ではありません。エージェントが根拠データを集め、core が検証して日程を組みます。

## Travel Planner が解決すること

見栄えの良い日程でも、危険な仮定が紛れ込むことがあります。移動時間がないのに 0 分とする、営業時間が不明なのに終日営業とみなす、まだ発表されていない予報を事実として書く、といった問題です。Travel Planner は不確実な点を隠さず、確認が必要な項目として残します。

| 代わりに | Travel Planner の動作 |
| --- | --- |
| 事実を推測する | 出典、収集日時、有効期限を持つ根拠データを要求 |
| 未取得の移動時間を 0 分とする | その経路を配置不可として扱う |
| 不明な場所を屋内と断定する | `indoor: true` を裏付ける根拠データを要求 |
| 不確実性を隠す | 確認タスク付きの `needs_review` を返す |
| エージェントが自動予約する | 外部変更の前に明示的な承認を要求 |

## インストール

### plugin としてインストール

両方の実行環境に同じ Git marketplace を追加し、新しいセッションを開始します。

```bash
# Claude Code
claude plugin marketplace add seongwoo-choi/travel-planner
claude plugin install travel-planner@travel-planner

# Codex
codex plugin marketplace add seongwoo-choi/travel-planner
codex plugin add travel-planner@travel-planner
```

plugin には基準となる skill と JavaScript core が含まれます。global planner package の導入、skill のコピー、実行環境ごとの実装は必要ありません。

### インストール済み plugin の更新

```bash
# Claude Code
claude plugin update travel-planner@travel-planner

# Codex
codex plugin marketplace upgrade travel-planner
codex plugin remove travel-planner@travel-planner
codex plugin add travel-planner@travel-planner
```

### ソースコードから実行

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

エージェントは根拠データを集め、旅行用 workspace を作成・検証し、日程とレポートを生成します。予約は実行しません。

## 日程計算を直接実行する

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

## 動作の流れ

```text
自然言語の依頼
    ↓
requirements.json + evidence.json
    ↓
validate → deterministic plan → report
    ↓
plan.json + Markdown + HTML + PDF（Chrome 利用可能時）
```

基準となる手順は [`skills/travel-planner/SKILL.md`](skills/travel-planner/SKILL.md) にあります。Claude Code と Codex の adapter は同じファイルを参照しており、実行環境ごとの別 planner logic はありません。

[根拠データの契約](skills/travel-planner/references/evidence-contract.md) と [レポートの契約](skills/travel-planner/references/report-contract.md) を参照してください。

## Workspace の構成

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

根拠データの snapshot と `plan.json` が基準データです。Markdown、HTML、PDF はそこから作られる出力です。インストール済み plugin cache は配布専用なので、旅行 artifact を書き込んではいけません。

## 行程の状態

| 状態 | 意味 |
| --- | --- |
| `ready` | 現在の根拠データが検証を通過しました。予約完了を意味しません。 |
| `needs_review` | 日程は使用できますが、天気、交通、収集範囲、その他の根拠データの確認が必要です。 |
| `conflict` | hard constraint に違反しています。完了した日程として扱ってはいけません。 |

## Offline 例

[`examples/danang/`](examples/danang/) は4日間のダナン旅行を試すためのサンプルデータです。実際の旅行情報ではありません。天気は `forecast_horizon`、航空便は `unavailable` のため、想定される status は `needs_review` です。

```bash
npm run dogfood:offline
```

## コマンド

| コマンド | 用途 |
| --- | --- |
| `npm test` | 契約、回帰、統合、bounded-search test |
| `npm run validate` | plan を書かず requirements と根拠データを検証 |
| `npm run plan` | 根拠データから structured JSON と Markdown を生成 |
| `npm run report` | Chrome 利用可能時に Markdown、HTML、PDF を出力 |
| `npm run bench` | 50 places、31 days の bounded benchmark |
| `npm run dogfood:offline` | offline ダナン acceptance サンプルを実行 |

## 安全性と範囲

- 配置日の営業時間が確認された場所だけが候補になります。
- 未取得の経路根拠データを 0 分の経路として扱うことはありません。
- 根拠データには認識可能な status、収集日時、有効期限が必要です。
- forecast horizon と provider failure は別の状態です。
- search は bounded・approximate であり、全体最適とは主張しません。
- core は交通、宿泊、飲食店、活動を予約しません。
- 予約、支払い、その他の外部変更の前には、対象、条件、操作を示して明示的な承認を得る必要があります。

credential、signed URL、予約番号、旅行者 data、生成済みの個人旅行 report を commit しないでください。

## プロジェクト構成

```text
skills/travel-planner/          基準となる手順と契約
.claude/skills/travel-planner/  Claude Code adapter
.agents/skills/travel-planner/  Codex adapter
.claude-plugin/                 共通 marketplace と plugin manifest
scripts/                        Validate、plan、report CLI
src/planner/                    根拠データの有効期間と日程計算
src/report-exporter.js          HTML escaping と PDF export
test/                           契約と回帰 test
examples/danang/                Offline acceptance サンプル
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
2. 最小の再現例またはサンプルデータ
3. 回帰または動作 test
4. 実際に実行した検証コマンド

変更は必要な範囲にとどめ、機能変更と無関係な cleanup を同じ pull request に混ぜないでください。

## ライセンス

[MIT License](LICENSE) の下で提供されます。
