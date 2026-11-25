import './lib/cifra-mobile-init';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MinistryProvider } from './context/MinistryContext';
import UpdatePrompt from './components/UpdatePrompt';
import AppErrorBoundary from './components/AppErrorBoundary';
import App from './App';
import { applyTheme } from './lib/theme';
import './theme.css';
import './styles.css';
import './ui-polish.css';

applyTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <MinistryProvider>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
        <UpdatePrompt />
      </MinistryProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
