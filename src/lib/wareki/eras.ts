/**
 * 元号テーブル。明治以降の全元号と、江戸後期の主要元号(文化〜慶応)を収録する。
 * 範囲外の元号(南北朝期等)は変換失敗として扱う(design.md D4 / Risks参照)。
 */
export interface Era {
  name: string
  startYear: number
  startMonth: number
  startDay: number
  /** 後継の元号がある場合はその前日まで。令和(最新)は未設定(継続中)。 */
  endYear?: number
  endMonth?: number
  endDay?: number
}

export const eraTable: Era[] = [
  {
    name: '文化',
    startYear: 1804,
    startMonth: 3,
    startDay: 22,
    endYear: 1818,
    endMonth: 4,
    endDay: 21,
  },
  {
    name: '文政',
    startYear: 1818,
    startMonth: 4,
    startDay: 22,
    endYear: 1830,
    endMonth: 12,
    endDay: 9,
  },
  {
    name: '天保',
    startYear: 1830,
    startMonth: 12,
    startDay: 10,
    endYear: 1844,
    endMonth: 12,
    endDay: 1,
  },
  {
    name: '弘化',
    startYear: 1844,
    startMonth: 12,
    startDay: 2,
    endYear: 1848,
    endMonth: 2,
    endDay: 27,
  },
  {
    name: '嘉永',
    startYear: 1848,
    startMonth: 2,
    startDay: 28,
    endYear: 1854,
    endMonth: 11,
    endDay: 26,
  },
  {
    name: '安政',
    startYear: 1854,
    startMonth: 11,
    startDay: 27,
    endYear: 1860,
    endMonth: 3,
    endDay: 17,
  },
  {
    name: '万延',
    startYear: 1860,
    startMonth: 3,
    startDay: 18,
    endYear: 1861,
    endMonth: 2,
    endDay: 18,
  },
  {
    name: '文久',
    startYear: 1861,
    startMonth: 2,
    startDay: 19,
    endYear: 1864,
    endMonth: 2,
    endDay: 19,
  },
  {
    name: '元治',
    startYear: 1864,
    startMonth: 2,
    startDay: 20,
    endYear: 1865,
    endMonth: 4,
    endDay: 6,
  },
  {
    name: '慶応',
    startYear: 1865,
    startMonth: 4,
    startDay: 7,
    endYear: 1868,
    endMonth: 9,
    endDay: 7,
  },
  {
    name: '明治',
    startYear: 1868,
    startMonth: 9,
    startDay: 8,
    endYear: 1912,
    endMonth: 7,
    endDay: 29,
  },
  {
    name: '大正',
    startYear: 1912,
    startMonth: 7,
    startDay: 30,
    endYear: 1926,
    endMonth: 12,
    endDay: 24,
  },
  {
    name: '昭和',
    startYear: 1926,
    startMonth: 12,
    startDay: 25,
    endYear: 1989,
    endMonth: 1,
    endDay: 7,
  },
  {
    name: '平成',
    startYear: 1989,
    startMonth: 1,
    startDay: 8,
    endYear: 2019,
    endMonth: 4,
    endDay: 30,
  },
  {
    name: '令和',
    startYear: 2019,
    startMonth: 5,
    startDay: 1,
  },
]

export function findEraByName(name: string): Era | undefined {
  return eraTable.find((era) => era.name === name)
}
