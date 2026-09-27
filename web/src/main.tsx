import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Amplify } from 'aws-amplify'
import outputs from '../amplify_outputs.json'
import './index.css'
import App from './App.tsx'

// Configures the guest (unauthenticated) Cognito identity used by
// src/data/liveDeviceSource.ts's AWS IoT subscription - see
// web/amplify/auth/resource.ts. `amplify_outputs.json` is generated at
// deploy/sandbox time and gitignored (see README.md's "Local backend
// development" section); it is never committed to this repo.
Amplify.configure(outputs)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
