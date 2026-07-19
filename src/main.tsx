import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// 書体は自己ホストのWebフォントで全OS同一のレンダリングにする(Windowsの游明朝/游ゴシックは
// 細く貧相に描画されるため)。詳細は fonts.css 冒頭コメントと public/fonts/README.md 参照
import './styles/fonts.css'
import './index.css'
import { Root } from './Root'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
