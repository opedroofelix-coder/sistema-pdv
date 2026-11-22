import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/gilda-display/latin-400.css'
import '@fontsource-variable/eb-garamond/wght-italic.css'
import '@fontsource-variable/manrope/index.css'
import 'lenis/dist/lenis.css'
import './styles.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
