import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Root } from './Root'

// 書体は自己ホストのWebフォントで全OS同一のレンダリングにする(Windowsの游明朝/游ゴシックは
// 細く貧相に描画されるため)。詳細は public/fonts.css 冒頭コメントと public/fonts/README.md 参照。
// @font-face定義(600件超・gzip約150KB)をバンドルCSSに含めると全ルートの初回描画を
// ブロックするため、バンドル外(/fonts.css)に置いてここで非同期に適用する。
// font-display: swap のため、適用までは代替書体で即座に文字が表示される。
// CSPがインラインscriptを禁止しているので、index.htmlのonload属性ではなくここで行う
const fontStylesheet = document.createElement('link')
fontStylesheet.rel = 'stylesheet'
fontStylesheet.href = '/fonts.css'
document.head.appendChild(fontStylesheet)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
