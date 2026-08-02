import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyTheme, getInitialTheme } from './store/useStore';
import './index.css';

/* Apply the persisted theme to <body> before the first paint (no flash). */
applyTheme(getInitialTheme());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
