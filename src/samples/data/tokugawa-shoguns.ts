import type { TreeDocument } from '../../domain/types'
import { SCHEMA_VERSION } from '../../domain/types'

/*
 * 徳川将軍15代サンプル — 多世代・分家からの継承パターン(design.md D1〜D4)。
 *
 * 収録範囲(32名):
 * - 将軍15代(初代 家康 〜 15代 慶喜)
 * - 継承を系譜として辿るために必要な分家の当主15名
 *   紀州徳川家(頼宣・光貞・斉順)/ 甲府徳川家(綱重)/ 一橋徳川家(宗尹・治済)/
 *   水戸徳川家(頼房・光圀・綱條・宗堯・宗翰・治保・治紀・斉昭)/ 高松松平家(頼重)
 * - 主要な正室2名(崇源院=秀忠の正室 / 天璋院=家定の正室)
 *
 * 収録方針:
 * - 生没日は Wikipedia 日本語版の各人物のインフォボックス(生誕・死没・父母)を
 *   1人ずつ原文で確認した値のみを使う(一覧表からの一括転記は誤りが多いため採らない)
 * - 明治6年の改暦以前(旧暦)の日付は、和暦の原文を original に保持し、構造化日付は
 *   **グレゴリオ暦の年のみ**とする。和暦の月日をグレゴリオ暦の月日として書くと誤りになる
 *   (例: 家康の 天文11年12月26日 は 1543年1月31日で、年すら和暦と一致しない)
 * - 改暦以後の日付(慶喜の没=大正2年11月22日、天璋院の没=明治16年11月20日)は
 *   年月日まで構造化する。なおカードの日付表示は、アプリの和暦変換が明治以降の元号のみ
 *   対応(domain/wareki.ts の ERA_TABLE)のため、江戸期の人物では表示設定を和暦にしても
 *   西暦年で表示される(和暦の原文は人物パネル・表の編集時に現れる)
 * - 中間世代を省略して祖先と子孫を直接の親子として記録することはしない
 *   (慶喜が家康まで繋がるよう、水戸徳川家は初代 頼房から斉昭まで全世代を収録している)
 * - 実父が判明していても収録範囲外の人物(宗堯の実父 松平頼豊など)は、実父を記録せず
 *   養父のみで繋ぐ。事実の欠落は許容するが、実在しない親子関係は作らない
 * - 皇室出身の人物は収録しない。14代 家茂の正室 和宮親子内親王は故人だが仁孝天皇の皇女で
 *   あり、spec sample-tree-gallery「皇室系譜を扱ってはならない」に触れるため対象外とする
 *
 * 登場人物は全員故人。Wikipedia等の公知情報を基に簡略化している。
 */
export const tokugawaShogunsSample: TreeDocument = {
  schemaVersion: SCHEMA_VERSION,
  id: 'sample-tokugawa-shoguns',
  title: '徳川将軍15代の家系図(サンプル)',
  updatedAt: '2026-07-29T00:00:00.000Z',
  persons: {
    // ---- 初代 家康とその子(将軍家・紀州家・水戸家の起点) ----
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
        // 天文11年12月26日 = 1543年1月31日
        date: {
          original: '天文11年12月26日',
          qualifier: 'exact',
          date: { year: 1543 },
        },
      },
      death: {
        type: 'death',
        // 元和2年4月17日 = 1616年6月1日
        date: {
          original: '元和2年4月17日',
          qualifier: 'exact',
          date: { year: 1616 },
        },
      },
      note: '初代将軍。〔公知情報を基に簡略化したサンプルです〕',
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
        // 天正7年4月7日 = 1579年5月2日
        date: {
          original: '天正7年4月7日',
          qualifier: 'exact',
          date: { year: 1579 },
        },
      },
      death: {
        type: 'death',
        // 寛永9年1月24日 = 1632年3月14日
        date: {
          original: '寛永9年1月24日',
          qualifier: 'exact',
          date: { year: 1632 },
        },
      },
      note: '2代将軍。家康の三男',
    },
    sugenin: {
      id: 'sugenin',
      name: { given: '崇源院', givenKana: 'すうげんいん' },
      gender: 'female',
      birth: {
        type: 'birth',
        date: {
          original: '天正元年',
          qualifier: 'exact',
          date: { year: 1573 },
        },
      },
      death: {
        type: 'death',
        // 寛永3年9月15日 = 1626年11月3日
        date: {
          original: '寛永3年9月15日',
          qualifier: 'exact',
          date: { year: 1626 },
        },
      },
      note: '2代将軍 秀忠の正室(江)',
    },
    yorinobu: {
      id: 'yorinobu',
      name: {
        surname: '徳川',
        given: '頼宣',
        surnameKana: 'とくがわ',
        givenKana: 'よりのぶ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 慶長7年3月7日 = 1602年4月28日
        date: {
          original: '慶長7年3月7日',
          qualifier: 'exact',
          date: { year: 1602 },
        },
      },
      death: {
        type: 'death',
        // 寛文11年1月10日 = 1671年2月19日
        date: {
          original: '寛文11年1月10日',
          qualifier: 'exact',
          date: { year: 1671 },
        },
      },
      note: '紀州徳川家 初代。家康の十男',
    },
    yorifusa: {
      id: 'yorifusa',
      name: {
        surname: '徳川',
        given: '頼房',
        surnameKana: 'とくがわ',
        givenKana: 'よりふさ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 慶長8年8月10日 = 1603年9月15日
        date: {
          original: '慶長8年8月10日',
          qualifier: 'exact',
          date: { year: 1603 },
        },
      },
      death: {
        type: 'death',
        // 寛文元年7月29日 = 1661年8月23日
        date: {
          original: '寛文元年7月29日',
          qualifier: 'exact',
          date: { year: 1661 },
        },
      },
      note: '水戸徳川家 初代。家康の十一男',
    },

    // ---- 3代〜7代(将軍家の直系と甲府家) ----
    iemitsu: {
      id: 'iemitsu',
      name: {
        surname: '徳川',
        given: '家光',
        surnameKana: 'とくがわ',
        givenKana: 'いえみつ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 慶長9年7月17日 = 1604年8月12日
        date: {
          original: '慶長9年7月17日',
          qualifier: 'exact',
          date: { year: 1604 },
        },
      },
      death: {
        type: 'death',
        // 慶安4年4月20日 = 1651年6月8日
        date: {
          original: '慶安4年4月20日',
          qualifier: 'exact',
          date: { year: 1651 },
        },
      },
      note: '3代将軍。秀忠の次男',
    },
    ietsuna: {
      id: 'ietsuna',
      name: {
        surname: '徳川',
        given: '家綱',
        surnameKana: 'とくがわ',
        givenKana: 'いえつな',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 寛永18年8月3日 = 1641年9月7日
        date: {
          original: '寛永18年8月3日',
          qualifier: 'exact',
          date: { year: 1641 },
        },
      },
      death: {
        type: 'death',
        // 延宝8年5月8日 = 1680年6月4日
        date: {
          original: '延宝8年5月8日',
          qualifier: 'exact',
          date: { year: 1680 },
        },
      },
      note: '4代将軍。家光の長男',
    },
    tsunashige: {
      id: 'tsunashige',
      name: {
        surname: '徳川',
        given: '綱重',
        surnameKana: 'とくがわ',
        givenKana: 'つなしげ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 正保元年5月24日 = 1644年6月28日
        date: {
          original: '正保元年5月24日',
          qualifier: 'exact',
          date: { year: 1644 },
        },
      },
      death: {
        type: 'death',
        // 延宝6年9月14日 = 1678年10月29日
        date: {
          original: '延宝6年9月14日',
          qualifier: 'exact',
          date: { year: 1678 },
        },
      },
      note: '甲府徳川家。家光の三男。6代将軍 家宣の実父',
    },
    tsunayoshi: {
      id: 'tsunayoshi',
      name: {
        surname: '徳川',
        given: '綱吉',
        surnameKana: 'とくがわ',
        givenKana: 'つなよし',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 正保3年1月8日 = 1646年2月23日
        date: {
          original: '正保3年1月8日',
          qualifier: 'exact',
          date: { year: 1646 },
        },
      },
      death: {
        type: 'death',
        // 宝永6年1月10日 = 1709年2月19日
        date: {
          original: '宝永6年1月10日',
          qualifier: 'exact',
          date: { year: 1709 },
        },
      },
      note: '5代将軍。家光の四男',
    },
    ienobu: {
      id: 'ienobu',
      name: {
        surname: '徳川',
        given: '家宣',
        surnameKana: 'とくがわ',
        givenKana: 'いえのぶ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 寛文2年4月25日 = 1662年6月11日
        date: {
          original: '寛文2年4月25日',
          qualifier: 'exact',
          date: { year: 1662 },
        },
      },
      death: {
        type: 'death',
        // 正徳2年10月14日 = 1712年11月12日
        date: {
          original: '正徳2年10月14日',
          qualifier: 'exact',
          date: { year: 1712 },
        },
      },
      note: '6代将軍。綱重の実子で、5代 綱吉の養子として将軍職を継いだ',
    },
    ietsugu: {
      id: 'ietsugu',
      name: {
        surname: '徳川',
        given: '家継',
        surnameKana: 'とくがわ',
        givenKana: 'いえつぐ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 宝永6年7月3日 = 1709年8月8日
        date: {
          original: '宝永6年7月3日',
          qualifier: 'exact',
          date: { year: 1709 },
        },
      },
      death: {
        type: 'death',
        // 正徳6年4月30日 = 1716年6月19日(この年に享保へ改元)
        date: {
          original: '正徳6年4月30日',
          qualifier: 'exact',
          date: { year: 1716 },
        },
      },
      note: '7代将軍。家宣の四男。8歳で没し、将軍家の直系は途絶えた',
    },

    // ---- 8代〜10代(紀州徳川家からの入嗣) ----
    mitsusada: {
      id: 'mitsusada',
      name: {
        surname: '徳川',
        given: '光貞',
        surnameKana: 'とくがわ',
        givenKana: 'みつさだ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 寛永3年12月11日 = 1627年1月28日
        date: {
          original: '寛永3年12月11日',
          qualifier: 'exact',
          date: { year: 1627 },
        },
      },
      death: {
        type: 'death',
        // 宝永2年8月8日 = 1705年9月25日
        date: {
          original: '宝永2年8月8日',
          qualifier: 'exact',
          date: { year: 1705 },
        },
      },
      note: '紀州徳川家 2代。8代将軍 吉宗の実父',
    },
    yoshimune: {
      id: 'yoshimune',
      name: {
        surname: '徳川',
        given: '吉宗',
        surnameKana: 'とくがわ',
        givenKana: 'よしむね',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 貞享元年10月21日 = 1684年11月27日
        date: {
          original: '貞享元年10月21日',
          qualifier: 'exact',
          date: { year: 1684 },
        },
      },
      death: {
        type: 'death',
        // 寛延4年6月20日 = 1751年7月12日
        date: {
          original: '寛延4年6月20日',
          qualifier: 'exact',
          date: { year: 1751 },
        },
      },
      note: '8代将軍。紀州徳川家から入嗣(家康の曾孫)',
    },
    ieshige: {
      id: 'ieshige',
      name: {
        surname: '徳川',
        given: '家重',
        surnameKana: 'とくがわ',
        givenKana: 'いえしげ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 正徳元年12月21日 = 1712年1月28日
        date: {
          original: '正徳元年12月21日',
          qualifier: 'exact',
          date: { year: 1712 },
        },
      },
      death: {
        type: 'death',
        // 宝暦11年6月12日 = 1761年7月13日
        date: {
          original: '宝暦11年6月12日',
          qualifier: 'exact',
          date: { year: 1761 },
        },
      },
      note: '9代将軍。吉宗の長男',
    },
    ieharu: {
      id: 'ieharu',
      name: {
        surname: '徳川',
        given: '家治',
        surnameKana: 'とくがわ',
        givenKana: 'いえはる',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 元文2年5月22日 = 1737年6月20日
        date: {
          original: '元文2年5月22日',
          qualifier: 'exact',
          date: { year: 1737 },
        },
      },
      death: {
        type: 'death',
        // 天明6年8月25日 = 1786年9月17日
        date: {
          original: '天明6年8月25日',
          qualifier: 'exact',
          date: { year: 1786 },
        },
      },
      note: '10代将軍。家重の長男',
    },

    // ---- 11代〜13代(一橋徳川家からの入嗣) ----
    munetada: {
      id: 'munetada',
      name: {
        surname: '徳川',
        given: '宗尹',
        surnameKana: 'とくがわ',
        givenKana: 'むねただ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 享保6年閏7月16日 = 1721年9月7日
        date: {
          original: '享保6年閏7月16日',
          qualifier: 'exact',
          date: { year: 1721 },
        },
      },
      death: {
        type: 'death',
        // 明和元年12月22日 = 1765年1月13日
        date: {
          original: '明和元年12月22日',
          qualifier: 'exact',
          date: { year: 1765 },
        },
      },
      note: '一橋徳川家 初代。吉宗の四男',
    },
    harusada: {
      id: 'harusada',
      name: {
        surname: '徳川',
        given: '治済',
        surnameKana: 'とくがわ',
        givenKana: 'はるさだ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 宝暦元年11月6日 = 1751年12月23日
        date: {
          original: '宝暦元年11月6日',
          qualifier: 'exact',
          date: { year: 1751 },
        },
      },
      death: {
        type: 'death',
        // 文政10年2月20日 = 1827年3月17日
        date: {
          original: '文政10年2月20日',
          qualifier: 'exact',
          date: { year: 1827 },
        },
      },
      note: '一橋徳川家 2代。11代将軍 家斉の実父',
    },
    ienari: {
      id: 'ienari',
      name: {
        surname: '徳川',
        given: '家斉',
        surnameKana: 'とくがわ',
        givenKana: 'いえなり',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 安永2年10月5日 = 1773年11月18日
        date: {
          original: '安永2年10月5日',
          qualifier: 'exact',
          date: { year: 1773 },
        },
      },
      death: {
        type: 'death',
        // 天保12年閏1月7日 = 1841年2月27日
        date: {
          original: '天保12年閏1月7日',
          qualifier: 'exact',
          date: { year: 1841 },
        },
      },
      note: '11代将軍。一橋徳川家から入嗣。在職50年',
    },
    ieyoshi: {
      id: 'ieyoshi',
      name: {
        surname: '徳川',
        given: '家慶',
        surnameKana: 'とくがわ',
        givenKana: 'いえよし',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 寛政5年5月14日 = 1793年6月22日
        date: {
          original: '寛政5年5月14日',
          qualifier: 'exact',
          date: { year: 1793 },
        },
      },
      death: {
        type: 'death',
        // 嘉永6年6月22日 = 1853年7月27日
        date: {
          original: '嘉永6年6月22日',
          qualifier: 'exact',
          date: { year: 1853 },
        },
      },
      note: '12代将軍。家斉の次男',
    },
    iesada: {
      id: 'iesada',
      name: {
        surname: '徳川',
        given: '家定',
        surnameKana: 'とくがわ',
        givenKana: 'いえさだ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 文政7年4月8日 = 1824年5月6日
        date: {
          original: '文政7年4月8日',
          qualifier: 'exact',
          date: { year: 1824 },
        },
      },
      death: {
        type: 'death',
        // 安政5年7月6日 = 1858年8月14日
        date: {
          original: '安政5年7月6日',
          qualifier: 'exact',
          date: { year: 1858 },
        },
      },
      note: '13代将軍。家慶の四男',
    },
    tenshoin: {
      id: 'tenshoin',
      name: { given: '天璋院', givenKana: 'てんしょういん' },
      gender: 'female',
      birth: {
        type: 'birth',
        // 天保6年12月19日 = 1836年2月5日
        date: {
          original: '天保6年12月19日',
          qualifier: 'exact',
          date: { year: 1836 },
        },
      },
      death: {
        type: 'death',
        // 改暦後のため年月日まで構造化する
        date: {
          original: '明治16年11月20日',
          qualifier: 'exact',
          date: { year: 1883, month: 11, day: 20 },
        },
      },
      note: '13代将軍 家定の正室(篤姫)',
    },

    // ---- 14代(紀州徳川家からの入嗣) ----
    nariyuki: {
      id: 'nariyuki',
      name: {
        surname: '徳川',
        given: '斉順',
        surnameKana: 'とくがわ',
        givenKana: 'なりゆき',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 享和元年9月9日 = 1801年10月16日
        date: {
          original: '享和元年9月9日',
          qualifier: 'exact',
          date: { year: 1801 },
        },
      },
      death: {
        type: 'death',
        // 弘化3年3月5日 = 1846年3月31日(家茂の誕生前に没した)
        date: {
          original: '弘化3年3月5日',
          qualifier: 'exact',
          date: { year: 1846 },
        },
      },
      note: '紀州徳川家 11代。家斉の子で、14代将軍 家茂の実父',
    },
    iemochi: {
      id: 'iemochi',
      name: {
        surname: '徳川',
        given: '家茂',
        surnameKana: 'とくがわ',
        givenKana: 'いえもち',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 弘化3年閏5月24日 = 1846年7月17日(実父 斉順の没後に誕生)
        date: {
          original: '弘化3年閏5月24日',
          qualifier: 'exact',
          date: { year: 1846 },
        },
      },
      death: {
        type: 'death',
        // 慶応2年7月20日 = 1866年8月29日
        date: {
          original: '慶応2年7月20日',
          qualifier: 'exact',
          date: { year: 1866 },
        },
      },
      note: '14代将軍。斉順の実子で、13代 家定の養子として将軍職を継いだ',
    },

    // ---- 水戸徳川家(15代 慶喜へ繋がる系統) ----
    yorishige: {
      id: 'yorishige',
      name: {
        surname: '松平',
        given: '頼重',
        surnameKana: 'まつだいら',
        givenKana: 'よりしげ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 元和8年7月1日 = 1622年8月7日
        date: {
          original: '元和8年7月1日',
          qualifier: 'exact',
          date: { year: 1622 },
        },
      },
      death: {
        type: 'death',
        // 元禄8年4月12日 = 1695年5月24日
        date: {
          original: '元禄8年4月12日',
          qualifier: 'exact',
          date: { year: 1695 },
        },
      },
      note: '高松松平家 初代。頼房の長男。水戸3代 綱條の実父',
    },
    mitsukuni: {
      id: 'mitsukuni',
      name: {
        surname: '徳川',
        given: '光圀',
        surnameKana: 'とくがわ',
        givenKana: 'みつくに',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 寛永5年6月10日 = 1628年7月11日
        date: {
          original: '寛永5年6月10日',
          qualifier: 'exact',
          date: { year: 1628 },
        },
      },
      death: {
        type: 'death',
        // 元禄13年12月6日 = 1701年1月14日
        date: {
          original: '元禄13年12月6日',
          qualifier: 'exact',
          date: { year: 1701 },
        },
      },
      note: '水戸徳川家 2代。頼房の三男',
    },
    tsunaeda: {
      id: 'tsunaeda',
      name: {
        surname: '徳川',
        given: '綱條',
        surnameKana: 'とくがわ',
        givenKana: 'つなえだ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 明暦2年8月26日 = 1656年10月13日
        date: {
          original: '明暦2年8月26日',
          qualifier: 'exact',
          date: { year: 1656 },
        },
      },
      death: {
        type: 'death',
        // 享保3年9月11日 = 1718年10月4日
        date: {
          original: '享保3年9月11日',
          qualifier: 'exact',
          date: { year: 1718 },
        },
      },
      note: '水戸徳川家 3代。松平頼重の実子で、光圀の養子となった',
    },
    munetaka: {
      id: 'munetaka',
      name: {
        surname: '徳川',
        given: '宗堯',
        surnameKana: 'とくがわ',
        givenKana: 'むねたか',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 宝永2年7月11日 = 1705年8月29日
        date: {
          original: '宝永2年7月11日',
          qualifier: 'exact',
          date: { year: 1705 },
        },
      },
      death: {
        type: 'death',
        // 享保15年4月7日 = 1730年5月23日
        date: {
          original: '享保15年4月7日',
          qualifier: 'exact',
          date: { year: 1730 },
        },
      },
      // 実父の松平頼豊は収録範囲外のため記録していない(養父 綱條のみで繋ぐ)
      note: '水戸徳川家 4代。綱條の養子',
    },
    munemoto: {
      id: 'munemoto',
      name: {
        surname: '徳川',
        given: '宗翰',
        surnameKana: 'とくがわ',
        givenKana: 'むねもと',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 享保13年7月29日 = 1728年9月3日
        date: {
          original: '享保13年7月29日',
          qualifier: 'exact',
          date: { year: 1728 },
        },
      },
      death: {
        type: 'death',
        // 明和3年2月14日 = 1766年3月24日
        date: {
          original: '明和3年2月14日',
          qualifier: 'exact',
          date: { year: 1766 },
        },
      },
      note: '水戸徳川家 5代。宗堯の長男',
    },
    harumori: {
      id: 'harumori',
      name: {
        surname: '徳川',
        given: '治保',
        surnameKana: 'とくがわ',
        givenKana: 'はるもり',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 寛延4年8月16日 = 1751年10月5日
        date: {
          original: '寛延4年8月16日',
          qualifier: 'exact',
          date: { year: 1751 },
        },
      },
      death: {
        type: 'death',
        // 文化2年11月1日 = 1805年12月21日
        date: {
          original: '文化2年11月1日',
          qualifier: 'exact',
          date: { year: 1805 },
        },
      },
      note: '水戸徳川家 6代。宗翰の長男',
    },
    harutoshi: {
      id: 'harutoshi',
      name: {
        surname: '徳川',
        given: '治紀',
        surnameKana: 'とくがわ',
        givenKana: 'はるとし',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 安永2年10月24日 = 1773年12月7日
        date: {
          original: '安永2年10月24日',
          qualifier: 'exact',
          date: { year: 1773 },
        },
      },
      death: {
        type: 'death',
        // 文化13年閏8月19日 = 1816年10月10日
        date: {
          original: '文化13年閏8月19日',
          qualifier: 'exact',
          date: { year: 1816 },
        },
      },
      note: '水戸徳川家 7代。治保の長男',
    },
    nariaki: {
      id: 'nariaki',
      name: {
        surname: '徳川',
        given: '斉昭',
        surnameKana: 'とくがわ',
        givenKana: 'なりあき',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 寛政12年3月11日 = 1800年4月4日
        date: {
          original: '寛政12年3月11日',
          qualifier: 'exact',
          date: { year: 1800 },
        },
      },
      death: {
        type: 'death',
        // 万延元年8月15日 = 1860年9月29日
        date: {
          original: '万延元年8月15日',
          qualifier: 'exact',
          date: { year: 1860 },
        },
      },
      note: '水戸徳川家 9代。治紀の三男。15代将軍 慶喜の実父',
    },
    yoshinobu: {
      id: 'yoshinobu',
      name: {
        surname: '徳川',
        given: '慶喜',
        surnameKana: 'とくがわ',
        givenKana: 'よしのぶ',
      },
      gender: 'male',
      birth: {
        type: 'birth',
        // 天保8年9月29日 = 1837年10月28日
        date: {
          original: '天保8年9月29日',
          qualifier: 'exact',
          date: { year: 1837 },
        },
      },
      death: {
        type: 'death',
        // 改暦後のため年月日まで構造化する
        date: {
          original: '大正2年11月22日',
          qualifier: 'exact',
          date: { year: 1913, month: 11, day: 22 },
        },
      },
      note: '15代将軍。水戸徳川家 斉昭の七男で、一橋徳川家を経て将軍職を継いだ',
    },
  },
  families: {
    // 家康の子(将軍家=秀忠、紀州家=頼宣、水戸家=頼房)。母は収録していないため
    // ひとり親家族として記録する
    'f-ieyasu': {
      id: 'f-ieyasu',
      spouseIds: ['ieyasu'],
      kind: 'unknown',
      events: [],
      children: [
        { childId: 'hidetada', pedigree: 'biological' },
        { childId: 'yorinobu', pedigree: 'biological' },
        { childId: 'yorifusa', pedigree: 'biological' },
      ],
    },
    // 秀忠と正室 崇源院。家光はこの夫婦の子
    'f-hidetada': {
      id: 'f-hidetada',
      spouseIds: ['hidetada', 'sugenin'],
      kind: 'married',
      events: [],
      children: [{ childId: 'iemitsu', pedigree: 'biological' }],
    },
    // 家光の子。4代 家綱・5代 綱吉と、甲府家の綱重
    'f-iemitsu': {
      id: 'f-iemitsu',
      spouseIds: ['iemitsu'],
      kind: 'unknown',
      events: [],
      children: [
        { childId: 'ietsuna', pedigree: 'biological' },
        { childId: 'tsunashige', pedigree: 'biological' },
        { childId: 'tsunayoshi', pedigree: 'biological' },
      ],
    },
    // 綱重の実子 家宣
    'f-tsunashige': {
      id: 'f-tsunashige',
      spouseIds: ['tsunashige'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'ienobu', pedigree: 'biological' }],
    },
    // 綱吉の養子 家宣(実父 綱重と併せて双方を記録する)
    'f-tsunayoshi': {
      id: 'f-tsunayoshi',
      spouseIds: ['tsunayoshi'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'ienobu', pedigree: 'adopted' }],
    },
    // 家宣の子 家継
    'f-ienobu': {
      id: 'f-ienobu',
      spouseIds: ['ienobu'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'ietsugu', pedigree: 'biological' }],
    },
    // 紀州徳川家: 頼宣 → 光貞 → 吉宗
    'f-yorinobu': {
      id: 'f-yorinobu',
      spouseIds: ['yorinobu'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'mitsusada', pedigree: 'biological' }],
    },
    'f-mitsusada': {
      id: 'f-mitsusada',
      spouseIds: ['mitsusada'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'yoshimune', pedigree: 'biological' }],
    },
    // 吉宗の子。9代 家重と、一橋家の宗尹
    'f-yoshimune': {
      id: 'f-yoshimune',
      spouseIds: ['yoshimune'],
      kind: 'unknown',
      events: [],
      children: [
        { childId: 'ieshige', pedigree: 'biological' },
        { childId: 'munetada', pedigree: 'biological' },
      ],
    },
    'f-ieshige': {
      id: 'f-ieshige',
      spouseIds: ['ieshige'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'ieharu', pedigree: 'biological' }],
    },
    // 一橋徳川家: 宗尹 → 治済 → 家斉
    'f-munetada': {
      id: 'f-munetada',
      spouseIds: ['munetada'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'harusada', pedigree: 'biological' }],
    },
    'f-harusada': {
      id: 'f-harusada',
      spouseIds: ['harusada'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'ienari', pedigree: 'biological' }],
    },
    // 家斉の子。12代 家慶と、紀州家を継いだ斉順
    'f-ienari': {
      id: 'f-ienari',
      spouseIds: ['ienari'],
      kind: 'unknown',
      events: [],
      children: [
        { childId: 'ieyoshi', pedigree: 'biological' },
        { childId: 'nariyuki', pedigree: 'biological' },
      ],
    },
    'f-ieyoshi': {
      id: 'f-ieyoshi',
      spouseIds: ['ieyoshi'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'iesada', pedigree: 'biological' }],
    },
    // 家定と正室 天璋院。実子はなく、家茂を養子として迎えた
    'f-iesada': {
      id: 'f-iesada',
      spouseIds: ['iesada', 'tenshoin'],
      kind: 'married',
      events: [],
      children: [{ childId: 'iemochi', pedigree: 'adopted' }],
    },
    // 斉順の実子 家茂(実父・養父の双方を記録する)
    'f-nariyuki': {
      id: 'f-nariyuki',
      spouseIds: ['nariyuki'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'iemochi', pedigree: 'biological' }],
    },
    // 水戸徳川家: 頼房 → (頼重・光圀) → 綱條 → 宗堯 → 宗翰 → 治保 → 治紀 → 斉昭 → 慶喜
    'f-yorifusa': {
      id: 'f-yorifusa',
      spouseIds: ['yorifusa'],
      kind: 'unknown',
      events: [],
      children: [
        { childId: 'yorishige', pedigree: 'biological' },
        { childId: 'mitsukuni', pedigree: 'biological' },
      ],
    },
    'f-yorishige': {
      id: 'f-yorishige',
      spouseIds: ['yorishige'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'tsunaeda', pedigree: 'biological' }],
    },
    'f-mitsukuni': {
      id: 'f-mitsukuni',
      spouseIds: ['mitsukuni'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'tsunaeda', pedigree: 'adopted' }],
    },
    'f-tsunaeda': {
      id: 'f-tsunaeda',
      spouseIds: ['tsunaeda'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'munetaka', pedigree: 'adopted' }],
    },
    'f-munetaka': {
      id: 'f-munetaka',
      spouseIds: ['munetaka'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'munemoto', pedigree: 'biological' }],
    },
    'f-munemoto': {
      id: 'f-munemoto',
      spouseIds: ['munemoto'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'harumori', pedigree: 'biological' }],
    },
    'f-harumori': {
      id: 'f-harumori',
      spouseIds: ['harumori'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'harutoshi', pedigree: 'biological' }],
    },
    'f-harutoshi': {
      id: 'f-harutoshi',
      spouseIds: ['harutoshi'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'nariaki', pedigree: 'biological' }],
    },
    'f-nariaki': {
      id: 'f-nariaki',
      spouseIds: ['nariaki'],
      kind: 'unknown',
      events: [],
      children: [{ childId: 'yoshinobu', pedigree: 'biological' }],
    },
  },
}
