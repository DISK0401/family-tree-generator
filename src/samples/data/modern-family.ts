import type { TreeDocument } from '../../domain/types'
import { SCHEMA_VERSION } from '../../domain/types'

/*
 * 現代の家族サンプル — 三世代の記録パターン。
 * 登場する人物・家族はすべて架空(specs/sample-tree-gallery「架空の明記」要件)。
 * 和暦originalと西暦を併記し、和暦⇄西暦対応のショーケースを兼ねる。
 */
export const modernFamilySample: TreeDocument = {
  schemaVersion: SCHEMA_VERSION,
  id: 'sample-modern-family',
  title: 'ある現代の家族の家系図(架空のサンプル)',
  updatedAt: '2026-07-18T00:00:00.000Z',
  persons: {
    ichiro: {
      id: 'ichiro',
      name: {
        surname: '佐藤',
        given: '一郎',
        surnameKana: 'さとう',
        givenKana: 'いちろう',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        date: {
          original: '昭和15年4月2日',
          qualifier: 'exact',
          date: { year: 1940, month: 4, day: 2 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '平成30年11月3日',
          qualifier: 'exact',
          date: { year: 2018, month: 11, day: 3 },
        },
      },
      note: 'このサンプルの人物はすべて架空です',
    },
    sachiko: {
      id: 'sachiko',
      name: {
        surname: '佐藤',
        given: '幸子',
        surnameKana: 'さとう',
        givenKana: 'さちこ',
      },
      gender: 'female',
      birth: {
        type: 'birth',
        date: {
          original: '昭和18年8月15日',
          qualifier: 'exact',
          date: { year: 1943, month: 8, day: 15 },
        },
      },
      note: 'このサンプルの人物はすべて架空です',
    },
    kenta: {
      id: 'kenta',
      name: {
        surname: '佐藤',
        given: '健太',
        surnameKana: 'さとう',
        givenKana: 'けんた',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        date: {
          original: '昭和45年6月10日',
          qualifier: 'exact',
          date: { year: 1970, month: 6, day: 10 },
        },
      },
      note: 'このサンプルの人物はすべて架空です',
    },
    yumi: {
      id: 'yumi',
      name: {
        surname: '佐藤',
        given: '由美',
        surnameKana: 'さとう',
        givenKana: 'ゆみ',
      },
      gender: 'female',
      birth: {
        type: 'birth',
        date: {
          original: '昭和48年2月25日',
          qualifier: 'exact',
          date: { year: 1973, month: 2, day: 25 },
        },
      },
      note: '旧姓は田中。このサンプルの人物はすべて架空です',
    },
    misaki: {
      id: 'misaki',
      name: {
        surname: '佐藤',
        given: '美咲',
        surnameKana: 'さとう',
        givenKana: 'みさき',
      },
      gender: 'female',
      birth: {
        type: 'birth',
        date: {
          original: '平成12年7月7日',
          qualifier: 'exact',
          date: { year: 2000, month: 7, day: 7 },
        },
      },
      note: 'このサンプルの人物はすべて架空です',
    },
    daiki: {
      id: 'daiki',
      name: {
        surname: '佐藤',
        given: '大輝',
        surnameKana: 'さとう',
        givenKana: 'だいき',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        date: {
          original: '平成15年12月1日',
          qualifier: 'exact',
          date: { year: 2003, month: 12, day: 1 },
        },
      },
      note: 'このサンプルの人物はすべて架空です',
    },
  },
  families: {
    'f-grandparents': {
      id: 'f-grandparents',
      spouseIds: ['ichiro', 'sachiko'],
      kind: 'married',
      events: [
        {
          type: 'marriage',
          date: {
            original: '昭和42年10月10日',
            qualifier: 'exact',
            date: { year: 1967, month: 10, day: 10 },
          },
        },
      ],
      children: [{ childId: 'kenta', pedigree: 'biological' }],
    },
    'f-parents': {
      id: 'f-parents',
      spouseIds: ['kenta', 'yumi'],
      kind: 'married',
      events: [
        {
          type: 'marriage',
          date: {
            original: '平成10年5月23日',
            qualifier: 'exact',
            date: { year: 1998, month: 5, day: 23 },
          },
        },
      ],
      children: [
        { childId: 'misaki', pedigree: 'biological' },
        { childId: 'daiki', pedigree: 'biological' },
      ],
    },
  },
}
