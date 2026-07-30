# spike/ — family-chart 挙動検証スパイク

`docs/research/2026-07-family-chart-hooks-spike.md` の再現手段として残している検証コード。
本体(`src/`)からは参照されず、**ビルド成果物(`dist/`)にも含まれない**(ビルドエントリは
ルートの `index.html` のみ)。`npm run dev` 起動中に `/spike/index.html` /
`/spike/hooks.html` で閲覧できる。

- 検証済みスパイクとして凍結しており、保守しない(`tsc -b` の型チェック対象外)。
- `spike/hooks.ts` の `import * as d3 from 'd3'` は family-chart の推移的依存の
  ホイストに依存している。壊れた場合はこのスパイクの寿命と判断して削除してよい。
