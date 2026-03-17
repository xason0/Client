import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

function DisableCopyPaste() {
  useEffect(() => {
    const prevent = (e) => e.preventDefault()
    document.addEventListener('copy', prevent)
    document.addEventListener('paste', prevent)
    document.addEventListener('cut', prevent)
    document.addEventListener('contextmenu', prevent)
    return () => {
      document.removeEventListener('copy', prevent)
      document.removeEventListener('paste', prevent)
      document.removeEventListener('cut', prevent)
      document.removeEventListener('contextmenu', prevent)
    }
  }, [])
  return null
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <DisableCopyPaste />
      <Routes>
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
