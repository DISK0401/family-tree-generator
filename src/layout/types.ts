import type { FamilyId, Pedigree, PersonId } from '../domain/types'

/**
 * 系図レイアウタの出力型(design.md D2)。
 *
 * `TreeDocument`からの一方向の導出結果であり、DOM・描画ライブラリ(family-chart・React等)
 * にはいっさい依存しないプレーンなデータとする(spec「家族を結合点とするレイアウト」)。
 * 画面描画(SVG)も将来の印刷・PDF出力も、この型だけを読んで描ければよい。
 */

/** 人物1人のレイアウト上の配置。x/yはカード左上を原点とする */
export interface PersonPosition {
  personId: PersonId
  /** 世代(層)番号。0が最上位で、下るほど大きくなる */
  generation: number
  x: number
  y: number
}

/**
 * 家族(婚姻単位)のレイアウト上の結合点(design.md D1)。配偶者どうしはここで結ばれ、
 * 子はここから系線を受ける。カードを持たない点そのものの位置であり、x/yは中心座標
 */
export interface FamilyPosition {
  familyId: FamilyId
  generation: number
  x: number
  y: number
}

/** 系線経路上の1点 */
export interface LinkPoint {
  x: number
  y: number
}

/** 婚姻線。1つの家族(結合点)の配偶者どうしを結ぶ */
export interface MarriageLink {
  kind: 'marriage'
  familyId: FamilyId
  /** x座標昇順の配偶者ID */
  spouseIds: PersonId[]
  points: LinkPoint[]
}

/**
 * 親子線。家族(結合点)から子1人への系線。
 * 続柄は親子の組ごとに保持する(spec「系線の種別と続柄の保持」)。
 * 同一人物が実親・養親の双方を持つ場合、それぞれの家族から1本ずつ、異なる続柄で得られる
 */
export interface ParentChildLink {
  kind: 'parent-child'
  familyId: FamilyId
  childId: PersonId
  pedigree: Pedigree
  points: LinkPoint[]
}

export type PedigreeLink = MarriageLink | ParentChildLink

/** カードの寸法。層の高さ・間隔の計算に用いる共通値 */
export interface CardSize {
  width: number
  height: number
}

/** `TreeDocument`から求めた座標付きの系図。保存・編集の正本ではなく、常に導出結果として扱う */
export interface PedigreeLayout {
  persons: PersonPosition[]
  families: FamilyPosition[]
  links: PedigreeLink[]
  cardSize: CardSize
  width: number
  height: number
}
