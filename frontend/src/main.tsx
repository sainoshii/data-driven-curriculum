import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { MethodistReportPage } from './MethodistReport'
import InputMode from './InputMode'
import './design-system.css'
import './methodist-report.css'
import './textbook-comparison-chart.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><InputMode />{window.location.hash.startsWith('#/methodist-report/') ? <MethodistReportPage /> : <App />}</React.StrictMode>,
)
