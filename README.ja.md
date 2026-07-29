<div align="center">

# Travel Planner

**Claude Code と Codex のための、根拠に基づく skill-first 旅行プランナー**

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

[![verify](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml/badge.svg)](https://github.com/seongwoo-choi/travel-planner/actions/workflows/verify.yml)
![Claude Code](https://img.shields.io/badge/Claude_Code-compatible-D97757)
![Codex](https://img.shields.io/badge/Codex-compatible-111827)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

Travel Planner は自然言語の旅行依頼を根拠付きの日程に変換します。本体は一つの基準 skill、根拠・レポートの契約、workspace template です。日程計算ライブラリや runtime 専用 application ではありません。

> LLM は場所、営業時間、天気、移動時間の事実を裏付けるものではありません。エージェントは出典を集め、根拠データを直接確認し、不確実な点を確認項目として残します。

## 防ぐこと

| 代わりに | Travel Planner の基準 |
| --- | --- |
| 事実を推測する | 出典、収集日時、有効期限を持つ根拠データ |
| 未取得の移動時間を 0 分にする | その経路を配置不可とする |
| 不明な営業時間を営業中とする | 配置日の確認済み営業時間 |
| 不確実性を隠す | `needs_review` と具体的な確認項目 |
| エージェントが自動予約する | すべての外部変更前に明示的な承認 |

## インストール

> **現在の公開状態:** このリポジトリは private です。インストールには GitHub 認証とリポジトリへのアクセス権が必要です。アクセス権のないユーザーに共有する前に public にしてください。

```bash
# Claude Code
claude plugin marketplace add seongwoo-choi/travel-planner
claude plugin install travel-planner@travel-planner

# Codex
codex plugin marketplace add seongwoo-choi/travel-planner
codex plugin add travel-planner@travel-planner
```

plugin には基準 skill、契約、template が含まれます。インストール後は新しいセッションを開始してください。

### 更新

```bash
claude plugin update travel-planner@travel-planner

codex plugin marketplace upgrade travel-planner
codex plugin remove travel-planner@travel-planner
codex plugin add travel-planner@travel-planner
```

## 旅行を計画する

```text
ダナンを2人で3泊4日旅行する計画を作ってください。
仁川から出発し、ミーケービーチの近くに滞在します。
ゆったりした日程と夜景を希望します。
```

エージェントは workspace を作り、read-only の根拠を収集して直接検証します。日程とレポート artifact を書き、もう一度読んで確認します。予約は実行しません。

## 作業の流れ

```text
自然言語の依頼
    ↓
requirements.json + evidence.json
    ↓
根拠と日程の直接検証
    ↓
plan.json + Markdown + HTML + PDF（renderer 成功時のみ）
```

基準手順は [`skills/travel-planner/SKILL.md`](skills/travel-planner/SKILL.md) です。Claude Code と Codex の adapter は両方ともこのファイルを参照し、どちらの runtime も別の日程計算ロジックを持ちません。

- [根拠データの契約](skills/travel-planner/references/evidence-contract.md)
- [レポートの契約](skills/travel-planner/references/report-contract.md)
- [要件の契約](skills/travel-planner/references/requirements-contract.md)

## Workspace の構成

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

根拠データと `plan.json` が基準データです。Markdown、HTML、PDF は出力です。plugin cache は配布用であり、旅行 artifact を書き込んではいけません。

## 状態

| 状態 | 意味 |
| --- | --- |
| `ready` | エージェントが現在の根拠と artifact を直接検証しました。予約完了ではありません。 |
| `needs_review` | 日程は使えますが、指定した根拠の追加確認が必要です。 |
| `conflict` | hard constraint に違反しています。完了した日程として扱ってはいけません。 |

## Offline 例

[`examples/danang/`](examples/danang/) は skill を確認するための3泊4日のサンプルです。実際の旅行情報ではありません。天気は `forecast_horizon`、航空便は `unavailable` のため、正しい結果は `needs_review` です。

## 安全性と範囲

- 入力 JSON、timestamp、status、source URL、営業時間、移動時間、日程を直接検証します。
- 欠けている根拠を推測や事実に変えません。
- 実際の renderer が成功したときだけ PDF を提供します。失敗時は検証済み HTML と理由を提供します。
- 予約、支払い、その他の外部変更前に、対象、条件、操作を示して明示的な承認を得ます。
- 認証情報、署名付き URL、予約番号、旅行者データ、生成した個人レポートを commit しないでください。

## プロジェクト構成

```text
.claude-plugin/                 marketplace と plugin manifest
skills/travel-planner/          基準 skill、契約、template
.claude/skills/travel-planner/  Claude Code adapter
.agents/skills/travel-planner/  Codex adapter
examples/danang/                Offline サンプル
test/skill-only-contract.sh     package と adapter の contract check
```

## 開発

```bash
bash test/skill-only-contract.sh
claude plugin validate . --strict
```

GitHub Actions は skill-only package contract、strict plugin validation、Claude Code/Codex marketplace のインストールを確認します。

## 貢献

変更は必要な範囲にとどめてください。ユーザーの問題、最小の例または再現、実行した検証、関連する文書変更を含めてください。

## ライセンス

[MIT License](LICENSE) の下で提供されます。
