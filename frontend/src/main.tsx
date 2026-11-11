import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { MethodistReportPage } from './MethodistReport'
import './styles.css'
import './methodist-report.css'
import './plan-transfers.css'
import './ui-polish.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{window.location.hash.startsWith('#/methodist-report/') ? <MethodistReportPage /> : <App />}</React.StrictMode>,
)
