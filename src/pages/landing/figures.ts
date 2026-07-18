import type { SampleId } from '../../samples/sample-meta'
import {
  FIGURE_NODE_HEIGHT,
  FIGURE_NODE_WIDTH,
  type FigureData,
  type FigureEdge,
  type FigureNode,
} from './TreeFigure'

/*
 * 図版の座標データ。サンプルのTreeDocument(src/samples/data)と人物・関係を一致させること。
 * 系線の描き方はエディタに合わせる: 夫婦は横線、親子は夫婦線(または親)から下りる縦横線、養子は破線。
 */

const W = FIGURE_NODE_WIDTH
const H = FIGURE_NODE_HEIGHT

function n(
  x: number,
  y: number,
  label: string,
  sub?: string,
  emphasis?: boolean,
): FigureNode {
  return { x, y, label, sub, emphasis }
}

const cx = (node: FigureNode) => node.x + W / 2
const midY = (node: FigureNode) => node.y + H / 2
const bottom = (node: FigureNode): [number, number] => [cx(node), node.y + H]

/** 夫婦間の横線(aを左・bを右に置くこと) */
function coupleEdge(a: FigureNode, b: FigureNode): FigureEdge {
  return {
    points: [
      [a.x + W, midY(a)],
      [b.x, midY(b)],
    ],
  }
}

/** 夫婦線の中点(子への系線の始点) */
function coupleMid(a: FigureNode, b: FigureNode): [number, number] {
  return [(a.x + W + b.x) / 2, midY(a)]
}

/** 始点から viaY まで下り、子の真上へ水平移動して子に届く系線 */
function dropTo(
  from: [number, number],
  viaY: number,
  child: FigureNode,
  options?: { dashed?: boolean; enterX?: number },
): FigureEdge {
  const x = options?.enterX ?? cx(child)
  return {
    dashed: options?.dashed,
    points: [from, [from[0], viaY], [x, viaY], [x, child.y]],
  }
}

// ---- ヒーロー(架空の山田家・三世代) ----

const heroTaro = n(160, 10, '山田 太郎', '大正13年〜平成20年')
const heroUme = n(300, 10, '山田 うめ', '昭和2年生')
const heroKazuo = n(90, 130, '山田 一夫', '昭和24年生')
const heroKyoko = n(230, 130, '山田 京子', '昭和27年生')
const heroRyoko = n(400, 130, '佐々木 良子', '昭和28年生')
const heroNaoki = n(90, 250, '山田 直樹', '昭和51年生')
const heroMiho = n(230, 250, '山田 美穂', '昭和54年生')

export const heroFigure: FigureData = {
  width: 520,
  height: 310,
  nodes: [
    heroTaro,
    heroUme,
    heroKazuo,
    heroKyoko,
    heroRyoko,
    heroNaoki,
    heroMiho,
  ],
  edges: [
    coupleEdge(heroTaro, heroUme),
    dropTo(coupleMid(heroTaro, heroUme), 105, heroKazuo),
    dropTo(coupleMid(heroTaro, heroUme), 105, heroRyoko),
    coupleEdge(heroKazuo, heroKyoko),
    dropTo(coupleMid(heroKazuo, heroKyoko), 225, heroNaoki),
    dropTo(coupleMid(heroKazuo, heroKyoko), 225, heroMiho),
  ],
}

// ---- 徳川家康(複数配偶者) ----

const ieyasu = n(290, 10, '徳川 家康', '天文11年〜元和2年', true)
const tsukiyama = n(30, 120, '築山殿', '正室')
const oman = n(215, 120, '於万の方', '側室')
const saigo = n(395, 120, '西郷局', '側室')
const asahi = n(580, 120, '朝日姫', '継室')
const nobuyasu = n(0, 240, '松平 信康', '永禄2年生')
const kamehime = n(115, 240, '亀姫', '永禄3年生')
const hideyasu = n(245, 240, '結城 秀康', '天正2年生')
const hidetada = n(370, 240, '徳川 秀忠', '天正7年生')
const tadayoshi = n(490, 240, '松平 忠吉', '天正8年生')

const ieyasuBusY = 95
const ieyasuFigure: FigureData = {
  width: 700,
  height: 300,
  nodes: [
    ieyasu,
    tsukiyama,
    oman,
    saigo,
    asahi,
    nobuyasu,
    kamehime,
    hideyasu,
    hidetada,
    tadayoshi,
  ],
  edges: [
    { points: [bottom(ieyasu), [cx(ieyasu), ieyasuBusY]] },
    {
      points: [
        [cx(tsukiyama), ieyasuBusY],
        [cx(asahi), ieyasuBusY],
      ],
    },
    ...[tsukiyama, oman, saigo, asahi].map((spouse): FigureEdge => ({
      points: [
        [cx(spouse), ieyasuBusY],
        [cx(spouse), spouse.y],
      ],
    })),
    dropTo(bottom(tsukiyama), 215, nobuyasu),
    dropTo(bottom(tsukiyama), 215, kamehime),
    dropTo(bottom(oman), 215, hideyasu),
    dropTo(bottom(saigo), 215, hidetada),
    dropTo(bottom(saigo), 215, tadayoshi),
  ],
}

// ---- 夏目漱石(養子縁組) ----

const naokatsu = n(40, 10, '夏目 直克', '実父')
const chie = n(170, 10, '夏目 千枝', '実母')
const masanosuke = n(360, 10, '塩原 昌之助', '養父')
const yasu = n(490, 10, '塩原 やす', '養母')
const soseki = n(200, 140, '夏目 金之助', '慶応3年〜大正5年', true)
const sosekiKyoko = n(330, 140, '夏目 鏡子', '明治10年生')
const fudeko = n(265, 250, '夏目 筆子', '明治32年生')

const sosekiFigure: FigureData = {
  width: 620,
  height: 310,
  nodes: [naokatsu, chie, masanosuke, yasu, soseki, sosekiKyoko, fudeko],
  edges: [
    coupleEdge(naokatsu, chie),
    coupleEdge(masanosuke, yasu),
    dropTo(coupleMid(naokatsu, chie), 110, soseki),
    dropTo(coupleMid(masanosuke, yasu), 122, soseki, {
      dashed: true,
      enterX: cx(soseki) + 30,
    }),
    coupleEdge(soseki, sosekiKyoko),
    dropTo(coupleMid(soseki, sosekiKyoko), 225, fudeko),
  ],
  annotations: [{ x: 383, y: 116, text: '養子縁組' }],
}

// ---- 澁澤榮一(死別後の再婚・旧字体) ----

const chiyo = n(40, 40, '澁澤 千代', '先妻・明治15年没')
const eiichi = n(250, 40, '澁澤 榮一', '天保11年〜昭和6年', true)
const kaneko = n(460, 40, '澁澤 兼子', '後妻')
const utako = n(80, 190, '澁澤 歌子', '文久3年生')
const tokuji = n(200, 190, '澁澤 篤二', '明治5年生')
const takenosuke = n(420, 190, '澁澤 武之助', '明治19年生')

const eiichiFigure: FigureData = {
  width: 600,
  height: 250,
  nodes: [chiyo, eiichi, kaneko, utako, tokuji, takenosuke],
  edges: [
    coupleEdge(chiyo, eiichi),
    coupleEdge(eiichi, kaneko),
    dropTo(coupleMid(chiyo, eiichi), 160, utako),
    dropTo(coupleMid(chiyo, eiichi), 160, tokuji),
    dropTo(coupleMid(eiichi, kaneko), 160, takenosuke),
  ],
  annotations: [
    { x: 200, y: 32, text: '安政5年 結婚' },
    { x: 410, y: 32, text: '明治16年 再婚' },
  ],
}

// ---- 現代の家族(架空・三世代) ----

const ichiro = n(130, 10, '佐藤 一郎', '昭和15年〜平成30年')
const sachiko = n(270, 10, '佐藤 幸子', '昭和18年生')
const kenta = n(130, 130, '佐藤 健太', '昭和45年生')
const yumi = n(270, 130, '佐藤 由美', '昭和48年生')
const misaki = n(130, 250, '佐藤 美咲', '平成12年生')
const daiki = n(270, 250, '佐藤 大輝', '平成15年生')

const modernFigure: FigureData = {
  width: 510,
  height: 310,
  nodes: [ichiro, sachiko, kenta, yumi, misaki, daiki],
  edges: [
    coupleEdge(ichiro, sachiko),
    dropTo(coupleMid(ichiro, sachiko), 105, kenta),
    coupleEdge(kenta, yumi),
    dropTo(coupleMid(kenta, yumi), 225, misaki),
    dropTo(coupleMid(kenta, yumi), 225, daiki),
  ],
}

export const SAMPLE_FIGURES: Record<SampleId, FigureData> = {
  'tokugawa-ieyasu': ieyasuFigure,
  'natsume-soseki': sosekiFigure,
  'shibusawa-eiichi': eiichiFigure,
  'modern-family': modernFigure,
}
