import type { TreeDocument } from '../../domain/types'
import { SCHEMA_VERSION } from '../../domain/types'

/*
 * 渋沢栄一サンプル — 死別後の再婚パターン。
 * 人名は旧字体表記「澁澤榮一」をそのまま保持し、旧字体対応のショーケースを兼ねる。
 * Wikipedia等の公知情報を基に主要人物のみへ簡略化している。登場人物は全員故人。
 */
export const shibusawaEiichiSample: TreeDocument = {
  schemaVersion: SCHEMA_VERSION,
  id: 'sample-shibusawa-eiichi',
  title: '澁澤榮一の家系図(サンプル)',
  updatedAt: '2026-07-18T00:00:00.000Z',
  persons: {
    eiichi: {
      id: 'eiichi',
      name: {
        surname: '澁澤',
        given: '榮一',
        surnameKana: 'しぶさわ',
        givenKana: 'えいいち',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        date: {
          original: '天保11年2月13日',
          qualifier: 'exact',
          date: { year: 1840 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '昭和6年11月11日',
          qualifier: 'exact',
          date: { year: 1931 },
        },
      },
      note: '実業家。「日本資本主義の父」。旧字体表記のまま記録した例。〔公知情報を基に簡略化したサンプルです〕',
    },
    chiyo: {
      id: 'chiyo',
      name: {
        surname: '澁澤',
        given: '千代',
        surnameKana: 'しぶさわ',
        givenKana: 'ちよ',
      },
      gender: 'female',
      birth: {
        type: 'birth',
        date: {
          original: '天保12年',
          qualifier: 'about',
          date: { year: 1841 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '明治15年7月14日',
          qualifier: 'exact',
          date: { year: 1882 },
        },
      },
      note: '先妻(尾高家出身)',
    },
    kaneko: {
      id: 'kaneko',
      name: {
        surname: '澁澤',
        given: '兼子',
        surnameKana: 'しぶさわ',
        givenKana: 'かねこ',
      },
      gender: 'female',
      birth: {
        type: 'birth',
        date: { original: '嘉永5年', qualifier: 'about', date: { year: 1852 } },
      },
      death: {
        type: 'death',
        date: { original: '昭和9年', qualifier: 'about', date: { year: 1934 } },
      },
      note: '後妻(伊藤家出身)',
    },
    utako: {
      id: 'utako',
      name: {
        surname: '澁澤',
        given: '歌子',
        surnameKana: 'しぶさわ',
        givenKana: 'うたこ',
      },
      gender: 'female',
      birth: {
        type: 'birth',
        date: { original: '文久3年', qualifier: 'about', date: { year: 1863 } },
      },
      death: {
        type: 'death',
        date: { original: '昭和7年', qualifier: 'about', date: { year: 1932 } },
      },
      note: '長女。のちに穂積家へ嫁ぐ',
    },
    tokuji: {
      id: 'tokuji',
      name: {
        surname: '澁澤',
        given: '篤二',
        surnameKana: 'しぶさわ',
        givenKana: 'とくじ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        date: {
          original: '明治5年10月7日',
          qualifier: 'exact',
          date: { year: 1872 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '昭和17年10月2日',
          qualifier: 'exact',
          date: { year: 1942 },
        },
      },
      note: '長男',
    },
    takenosuke: {
      id: 'takenosuke',
      name: {
        surname: '澁澤',
        given: '武之助',
        surnameKana: 'しぶさわ',
        givenKana: 'たけのすけ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        date: {
          original: '明治19年',
          qualifier: 'about',
          date: { year: 1886 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '昭和21年',
          qualifier: 'about',
          date: { year: 1946 },
        },
      },
      note: '兼子との子',
    },
  },
  families: {
    'f-chiyo': {
      id: 'f-chiyo',
      spouseIds: ['eiichi', 'chiyo'],
      kind: 'married',
      events: [
        {
          type: 'marriage',
          date: {
            original: '安政5年12月',
            qualifier: 'exact',
            date: { year: 1858 },
          },
        },
      ],
      children: [
        { childId: 'utako', pedigree: 'biological' },
        { childId: 'tokuji', pedigree: 'biological' },
      ],
    },
    'f-kaneko': {
      id: 'f-kaneko',
      spouseIds: ['eiichi', 'kaneko'],
      kind: 'married',
      events: [
        {
          type: 'marriage',
          date: {
            original: '明治16年',
            qualifier: 'about',
            date: { year: 1883 },
          },
        },
      ],
      children: [{ childId: 'takenosuke', pedigree: 'biological' }],
    },
  },
}
