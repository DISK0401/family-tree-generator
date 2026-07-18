import type { TreeDocument } from '../../domain/types'
import { SCHEMA_VERSION } from '../../domain/types'

/*
 * 徳川家康サンプル — 複数配偶者(正室・継室・側室)パターン。
 * Wikipedia等の公知情報を基に主要人物のみへ簡略化している。登場人物は全員故人。
 * 日付は original に和暦の原文を保持する(このアプリのデータ方針と同じ)。
 */
export const tokugawaIeyasuSample: TreeDocument = {
  schemaVersion: SCHEMA_VERSION,
  id: 'sample-tokugawa-ieyasu',
  title: '徳川家康の家系図(サンプル)',
  updatedAt: '2026-07-18T00:00:00.000Z',
  persons: {
    ieyasu: {
      id: 'ieyasu',
      name: {
        surname: '徳川',
        given: '家康',
        surnameKana: 'とくがわ',
        givenKana: 'いえやす',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        date: {
          original: '天文11年12月26日',
          qualifier: 'exact',
          date: { year: 1543 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '元和2年4月17日',
          qualifier: 'exact',
          date: { year: 1616 },
        },
      },
      note: '江戸幕府 初代将軍。〔公知情報を基に簡略化したサンプルです〕',
    },
    tsukiyama: {
      id: 'tsukiyama',
      name: { given: '築山殿', givenKana: 'つきやまどの' },
      gender: 'female',
      death: {
        type: 'death',
        date: {
          original: '天正7年8月29日',
          qualifier: 'exact',
          date: { year: 1579 },
        },
      },
      note: '正室',
    },
    asahi: {
      id: 'asahi',
      name: { given: '朝日姫', givenKana: 'あさひひめ' },
      gender: 'female',
      birth: {
        type: 'birth',
        date: {
          original: '天文12年',
          qualifier: 'about',
          date: { year: 1543 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '天正18年1月14日',
          qualifier: 'exact',
          date: { year: 1590 },
        },
      },
      note: '継室(豊臣秀吉の妹)',
    },
    oman: {
      id: 'oman',
      name: { given: '於万の方', givenKana: 'おまんのかた' },
      gender: 'female',
      note: '側室',
    },
    saigo: {
      id: 'saigo',
      name: { given: '西郷局', givenKana: 'さいごうのつぼね' },
      gender: 'female',
      birth: {
        type: 'birth',
        date: {
          original: '天文21年',
          qualifier: 'about',
          date: { year: 1552 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '天正17年5月19日',
          qualifier: 'exact',
          date: { year: 1589 },
        },
      },
      note: '側室',
    },
    nobuyasu: {
      id: 'nobuyasu',
      name: {
        surname: '松平',
        given: '信康',
        surnameKana: 'まつだいら',
        givenKana: 'のぶやす',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        date: {
          original: '永禄2年3月6日',
          qualifier: 'exact',
          date: { year: 1559 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '天正7年9月15日',
          qualifier: 'exact',
          date: { year: 1579 },
        },
      },
    },
    kamehime: {
      id: 'kamehime',
      name: { given: '亀姫', givenKana: 'かめひめ' },
      gender: 'female',
      birth: {
        type: 'birth',
        date: {
          original: '永禄3年6月4日',
          qualifier: 'exact',
          date: { year: 1560 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '寛永2年5月27日',
          qualifier: 'exact',
          date: { year: 1625 },
        },
      },
    },
    hideyasu: {
      id: 'hideyasu',
      name: {
        surname: '結城',
        given: '秀康',
        surnameKana: 'ゆうき',
        givenKana: 'ひでやす',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        date: {
          original: '天正2年2月8日',
          qualifier: 'exact',
          date: { year: 1574 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '慶長12年閏4月8日',
          qualifier: 'exact',
          date: { year: 1607 },
        },
      },
      note: 'のちに結城家の養子となる',
    },
    hidetada: {
      id: 'hidetada',
      name: {
        surname: '徳川',
        given: '秀忠',
        surnameKana: 'とくがわ',
        givenKana: 'ひでただ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        date: {
          original: '天正7年4月7日',
          qualifier: 'exact',
          date: { year: 1579 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '寛永9年1月24日',
          qualifier: 'exact',
          date: { year: 1632 },
        },
      },
      note: '江戸幕府 二代将軍',
    },
    tadayoshi: {
      id: 'tadayoshi',
      name: {
        surname: '松平',
        given: '忠吉',
        surnameKana: 'まつだいら',
        givenKana: 'ただよし',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        date: {
          original: '天正8年9月10日',
          qualifier: 'exact',
          date: { year: 1580 },
        },
      },
      death: {
        type: 'death',
        date: {
          original: '慶長12年3月5日',
          qualifier: 'exact',
          date: { year: 1607 },
        },
      },
    },
  },
  families: {
    'f-tsukiyama': {
      id: 'f-tsukiyama',
      spouseIds: ['ieyasu', 'tsukiyama'],
      kind: 'married',
      events: [
        {
          type: 'marriage',
          date: {
            original: '弘治3年1月15日',
            qualifier: 'exact',
            date: { year: 1557 },
          },
        },
      ],
      children: [
        { childId: 'nobuyasu', pedigree: 'biological' },
        { childId: 'kamehime', pedigree: 'biological' },
      ],
    },
    'f-oman': {
      id: 'f-oman',
      spouseIds: ['ieyasu', 'oman'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'hideyasu', pedigree: 'biological' }],
    },
    'f-saigo': {
      id: 'f-saigo',
      spouseIds: ['ieyasu', 'saigo'],
      kind: 'unknown',
      events: [],
      children: [
        { childId: 'hidetada', pedigree: 'biological' },
        { childId: 'tadayoshi', pedigree: 'biological' },
      ],
    },
    'f-asahi': {
      id: 'f-asahi',
      spouseIds: ['ieyasu', 'asahi'],
      kind: 'married',
      events: [
        {
          type: 'marriage',
          date: {
            original: '天正14年5月14日',
            qualifier: 'exact',
            date: { year: 1586 },
          },
        },
      ],
      children: [],
    },
  },
}
