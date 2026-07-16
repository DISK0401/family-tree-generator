// family-chart スパイク検証:
// (1) 複数配偶者(再婚) (2) 養子リンクの視覚区別(後処理) (3) HTMLカスタムカードでの縦書き
import f3 from 'family-chart';
import 'family-chart/styles/family-chart.css';

type SpikeDatum = {
  id: string;
  data: { gender: 'M' | 'F'; label: string; years: string; adopted?: boolean };
  rels: { parents?: string[]; spouses?: string[]; children?: string[] };
};

// 髙・廣など旧字体を含む3世代+再婚+養子のサンプル
const data: SpikeDatum[] = [
  {
    id: 'A',
    data: { gender: 'M', label: '髙橋 廣太郎', years: '昭和10–平成20' },
    rels: { spouses: ['B', 'C'], children: ['D', 'E', 'F'] },
  },
  {
    id: 'B',
    data: { gender: 'F', label: '髙橋 靜子', years: '昭和12–' },
    rels: { spouses: ['A'], children: ['D'] },
  },
  {
    id: 'C',
    data: { gender: 'F', label: '髙橋 美代', years: '昭和18–' },
    rels: { spouses: ['A'], children: ['E', 'F'] },
  },
  {
    id: 'D',
    data: { gender: 'M', label: '髙橋 一郎', years: '昭和35–' },
    rels: { parents: ['A', 'B'], spouses: ['G'], children: ['H'] },
  },
  {
    id: 'E',
    data: { gender: 'F', label: '髙橋 花子', years: '昭和45–' },
    rels: { parents: ['A', 'C'] },
  },
  // F は養子(A-C の家族へ養子縁組)
  {
    id: 'F',
    data: { gender: 'M', label: '髙橋 守', years: '昭和48–', adopted: true },
    rels: { parents: ['A', 'C'] },
  },
  {
    id: 'G',
    data: { gender: 'F', label: '髙橋 恵', years: '昭和38–' },
    rels: { spouses: ['D'], children: ['H'] },
  },
  {
    id: 'H',
    data: { gender: 'M', label: '髙橋 翔', years: '平成2–' },
    rels: { parents: ['D', 'G'] },
  },
];

const chart = f3
  .createChart('#FamilyChart', data as never)
  .setTransitionTime(0)
  .setCardYSpacing(170)
  .setCardXSpacing(180)
  .setSingleParentEmptyCard(false);

const card = chart.setCardHtml();
card.setStyle('rect');
card.setCardDim({ w: 96, h: 150, img: false });
// 検証(3): 縦書きカスタムカード
card.setCardInnerHtmlCreator((d) => {
  const p = d.data as unknown as SpikeDatum;
  const female = p.data.gender === 'F' ? ' female' : '';
  return `<div class="spike-card${female}">
    <div class="name">${p.data.label}</div>
    <div class="years">${p.data.years}</div>
  </div>`;
});

chart.updateTree({ initial: true });

// 検証(2): 養子リンクを後処理で破線化
// link datum: { source, target, is_ancestry, ... } / 子→親リンクは source=child(ancestry側)
function markAdoptedLinks() {
  const svg = document.querySelector('#FamilyChart svg');
  if (!svg) return;
  const links = svg.querySelectorAll('path.link');
  links.forEach((el) => {
    const datum = (el as unknown as { __data__?: { source?: unknown; target?: unknown } })
      .__data__;
    if (!datum) return;
    const nodes = [datum.source, datum.target]
      .flat()
      .filter(Boolean) as { data?: { data?: { adopted?: boolean } } }[];
    if (nodes.some((n) => n?.data?.data?.adopted)) {
      el.classList.add('adopted-link');
    }
  });
  document.body.dataset.adoptedLinks = String(
    svg.querySelectorAll('path.link.adopted-link').length,
  );
}
markAdoptedLinks();

// 検証結果をテストから読めるように書き出す
document.body.dataset.cards = String(document.querySelectorAll('.spike-card').length);
document.body.dataset.links = String(document.querySelectorAll('path.link').length);
