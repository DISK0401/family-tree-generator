import type { TreeDocument } from '../../domain/types'
import { SCHEMA_VERSION } from '../../domain/types'

/*
 * 夏目漱石サンプル — 養子縁組パターン。
 * 幼少期に塩原家へ養子に出され、のちに夏目家へ復籍した経歴を、
 * 実父母(biological)と養父母(adopted)の2家族への帰属で表現する。
 * Wikipedia等の公知情報を基に主要人物のみへ簡略化している。登場人物は全員故人。
 */
export const natsumeSosekiSample: TreeDocument = {
  schemaVersion: SCHEMA_VERSION,
  id: 'sample-natsume-soseki',
  title: '夏目漱石の家系図(サンプル)',
  updatedAt: '2026-07-18T00:00:00.000Z',
  persons: {
    naokatsu: {
      id: 'naokatsu',
      name: {
        surname: '夏目',
        given: '直克',
        surnameKana: 'なつめ',
        givenKana: 'なおかつ',
      },
      gender: 'male',
      note: '漱石の実父。〔公知情報を基に簡略化したサンプルです〕',
    },
    chie: {
      id: 'chie',
      name: {
        surname: '夏目',
        given: '千枝',
        surnameKana: 'なつめ',
        givenKana: 'ちえ',
      },
      gender: 'female',
      note: '漱石の実母',
    },
    shobaraMasanosuke: {
      id: 'shobaraMasanosuke',
      name: {
        surname: '塩原',
        given: '昌之助',
        surnameKana: 'しおばら',
        givenKana: 'しょうのすけ',
      },
      gender: 'male',
      note: '漱石の養父',
    },
    shobaraYasu: {
      id: 'shobaraYasu',
      name: { surname: '塩原', given: 'やす', surnameKana: 'しおばら' },
      gender: 'female',
      note: '漱石の養母',
    },
    soseki: {
      id: 'soseki',
      name: {
        surname: '夏目',
        given: '金之助',
        surnameKana: 'なつめ',
        givenKana: 'きんのすけ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        date: {
          original: '慶応3年1月5日',
          qualifier: 'exact',
          date: { year: 1867 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '大正5年12月9日',
          qualifier: 'exact',
          date: { year: 1916 },
        },
      },
      note: '筆名は漱石。幼少期に塩原家へ養子に出され、のちに夏目家へ復籍した',
    },
    kyoko: {
      id: 'kyoko',
      name: {
        surname: '夏目',
        given: '鏡子',
        surnameKana: 'なつめ',
        givenKana: 'きょうこ',
      },
      gender: 'female',
      birth: {
        type: 'birth',
        date: {
          original: '明治10年7月21日',
          qualifier: 'exact',
          date: { year: 1877 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '昭和38年4月18日',
          qualifier: 'exact',
          date: { year: 1963 },
        },
      },
    },
    fudeko: {
      id: 'fudeko',
      name: {
        surname: '夏目',
        given: '筆子',
        surnameKana: 'なつめ',
        givenKana: 'ふでこ',
      },
      gender: 'female',
      birth: {
        type: 'birth',
        date: {
          original: '明治32年5月31日',
          qualifier: 'exact',
          date: { year: 1899 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '平成元年',
          qualifier: 'about',
          date: { year: 1989 },
        },
      },
      note: '長女',
    },
  },
  families: {
    'f-natsume': {
      id: 'f-natsume',
      spouseIds: ['naokatsu', 'chie'],
      kind: 'married',
      events: [],
      children: [{ childId: 'soseki', pedigree: 'biological' }],
    },
    'f-shiobara': {
      id: 'f-shiobara',
      spouseIds: ['shobaraMasanosuke', 'shobaraYasu'],
      kind: 'married',
      events: [],
      children: [{ childId: 'soseki', pedigree: 'adopted' }],
    },
    'f-soseki': {
      id: 'f-soseki',
      spouseIds: ['soseki', 'kyoko'],
      kind: 'married',
      events: [
        {
          type: 'marriage',
          date: {
            original: '明治29年6月9日',
            qualifier: 'exact',
            date: { year: 1896 },
          },
        },
      ],
      children: [{ childId: 'fudeko', pedigree: 'biological' }],
    },
  },
}
