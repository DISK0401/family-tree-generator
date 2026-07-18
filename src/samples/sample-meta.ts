/**
 * サンプル家系図のID・紹介文(design.md D8)。
 * ランディングからも参照するため、TreeDocument本体(data/配下)はここからimportしない
 * (本体はエディタ側チャンクから load-sample.ts 経由で動的importする)。
 *
 * 人選の制約(specs/sample-tree-gallery):
 * - 実在の人物は故人かつWikipedia等で系譜が公知の人物に限定する
 * - 実在の存命人物・皇室系譜は扱わない
 * - 架空の家族サンプルには架空である旨を明記する
 */

export const SAMPLE_IDS = [
  'tokugawa-ieyasu',
  'natsume-soseki',
  'shibusawa-eiichi',
  'modern-family',
] as const

export type SampleId = (typeof SAMPLE_IDS)[number]

export function isSampleId(value: string): value is SampleId {
  return (SAMPLE_IDS as readonly string[]).includes(value)
}

export interface SampleMeta {
  id: SampleId
  /** ギャラリーのタブ名 */
  tabLabel: string
  title: string
  /** どの家族関係パターンを見せるサンプルかの一言 */
  pattern: string
  description: string
  /** 出典・簡略化・架空明記などの注記 */
  note: string
}

export const SAMPLE_METAS: SampleMeta[] = [
  {
    id: 'tokugawa-ieyasu',
    tabLabel: '徳川家康',
    title: '徳川家康の家系図',
    pattern: '複数の配偶者',
    description:
      '江戸幕府を開いた徳川家康。正室・継室・側室、それぞれとの子どもたちを一枚の系図で。複数の配偶者がいても系線は崩れません。',
    note: 'Wikipedia等の公知情報を基に、主要な人物のみへ簡略化したサンプルです(登場人物はすべて故人です)。',
  },
  {
    id: 'natsume-soseki',
    tabLabel: '夏目漱石',
    title: '夏目漱石の家系図',
    pattern: '養子縁組',
    description:
      '幼少期に塩原家へ養子に出され、のちに夏目家へ復籍した文豪・夏目漱石。実父母と養父母、二つの家のつながりを破線の系線で描き分けます。',
    note: 'Wikipedia等の公知情報を基に、主要な人物のみへ簡略化したサンプルです(登場人物はすべて故人です)。',
  },
  {
    id: 'shibusawa-eiichi',
    tabLabel: '渋沢栄一',
    title: '澁澤榮一の家系図',
    pattern: '再婚(死別後)',
    description:
      '「日本資本主義の父」渋沢栄一。先妻との死別後の再婚と、それぞれの子どもたちを表現。旧字体の「澁澤榮一」もそのまま記録できます。',
    note: 'Wikipedia等の公知情報を基に、主要な人物のみへ簡略化したサンプルです(登場人物はすべて故人です)。',
  },
  {
    id: 'modern-family',
    tabLabel: '現代の家族',
    title: 'ある現代の家族の家系図',
    pattern: '三世代の記録',
    description:
      '祖父母から孫まで、三世代のつながりを記録した例。和暦・西暦どちらで入力しても、もう一方の表記がすぐに確認できます。',
    note: 'このサンプルに登場する人物・家族はすべて架空です。実在の人物・団体とは関係ありません。',
  },
]

export function sampleMetaById(id: SampleId): SampleMeta {
  const meta = SAMPLE_METAS.find((m) => m.id === id)
  if (!meta) throw new Error(`unknown sample id: ${id}`)
  return meta
}
