import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@gp-grid/react/dist/styles.css'
import App from './App.tsx'
import { ConformanceApp } from './ConformanceApp.tsx'

const AppRoot = new URLSearchParams(window.location.search).has('conformance') ? ConformanceApp : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
)
