import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './auth.jsx'
import './styles.css'
import { registerServiceWorker } from './push.js'

registerServiceWorker()

createRoot(document.getElementById('root')).render(<AuthProvider><App /></AuthProvider>)
