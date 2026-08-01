import { isValidDateForYear } from './calendar-date'
import type { CalendarDate } from './types'

/**
 * 和暦⇄西暦の相互変換。
 * 元号は静的テーブルで管理し、大化(645年)〜令和の全元号を収録する。南北朝期は
 * 元徳→元弘→建武→北朝系列(暦応〜明徳)→応永の単一系列とし、元弘と並立した
 * 正慶および南朝元号(延元〜元中)は収録しない。
 * 改元境界日は「その元号が有効な最初の日/最後の日」で表す。
 *
 * 明治より前の行の start/end は、旧暦(太陰太陽暦)の改元年月日を「慣用の西暦
 * 対応年 + 旧暦の月日」の名目上の日付としてそのまま保持する(例: 天保の開始 =
 * 文政13年12月10日改元 → { year: 1830, month: 12, day: 10 }。閏月は同じ番号の
 * 月に畳む)。旧暦→グレゴリオ暦の天文学的換算は行わない方針のため、和暦入力の
 * 年月日をそのまま西暦フィールドへ写す既存の変換とこの表現は整合し、元年に対応
 * する西暦年・改元月日での境界判定・往復変換が同じロジックで機能する。明治以降の
 * 行は実際のグレゴリオ暦の境界日である。典拠と導出規則は
 * openspec change「extend-wareki-edo-eras」の era-data.md を参照。
 */

export interface Era {
  name: string
  /** この元号の最初の有効日 */
  start: { year: number; month: number; day: number }
  /** この元号の最後の有効日(現行元号は未設定) */
  end?: { year: number; month: number; day: number }
}

/**
 * 新しい元号ほど先頭。白雉→朱鳥→大宝の間には元号が停止した空位期間があり、
 * その間の日付はどの元号にも属さない(gregorianToWareki は null を返す)。
 */
export const ERA_TABLE: Era[] = [
  { name: '令和', start: { year: 2019, month: 5, day: 1 } },
  {
    name: '平成',
    start: { year: 1989, month: 1, day: 8 },
    end: { year: 2019, month: 4, day: 30 },
  },
  {
    name: '昭和',
    start: { year: 1926, month: 12, day: 25 },
    end: { year: 1989, month: 1, day: 7 },
  },
  {
    name: '大正',
    start: { year: 1912, month: 7, day: 30 },
    end: { year: 1926, month: 12, day: 24 },
  },
  {
    name: '明治',
    start: { year: 1868, month: 10, day: 23 },
    end: { year: 1912, month: 7, day: 29 },
  },
  {
    name: '慶応',
    start: { year: 1865, month: 4, day: 7 },
    end: { year: 1868, month: 10, day: 22 },
  },
  {
    name: '元治',
    start: { year: 1864, month: 2, day: 20 },
    end: { year: 1865, month: 4, day: 6 },
  },
  {
    name: '文久',
    start: { year: 1861, month: 2, day: 19 },
    end: { year: 1864, month: 2, day: 19 },
  },
  {
    name: '万延',
    start: { year: 1860, month: 3, day: 18 },
    end: { year: 1861, month: 2, day: 18 },
  },
  {
    name: '安政',
    start: { year: 1854, month: 11, day: 27 },
    end: { year: 1860, month: 3, day: 17 },
  },
  {
    name: '嘉永',
    start: { year: 1848, month: 2, day: 28 },
    end: { year: 1854, month: 11, day: 26 },
  },
  {
    name: '弘化',
    start: { year: 1844, month: 12, day: 2 },
    end: { year: 1848, month: 2, day: 27 },
  },
  {
    name: '天保',
    start: { year: 1830, month: 12, day: 10 },
    end: { year: 1844, month: 12, day: 1 },
  },
  {
    name: '文政',
    start: { year: 1818, month: 4, day: 22 },
    end: { year: 1830, month: 12, day: 9 },
  },
  {
    name: '文化',
    start: { year: 1804, month: 2, day: 11 },
    end: { year: 1818, month: 4, day: 21 },
  },
  {
    name: '享和',
    start: { year: 1801, month: 2, day: 5 },
    end: { year: 1804, month: 2, day: 10 },
  },
  {
    name: '寛政',
    start: { year: 1789, month: 1, day: 25 },
    end: { year: 1801, month: 2, day: 4 },
  },
  {
    name: '天明',
    start: { year: 1781, month: 4, day: 2 },
    end: { year: 1789, month: 1, day: 24 },
  },
  {
    name: '安永',
    start: { year: 1772, month: 11, day: 16 },
    end: { year: 1781, month: 4, day: 1 },
  },
  {
    name: '明和',
    start: { year: 1764, month: 6, day: 2 },
    end: { year: 1772, month: 11, day: 15 },
  },
  {
    name: '宝暦',
    start: { year: 1751, month: 10, day: 27 },
    end: { year: 1764, month: 6, day: 1 },
  },
  {
    name: '寛延',
    start: { year: 1748, month: 7, day: 12 },
    end: { year: 1751, month: 10, day: 26 },
  },
  {
    name: '延享',
    start: { year: 1744, month: 2, day: 21 },
    end: { year: 1748, month: 7, day: 11 },
  },
  {
    name: '寛保',
    start: { year: 1741, month: 2, day: 27 },
    end: { year: 1744, month: 2, day: 20 },
  },
  {
    name: '元文',
    start: { year: 1736, month: 4, day: 28 },
    end: { year: 1741, month: 2, day: 26 },
  },
  {
    name: '享保',
    start: { year: 1716, month: 6, day: 22 },
    end: { year: 1736, month: 4, day: 27 },
  },
  {
    name: '正徳',
    start: { year: 1711, month: 4, day: 25 },
    end: { year: 1716, month: 6, day: 21 },
  },
  {
    name: '宝永',
    start: { year: 1704, month: 3, day: 13 },
    end: { year: 1711, month: 4, day: 24 },
  },
  {
    name: '元禄',
    start: { year: 1688, month: 9, day: 30 },
    end: { year: 1704, month: 3, day: 12 },
  },
  {
    name: '貞享',
    start: { year: 1684, month: 2, day: 21 },
    end: { year: 1688, month: 9, day: 29 },
  },
  {
    name: '天和',
    start: { year: 1681, month: 9, day: 29 },
    end: { year: 1684, month: 2, day: 20 },
  },
  {
    name: '延宝',
    start: { year: 1673, month: 9, day: 21 },
    end: { year: 1681, month: 9, day: 28 },
  },
  {
    name: '寛文',
    start: { year: 1661, month: 4, day: 25 },
    end: { year: 1673, month: 9, day: 20 },
  },
  {
    name: '万治',
    start: { year: 1658, month: 7, day: 23 },
    end: { year: 1661, month: 4, day: 24 },
  },
  {
    name: '明暦',
    start: { year: 1655, month: 4, day: 13 },
    end: { year: 1658, month: 7, day: 22 },
  },
  {
    name: '承応',
    start: { year: 1652, month: 9, day: 18 },
    end: { year: 1655, month: 4, day: 12 },
  },
  {
    name: '慶安',
    start: { year: 1648, month: 2, day: 15 },
    end: { year: 1652, month: 9, day: 17 },
  },
  {
    name: '正保',
    start: { year: 1644, month: 12, day: 16 },
    end: { year: 1648, month: 2, day: 14 },
  },
  {
    name: '寛永',
    start: { year: 1624, month: 2, day: 30 },
    end: { year: 1644, month: 12, day: 15 },
  },
  {
    name: '元和',
    start: { year: 1615, month: 7, day: 13 },
    end: { year: 1624, month: 2, day: 29 },
  },
  {
    name: '慶長',
    start: { year: 1596, month: 10, day: 27 },
    end: { year: 1615, month: 7, day: 12 },
  },
  {
    name: '文禄',
    start: { year: 1592, month: 12, day: 8 },
    end: { year: 1596, month: 10, day: 26 },
  },
  {
    name: '天正',
    start: { year: 1573, month: 7, day: 28 },
    end: { year: 1592, month: 12, day: 7 },
  },
  {
    name: '元亀',
    start: { year: 1570, month: 4, day: 23 },
    end: { year: 1573, month: 7, day: 27 },
  },
  {
    name: '永禄',
    start: { year: 1558, month: 2, day: 28 },
    end: { year: 1570, month: 4, day: 22 },
  },
  {
    name: '弘治',
    start: { year: 1555, month: 10, day: 23 },
    end: { year: 1558, month: 2, day: 27 },
  },
  {
    name: '天文',
    start: { year: 1532, month: 7, day: 29 },
    end: { year: 1555, month: 10, day: 22 },
  },
  {
    name: '享禄',
    start: { year: 1528, month: 8, day: 20 },
    end: { year: 1532, month: 7, day: 28 },
  },
  {
    name: '大永',
    start: { year: 1521, month: 8, day: 23 },
    end: { year: 1528, month: 8, day: 19 },
  },
  {
    name: '永正',
    start: { year: 1504, month: 2, day: 30 },
    end: { year: 1521, month: 8, day: 22 },
  },
  {
    name: '文亀',
    start: { year: 1501, month: 2, day: 29 },
    end: { year: 1504, month: 2, day: 29 },
  },
  {
    name: '明応',
    start: { year: 1492, month: 7, day: 19 },
    end: { year: 1501, month: 2, day: 28 },
  },
  {
    name: '延徳',
    start: { year: 1489, month: 8, day: 21 },
    end: { year: 1492, month: 7, day: 18 },
  },
  {
    name: '長享',
    start: { year: 1487, month: 7, day: 20 },
    end: { year: 1489, month: 8, day: 20 },
  },
  {
    name: '文明',
    start: { year: 1469, month: 4, day: 28 },
    end: { year: 1487, month: 7, day: 19 },
  },
  {
    name: '応仁',
    start: { year: 1467, month: 3, day: 5 },
    end: { year: 1469, month: 4, day: 27 },
  },
  {
    name: '文正',
    start: { year: 1466, month: 2, day: 28 },
    end: { year: 1467, month: 3, day: 4 },
  },
  {
    name: '寛正',
    start: { year: 1460, month: 12, day: 21 },
    end: { year: 1466, month: 2, day: 27 },
  },
  {
    name: '長禄',
    start: { year: 1457, month: 9, day: 28 },
    end: { year: 1460, month: 12, day: 20 },
  },
  {
    name: '康正',
    start: { year: 1455, month: 7, day: 25 },
    end: { year: 1457, month: 9, day: 27 },
  },
  {
    name: '享徳',
    start: { year: 1452, month: 7, day: 25 },
    end: { year: 1455, month: 7, day: 24 },
  },
  {
    name: '宝徳',
    start: { year: 1449, month: 7, day: 28 },
    end: { year: 1452, month: 7, day: 24 },
  },
  {
    name: '文安',
    start: { year: 1444, month: 2, day: 5 },
    end: { year: 1449, month: 7, day: 27 },
  },
  {
    name: '嘉吉',
    start: { year: 1441, month: 2, day: 17 },
    end: { year: 1444, month: 2, day: 4 },
  },
  {
    name: '永享',
    start: { year: 1429, month: 9, day: 5 },
    end: { year: 1441, month: 2, day: 16 },
  },
  {
    name: '正長',
    start: { year: 1428, month: 4, day: 27 },
    end: { year: 1429, month: 9, day: 4 },
  },
  {
    name: '応永',
    start: { year: 1394, month: 7, day: 5 },
    end: { year: 1428, month: 4, day: 26 },
  },
  {
    name: '明徳',
    start: { year: 1390, month: 3, day: 26 },
    end: { year: 1394, month: 7, day: 4 },
  },
  {
    name: '康応',
    start: { year: 1389, month: 2, day: 9 },
    end: { year: 1390, month: 3, day: 25 },
  },
  {
    name: '嘉慶',
    start: { year: 1387, month: 8, day: 23 },
    end: { year: 1389, month: 2, day: 8 },
  },
  {
    name: '至徳',
    start: { year: 1384, month: 2, day: 27 },
    end: { year: 1387, month: 8, day: 22 },
  },
  {
    name: '永徳',
    start: { year: 1381, month: 2, day: 24 },
    end: { year: 1384, month: 2, day: 26 },
  },
  {
    name: '康暦',
    start: { year: 1379, month: 3, day: 22 },
    end: { year: 1381, month: 2, day: 23 },
  },
  {
    name: '永和',
    start: { year: 1375, month: 2, day: 27 },
    end: { year: 1379, month: 3, day: 21 },
  },
  {
    name: '応安',
    start: { year: 1368, month: 2, day: 18 },
    end: { year: 1375, month: 2, day: 26 },
  },
  {
    name: '貞治',
    start: { year: 1362, month: 9, day: 23 },
    end: { year: 1368, month: 2, day: 17 },
  },
  {
    name: '康安',
    start: { year: 1361, month: 3, day: 29 },
    end: { year: 1362, month: 9, day: 22 },
  },
  {
    name: '延文',
    start: { year: 1356, month: 3, day: 28 },
    end: { year: 1361, month: 3, day: 28 },
  },
  {
    name: '文和',
    start: { year: 1352, month: 9, day: 27 },
    end: { year: 1356, month: 3, day: 27 },
  },
  {
    name: '観応',
    start: { year: 1350, month: 2, day: 27 },
    end: { year: 1352, month: 9, day: 26 },
  },
  {
    name: '貞和',
    start: { year: 1345, month: 10, day: 21 },
    end: { year: 1350, month: 2, day: 26 },
  },
  {
    name: '康永',
    start: { year: 1342, month: 4, day: 27 },
    end: { year: 1345, month: 10, day: 20 },
  },
  {
    name: '暦応',
    start: { year: 1338, month: 8, day: 28 },
    end: { year: 1342, month: 4, day: 26 },
  },
  {
    name: '建武',
    start: { year: 1334, month: 1, day: 29 },
    end: { year: 1338, month: 8, day: 27 },
  },
  {
    name: '元弘',
    start: { year: 1331, month: 8, day: 9 },
    end: { year: 1334, month: 1, day: 28 },
  },
  {
    name: '元徳',
    start: { year: 1329, month: 8, day: 29 },
    end: { year: 1331, month: 8, day: 8 },
  },
  {
    name: '嘉暦',
    start: { year: 1326, month: 4, day: 26 },
    end: { year: 1329, month: 8, day: 28 },
  },
  {
    name: '正中',
    start: { year: 1324, month: 12, day: 9 },
    end: { year: 1326, month: 4, day: 25 },
  },
  {
    name: '元亨',
    start: { year: 1321, month: 2, day: 23 },
    end: { year: 1324, month: 12, day: 8 },
  },
  {
    name: '元応',
    start: { year: 1319, month: 4, day: 28 },
    end: { year: 1321, month: 2, day: 22 },
  },
  {
    name: '文保',
    start: { year: 1317, month: 2, day: 3 },
    end: { year: 1319, month: 4, day: 27 },
  },
  {
    name: '正和',
    start: { year: 1312, month: 3, day: 20 },
    end: { year: 1317, month: 2, day: 2 },
  },
  {
    name: '応長',
    start: { year: 1311, month: 4, day: 28 },
    end: { year: 1312, month: 3, day: 19 },
  },
  {
    name: '延慶',
    start: { year: 1308, month: 10, day: 9 },
    end: { year: 1311, month: 4, day: 27 },
  },
  {
    name: '徳治',
    start: { year: 1306, month: 12, day: 14 },
    end: { year: 1308, month: 10, day: 8 },
  },
  {
    name: '嘉元',
    start: { year: 1303, month: 8, day: 5 },
    end: { year: 1306, month: 12, day: 13 },
  },
  {
    name: '乾元',
    start: { year: 1302, month: 11, day: 21 },
    end: { year: 1303, month: 8, day: 4 },
  },
  {
    name: '正安',
    start: { year: 1299, month: 4, day: 25 },
    end: { year: 1302, month: 11, day: 20 },
  },
  {
    name: '永仁',
    start: { year: 1293, month: 8, day: 5 },
    end: { year: 1299, month: 4, day: 24 },
  },
  {
    name: '正応',
    start: { year: 1288, month: 4, day: 28 },
    end: { year: 1293, month: 8, day: 4 },
  },
  {
    name: '弘安',
    start: { year: 1278, month: 2, day: 29 },
    end: { year: 1288, month: 4, day: 27 },
  },
  {
    name: '建治',
    start: { year: 1275, month: 4, day: 25 },
    end: { year: 1278, month: 2, day: 28 },
  },
  {
    name: '文永',
    start: { year: 1264, month: 2, day: 28 },
    end: { year: 1275, month: 4, day: 24 },
  },
  {
    name: '弘長',
    start: { year: 1261, month: 2, day: 20 },
    end: { year: 1264, month: 2, day: 27 },
  },
  {
    name: '文応',
    start: { year: 1260, month: 4, day: 13 },
    end: { year: 1261, month: 2, day: 19 },
  },
  {
    name: '正元',
    start: { year: 1259, month: 3, day: 26 },
    end: { year: 1260, month: 4, day: 12 },
  },
  {
    name: '正嘉',
    start: { year: 1257, month: 3, day: 14 },
    end: { year: 1259, month: 3, day: 25 },
  },
  {
    name: '康元',
    start: { year: 1256, month: 10, day: 5 },
    end: { year: 1257, month: 3, day: 13 },
  },
  {
    name: '建長',
    start: { year: 1249, month: 3, day: 18 },
    end: { year: 1256, month: 10, day: 4 },
  },
  {
    name: '宝治',
    start: { year: 1247, month: 2, day: 28 },
    end: { year: 1249, month: 3, day: 17 },
  },
  {
    name: '寛元',
    start: { year: 1243, month: 2, day: 26 },
    end: { year: 1247, month: 2, day: 27 },
  },
  {
    name: '仁治',
    start: { year: 1240, month: 7, day: 16 },
    end: { year: 1243, month: 2, day: 25 },
  },
  {
    name: '延応',
    start: { year: 1239, month: 2, day: 7 },
    end: { year: 1240, month: 7, day: 15 },
  },
  {
    name: '暦仁',
    start: { year: 1238, month: 11, day: 23 },
    end: { year: 1239, month: 2, day: 6 },
  },
  {
    name: '嘉禎',
    start: { year: 1235, month: 9, day: 19 },
    end: { year: 1238, month: 11, day: 22 },
  },
  {
    name: '文暦',
    start: { year: 1234, month: 11, day: 5 },
    end: { year: 1235, month: 9, day: 18 },
  },
  {
    name: '天福',
    start: { year: 1233, month: 4, day: 15 },
    end: { year: 1234, month: 11, day: 4 },
  },
  {
    name: '貞永',
    start: { year: 1232, month: 4, day: 2 },
    end: { year: 1233, month: 4, day: 14 },
  },
  {
    name: '寛喜',
    start: { year: 1229, month: 3, day: 5 },
    end: { year: 1232, month: 4, day: 1 },
  },
  {
    name: '安貞',
    start: { year: 1227, month: 12, day: 10 },
    end: { year: 1229, month: 3, day: 4 },
  },
  {
    name: '嘉禄',
    start: { year: 1225, month: 4, day: 20 },
    end: { year: 1227, month: 12, day: 9 },
  },
  {
    name: '元仁',
    start: { year: 1224, month: 11, day: 20 },
    end: { year: 1225, month: 4, day: 19 },
  },
  {
    name: '貞応',
    start: { year: 1222, month: 4, day: 13 },
    end: { year: 1224, month: 11, day: 19 },
  },
  {
    name: '承久',
    start: { year: 1219, month: 4, day: 12 },
    end: { year: 1222, month: 4, day: 12 },
  },
  {
    name: '建保',
    start: { year: 1213, month: 12, day: 6 },
    end: { year: 1219, month: 4, day: 11 },
  },
  {
    name: '建暦',
    start: { year: 1211, month: 3, day: 9 },
    end: { year: 1213, month: 12, day: 5 },
  },
  {
    name: '承元',
    start: { year: 1207, month: 10, day: 25 },
    end: { year: 1211, month: 3, day: 8 },
  },
  {
    name: '建永',
    start: { year: 1206, month: 4, day: 27 },
    end: { year: 1207, month: 10, day: 24 },
  },
  {
    name: '元久',
    start: { year: 1204, month: 2, day: 20 },
    end: { year: 1206, month: 4, day: 26 },
  },
  {
    name: '建仁',
    start: { year: 1201, month: 2, day: 13 },
    end: { year: 1204, month: 2, day: 19 },
  },
  {
    name: '正治',
    start: { year: 1199, month: 4, day: 27 },
    end: { year: 1201, month: 2, day: 12 },
  },
  {
    name: '建久',
    start: { year: 1190, month: 4, day: 11 },
    end: { year: 1199, month: 4, day: 26 },
  },
  {
    name: '文治',
    start: { year: 1185, month: 8, day: 14 },
    end: { year: 1190, month: 4, day: 10 },
  },
  {
    name: '元暦',
    start: { year: 1184, month: 4, day: 16 },
    end: { year: 1185, month: 8, day: 13 },
  },
  {
    name: '寿永',
    start: { year: 1182, month: 5, day: 27 },
    end: { year: 1184, month: 4, day: 15 },
  },
  {
    name: '養和',
    start: { year: 1181, month: 7, day: 14 },
    end: { year: 1182, month: 5, day: 26 },
  },
  {
    name: '治承',
    start: { year: 1177, month: 8, day: 4 },
    end: { year: 1181, month: 7, day: 13 },
  },
  {
    name: '安元',
    start: { year: 1175, month: 7, day: 28 },
    end: { year: 1177, month: 8, day: 3 },
  },
  {
    name: '承安',
    start: { year: 1171, month: 4, day: 21 },
    end: { year: 1175, month: 7, day: 27 },
  },
  {
    name: '嘉応',
    start: { year: 1169, month: 4, day: 8 },
    end: { year: 1171, month: 4, day: 20 },
  },
  {
    name: '仁安',
    start: { year: 1166, month: 8, day: 27 },
    end: { year: 1169, month: 4, day: 7 },
  },
  {
    name: '永万',
    start: { year: 1165, month: 6, day: 5 },
    end: { year: 1166, month: 8, day: 26 },
  },
  {
    name: '長寛',
    start: { year: 1163, month: 3, day: 29 },
    end: { year: 1165, month: 6, day: 4 },
  },
  {
    name: '応保',
    start: { year: 1161, month: 9, day: 4 },
    end: { year: 1163, month: 3, day: 28 },
  },
  {
    name: '永暦',
    start: { year: 1160, month: 1, day: 10 },
    end: { year: 1161, month: 9, day: 3 },
  },
  {
    name: '平治',
    start: { year: 1159, month: 4, day: 20 },
    end: { year: 1160, month: 1, day: 9 },
  },
  {
    name: '保元',
    start: { year: 1156, month: 4, day: 27 },
    end: { year: 1159, month: 4, day: 19 },
  },
  {
    name: '久寿',
    start: { year: 1154, month: 10, day: 28 },
    end: { year: 1156, month: 4, day: 26 },
  },
  {
    name: '仁平',
    start: { year: 1151, month: 1, day: 26 },
    end: { year: 1154, month: 10, day: 27 },
  },
  {
    name: '久安',
    start: { year: 1145, month: 7, day: 22 },
    end: { year: 1151, month: 1, day: 25 },
  },
  {
    name: '天養',
    start: { year: 1144, month: 2, day: 23 },
    end: { year: 1145, month: 7, day: 21 },
  },
  {
    name: '康治',
    start: { year: 1142, month: 4, day: 28 },
    end: { year: 1144, month: 2, day: 22 },
  },
  {
    name: '永治',
    start: { year: 1141, month: 7, day: 10 },
    end: { year: 1142, month: 4, day: 27 },
  },
  {
    name: '保延',
    start: { year: 1135, month: 4, day: 27 },
    end: { year: 1141, month: 7, day: 9 },
  },
  {
    name: '長承',
    start: { year: 1132, month: 8, day: 11 },
    end: { year: 1135, month: 4, day: 26 },
  },
  {
    name: '天承',
    start: { year: 1131, month: 1, day: 29 },
    end: { year: 1132, month: 8, day: 10 },
  },
  {
    name: '大治',
    start: { year: 1126, month: 1, day: 22 },
    end: { year: 1131, month: 1, day: 28 },
  },
  {
    name: '天治',
    start: { year: 1124, month: 4, day: 3 },
    end: { year: 1126, month: 1, day: 21 },
  },
  {
    name: '保安',
    start: { year: 1120, month: 4, day: 10 },
    end: { year: 1124, month: 4, day: 2 },
  },
  {
    name: '元永',
    start: { year: 1118, month: 4, day: 3 },
    end: { year: 1120, month: 4, day: 9 },
  },
  {
    name: '永久',
    start: { year: 1113, month: 7, day: 13 },
    end: { year: 1118, month: 4, day: 2 },
  },
  {
    name: '天永',
    start: { year: 1110, month: 7, day: 13 },
    end: { year: 1113, month: 7, day: 12 },
  },
  {
    name: '天仁',
    start: { year: 1108, month: 8, day: 3 },
    end: { year: 1110, month: 7, day: 12 },
  },
  {
    name: '嘉承',
    start: { year: 1106, month: 4, day: 9 },
    end: { year: 1108, month: 8, day: 2 },
  },
  {
    name: '長治',
    start: { year: 1104, month: 2, day: 10 },
    end: { year: 1106, month: 4, day: 8 },
  },
  {
    name: '康和',
    start: { year: 1099, month: 8, day: 28 },
    end: { year: 1104, month: 2, day: 9 },
  },
  {
    name: '承徳',
    start: { year: 1097, month: 11, day: 21 },
    end: { year: 1099, month: 8, day: 27 },
  },
  {
    name: '永長',
    start: { year: 1096, month: 12, day: 17 },
    end: { year: 1097, month: 11, day: 20 },
  },
  {
    name: '嘉保',
    start: { year: 1094, month: 12, day: 15 },
    end: { year: 1096, month: 12, day: 16 },
  },
  {
    name: '寛治',
    start: { year: 1087, month: 4, day: 7 },
    end: { year: 1094, month: 12, day: 14 },
  },
  {
    name: '応徳',
    start: { year: 1084, month: 2, day: 7 },
    end: { year: 1087, month: 4, day: 6 },
  },
  {
    name: '永保',
    start: { year: 1081, month: 2, day: 10 },
    end: { year: 1084, month: 2, day: 6 },
  },
  {
    name: '承暦',
    start: { year: 1077, month: 11, day: 17 },
    end: { year: 1081, month: 2, day: 9 },
  },
  {
    name: '承保',
    start: { year: 1074, month: 8, day: 23 },
    end: { year: 1077, month: 11, day: 16 },
  },
  {
    name: '延久',
    start: { year: 1069, month: 4, day: 13 },
    end: { year: 1074, month: 8, day: 22 },
  },
  {
    name: '治暦',
    start: { year: 1065, month: 8, day: 2 },
    end: { year: 1069, month: 4, day: 12 },
  },
  {
    name: '康平',
    start: { year: 1058, month: 8, day: 29 },
    end: { year: 1065, month: 8, day: 1 },
  },
  {
    name: '天喜',
    start: { year: 1053, month: 1, day: 11 },
    end: { year: 1058, month: 8, day: 28 },
  },
  {
    name: '永承',
    start: { year: 1046, month: 4, day: 14 },
    end: { year: 1053, month: 1, day: 10 },
  },
  {
    name: '寛徳',
    start: { year: 1044, month: 11, day: 24 },
    end: { year: 1046, month: 4, day: 13 },
  },
  {
    name: '長久',
    start: { year: 1040, month: 11, day: 10 },
    end: { year: 1044, month: 11, day: 23 },
  },
  {
    name: '長暦',
    start: { year: 1037, month: 4, day: 21 },
    end: { year: 1040, month: 11, day: 9 },
  },
  {
    name: '長元',
    start: { year: 1028, month: 7, day: 25 },
    end: { year: 1037, month: 4, day: 20 },
  },
  {
    name: '万寿',
    start: { year: 1024, month: 7, day: 13 },
    end: { year: 1028, month: 7, day: 24 },
  },
  {
    name: '治安',
    start: { year: 1021, month: 2, day: 2 },
    end: { year: 1024, month: 7, day: 12 },
  },
  {
    name: '寛仁',
    start: { year: 1017, month: 4, day: 23 },
    end: { year: 1021, month: 2, day: 1 },
  },
  {
    name: '長和',
    start: { year: 1012, month: 12, day: 25 },
    end: { year: 1017, month: 4, day: 22 },
  },
  {
    name: '寛弘',
    start: { year: 1004, month: 7, day: 20 },
    end: { year: 1012, month: 12, day: 24 },
  },
  {
    name: '長保',
    start: { year: 999, month: 1, day: 13 },
    end: { year: 1004, month: 7, day: 19 },
  },
  {
    name: '長徳',
    start: { year: 995, month: 2, day: 22 },
    end: { year: 999, month: 1, day: 12 },
  },
  {
    name: '正暦',
    start: { year: 990, month: 11, day: 7 },
    end: { year: 995, month: 2, day: 21 },
  },
  {
    name: '永祚',
    start: { year: 989, month: 8, day: 8 },
    end: { year: 990, month: 11, day: 6 },
  },
  {
    name: '永延',
    start: { year: 987, month: 4, day: 5 },
    end: { year: 989, month: 8, day: 7 },
  },
  {
    name: '寛和',
    start: { year: 985, month: 4, day: 27 },
    end: { year: 987, month: 4, day: 4 },
  },
  {
    name: '永観',
    start: { year: 983, month: 4, day: 15 },
    end: { year: 985, month: 4, day: 26 },
  },
  {
    name: '天元',
    start: { year: 978, month: 11, day: 29 },
    end: { year: 983, month: 4, day: 14 },
  },
  {
    name: '貞元',
    start: { year: 976, month: 7, day: 13 },
    end: { year: 978, month: 11, day: 28 },
  },
  {
    name: '天延',
    start: { year: 973, month: 12, day: 20 },
    end: { year: 976, month: 7, day: 12 },
  },
  {
    name: '天禄',
    start: { year: 970, month: 3, day: 25 },
    end: { year: 973, month: 12, day: 19 },
  },
  {
    name: '安和',
    start: { year: 968, month: 8, day: 13 },
    end: { year: 970, month: 3, day: 24 },
  },
  {
    name: '康保',
    start: { year: 964, month: 7, day: 10 },
    end: { year: 968, month: 8, day: 12 },
  },
  {
    name: '応和',
    start: { year: 961, month: 2, day: 16 },
    end: { year: 964, month: 7, day: 9 },
  },
  {
    name: '天徳',
    start: { year: 957, month: 10, day: 27 },
    end: { year: 961, month: 2, day: 15 },
  },
  {
    name: '天暦',
    start: { year: 947, month: 4, day: 22 },
    end: { year: 957, month: 10, day: 26 },
  },
  {
    name: '天慶',
    start: { year: 938, month: 5, day: 22 },
    end: { year: 947, month: 4, day: 21 },
  },
  {
    name: '承平',
    start: { year: 931, month: 4, day: 26 },
    end: { year: 938, month: 5, day: 21 },
  },
  {
    name: '延長',
    start: { year: 923, month: 4, day: 11 },
    end: { year: 931, month: 4, day: 25 },
  },
  {
    name: '延喜',
    start: { year: 901, month: 7, day: 15 },
    end: { year: 923, month: 4, day: 10 },
  },
  {
    name: '昌泰',
    start: { year: 898, month: 4, day: 26 },
    end: { year: 901, month: 7, day: 14 },
  },
  {
    name: '寛平',
    start: { year: 889, month: 4, day: 27 },
    end: { year: 898, month: 4, day: 25 },
  },
  {
    name: '仁和',
    start: { year: 885, month: 2, day: 21 },
    end: { year: 889, month: 4, day: 26 },
  },
  {
    name: '元慶',
    start: { year: 877, month: 4, day: 16 },
    end: { year: 885, month: 2, day: 20 },
  },
  {
    name: '貞観',
    start: { year: 859, month: 4, day: 15 },
    end: { year: 877, month: 4, day: 15 },
  },
  {
    name: '天安',
    start: { year: 857, month: 2, day: 21 },
    end: { year: 859, month: 4, day: 14 },
  },
  {
    name: '斉衡',
    start: { year: 854, month: 11, day: 30 },
    end: { year: 857, month: 2, day: 20 },
  },
  {
    name: '仁寿',
    start: { year: 851, month: 4, day: 28 },
    end: { year: 854, month: 11, day: 29 },
  },
  {
    name: '嘉祥',
    start: { year: 848, month: 6, day: 13 },
    end: { year: 851, month: 4, day: 27 },
  },
  {
    name: '承和',
    start: { year: 834, month: 1, day: 3 },
    end: { year: 848, month: 6, day: 12 },
  },
  {
    name: '天長',
    start: { year: 824, month: 1, day: 5 },
    end: { year: 834, month: 1, day: 2 },
  },
  {
    name: '弘仁',
    start: { year: 810, month: 9, day: 19 },
    end: { year: 824, month: 1, day: 4 },
  },
  {
    name: '大同',
    start: { year: 806, month: 5, day: 18 },
    end: { year: 810, month: 9, day: 18 },
  },
  {
    name: '延暦',
    start: { year: 782, month: 8, day: 19 },
    end: { year: 806, month: 5, day: 17 },
  },
  {
    name: '天応',
    start: { year: 781, month: 1, day: 1 },
    end: { year: 782, month: 8, day: 18 },
  },
  {
    name: '宝亀',
    start: { year: 770, month: 10, day: 1 },
    end: { year: 780, month: 12, day: 30 },
  },
  {
    name: '神護景雲',
    start: { year: 767, month: 8, day: 16 },
    end: { year: 770, month: 9, day: 30 },
  },
  {
    name: '天平神護',
    start: { year: 765, month: 1, day: 7 },
    end: { year: 767, month: 8, day: 15 },
  },
  {
    name: '天平宝字',
    start: { year: 757, month: 8, day: 18 },
    end: { year: 765, month: 1, day: 6 },
  },
  {
    name: '天平勝宝',
    start: { year: 749, month: 7, day: 2 },
    end: { year: 757, month: 8, day: 17 },
  },
  {
    name: '天平感宝',
    start: { year: 749, month: 4, day: 14 },
    end: { year: 749, month: 7, day: 1 },
  },
  {
    name: '天平',
    start: { year: 729, month: 8, day: 5 },
    end: { year: 749, month: 4, day: 13 },
  },
  {
    name: '神亀',
    start: { year: 724, month: 2, day: 4 },
    end: { year: 729, month: 8, day: 4 },
  },
  {
    name: '養老',
    start: { year: 717, month: 11, day: 17 },
    end: { year: 724, month: 2, day: 3 },
  },
  {
    name: '霊亀',
    start: { year: 715, month: 9, day: 2 },
    end: { year: 717, month: 11, day: 16 },
  },
  {
    name: '和銅',
    start: { year: 708, month: 1, day: 11 },
    end: { year: 715, month: 9, day: 1 },
  },
  {
    name: '慶雲',
    start: { year: 704, month: 5, day: 10 },
    end: { year: 708, month: 1, day: 10 },
  },
  {
    name: '大宝',
    start: { year: 701, month: 3, day: 21 },
    end: { year: 704, month: 5, day: 9 },
  },
  {
    name: '朱鳥',
    start: { year: 686, month: 7, day: 20 },
    end: { year: 686, month: 12, day: 30 },
  },
  {
    name: '白雉',
    start: { year: 650, month: 2, day: 15 },
    end: { year: 654, month: 12, day: 30 },
  },
  {
    name: '大化',
    start: { year: 645, month: 6, day: 19 },
    end: { year: 650, month: 2, day: 14 },
  },
]

export interface WarekiDate {
  era: string
  /** 元号内の年(元年 = 1) */
  year: number
  month?: number
  day?: number
}

export type WarekiResult<T> =
  { ok: true; value: T } | { ok: false; message: string }

function toOrdinal(d: { year: number; month: number; day: number }): number {
  return d.year * 10000 + d.month * 100 + d.day
}

/** 西暦年を元号内の年へ(元年 = 1) */
function eraYearOf(era: Era, gregorianYear: number): number {
  return gregorianYear - era.start.year + 1
}

export function findEra(name: string): Era | undefined {
  return ERA_TABLE.find((e) => e.name === name)
}

/** 和暦→西暦。部分日付(年のみ・年月のみ)を許容し、範囲外・存在しない日付はエラーで報告する */
export function warekiToGregorian(
  wareki: WarekiDate,
): WarekiResult<CalendarDate> {
  const era = findEra(wareki.era)
  if (!era)
    return { ok: false, message: `元号「${wareki.era}」には対応していません` }
  if (!Number.isInteger(wareki.year) || wareki.year < 1) {
    return {
      ok: false,
      message: `${era.name}の年は元年(1年)以降で入力してください`,
    }
  }
  // end のない現行元号には年の上限を設けない。西暦入力は未来年(例: 2033)を拒否しない
  // ため、同じ未来の日付が和暦表記(令和15年)でだけ「存在しません」になる非対称を避ける。
  // 実行時刻(new Date())に依存した判定もなくなり、結果が入力だけで決まる
  if (era.end) {
    const max = eraYearOf(era, era.end.year)
    if (wareki.year > max) {
      return {
        ok: false,
        message: `${era.name}は${max}年までです(${era.name}${wareki.year}年は存在しません)`,
      }
    }
  }
  const year = era.start.year + wareki.year - 1
  // 明治6年(1873年)より前は旧暦の日付として暦法非依存の緩い検査になる(calendar-date.ts参照)
  if (!isValidDateForYear(year, wareki.month, wareki.day)) {
    return {
      ok: false,
      message: `存在しない日付です(${year}年${wareki.month}月${wareki.day}日)`,
    }
  }
  if (wareki.month !== undefined && wareki.day !== undefined) {
    const ord = toOrdinal({ year, month: wareki.month, day: wareki.day })
    if (ord < toOrdinal(era.start)) {
      const s = era.start
      return {
        ok: false,
        message: `${era.name}は${era.name}元年${s.month}月${s.day}日からです`,
      }
    }
    if (era.end && ord > toOrdinal(era.end)) {
      const e = era.end
      return {
        ok: false,
        message: `${era.name}は${era.name}${eraYearOf(era, e.year)}年${e.month}月${e.day}日までです`,
      }
    }
  } else if (wareki.month !== undefined) {
    // 年月のみの入力も月単位で改元境界を検査する。境界月そのもの(例: 昭和64年1月)は
    // その月内に元号の有効な日が残っているため許容し、完全に範囲外の月だけを拒否する。
    // 開始側は開始月より前のみ拒否するため、「明治元年5月」のような立年改元
    // (改元をその年の年初へ遡らせる慣行)に基づく表記は受理できない。日付まで入力した
    // 「明治元年5月1日」が従来から拒否されることとの一貫性を優先したトレードオフで、
    // 立年改元の表記を扱いたい場合は原文のまま保持する運用(FuzzyDate.original)に頼る
    const monthOrd = year * 100 + wareki.month
    if (monthOrd < era.start.year * 100 + era.start.month) {
      const s = era.start
      return {
        ok: false,
        message: `${era.name}は${era.name}元年${s.month}月${s.day}日からです`,
      }
    }
    if (era.end && monthOrd > era.end.year * 100 + era.end.month) {
      const e = era.end
      return {
        ok: false,
        message: `${era.name}は${era.name}${eraYearOf(era, e.year)}年${e.month}月${e.day}日までです`,
      }
    }
  }
  return {
    ok: true,
    value: {
      year,
      ...(wareki.month !== undefined && { month: wareki.month }),
      ...(wareki.day !== undefined && { day: wareki.day }),
    },
  }
}

/**
 * 西暦→和暦。テーブル範囲外(明治より前)は null を返す。
 * 年のみの入力で改元年(例: 1989)にあたる場合は、その年の12月31日時点の元号で表す。
 */
export function gregorianToWareki(date: CalendarDate): WarekiDate | null {
  const ord = toOrdinal({
    year: date.year,
    month: date.month ?? 12,
    day: date.day ?? 31,
  })
  for (const era of ERA_TABLE) {
    if (ord < toOrdinal(era.start)) continue
    if (era.end && ord > toOrdinal(era.end)) continue
    return {
      era: era.name,
      year: date.year - era.start.year + 1,
      ...(date.month !== undefined && { month: date.month }),
      ...(date.day !== undefined && { day: date.day }),
    }
  }
  return null
}

/** 「昭和39年10月10日」形式。元年は「元年」と表記する */
export function formatWareki(w: WarekiDate): string {
  const y = w.year === 1 ? '元' : String(w.year)
  let s = `${w.era}${y}年`
  if (w.month !== undefined) s += `${w.month}月`
  if (w.day !== undefined) s += `${w.day}日`
  return s
}

/** 「1964年10月10日」形式 */
export function formatGregorian(d: CalendarDate): string {
  let s = `${d.year}年`
  if (d.month !== undefined) s += `${d.month}月`
  if (d.day !== undefined) s += `${d.day}日`
  return s
}
