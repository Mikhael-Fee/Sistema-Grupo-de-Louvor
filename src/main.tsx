import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { MinistryProvider } from './context/MinistryContext';
import App from './App';
import './styles.css';

registerSW({ onOfflineReady() { console.info('Interface disponível offline.'); } });
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><MinistryProvider><App /></MinistryProvider></BrowserRouter></React.StrictMode>);
