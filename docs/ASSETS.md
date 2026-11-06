# 画像素材の出典
## ぶひお（`public/buhio/*.webp`、`public/*icon*.png`）
- 出典: 依頼者本人のリポジトリ `uk-support1/fukushi-it-partner-site` の `assets/images/buhio/`（buhio-01〜06 のPNG）。
- 依頼者の説明によれば、福祉ITパートナーのキャラクター（ChatGPT/Codex のペットキャラとして作成）。依頼者本人が所有・管理する素材として、リポジトリの指示により使用。
- 加工: 余白の切り抜きとリサイズ（最大420px）、WebP変換のみ。絵柄の改変なし。PWAアイコン（apple-touch-icon・192・512）は「やったね」ポーズ全身をパステル背景に配置。アプリ上部のロゴも同ポーズ。
- 使用していない素材: `buhio-talking.gif`（将来の候補）。

## 動くぶひお（`public/buhio/motion/*.webp`）
- 出典: 依頼者本人のリポジトリ `uk-support1/fukushi-it-partner-site` の `docs/buhio-pet/spritesheet-atlas.webp`（ブランチ `claude/buhio-pet-validation-fdm5m4`、コミット `16e4f39`）。Codex のペットとして作成された、動くぶひおのスプライトシート（8列×11行、背景透過）。
- 使った行: 行4 `jumping`（5コマ）→ `jumping.webp`、行3 `waving`（4コマ）→ `waving.webp`。コマを横一列に並べた画像で、1コマは全コマの外接範囲で切り抜き（足元の位置が揃う）。透過つきWebP（品質92）。
- 加工: 切り抜きと横並びのみ。絵柄の改変・拡大なし。
- 注意: 元のスプライトシートはチャットに添付された 1343×2000px の画像（1コマ約168×182px）で、元の解像度かは不明。表示高さ150px（はじめの画面）で3倍画面だと輪郭が少しやわらかい。元の解像度のシートが見つかったら、同じ手順で作り直すと鮮明になる（コマ数・コマの大きさを変えたら `src/ui/Buhio.tsx` の `MOTIONS` と `src/styles.css` の `@keyframes` も合わせる。テストが不一致を検出する）。
- 見た目: 静止画（上記のPNG由来）は笑顔・効果線つきの絵柄、動くぶひおは落ち着いた表情の別バージョン。動く場面では絵柄が少し変わる。
- 公開範囲: このリポジトリは公開（Public）のため、素材も公開される。商標・利用許諾の確認は公開前ゲートの項目として残す。
- 以前の仮デザイン（オリジナルSVG）は削除済み。
