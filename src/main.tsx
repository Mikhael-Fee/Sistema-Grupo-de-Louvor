import './lib/cifra-mobile-init';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MinistryProvider } from './context/MinistryContext';
import UpdatePrompt from './components/UpdatePrompt';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><MinistryProvider><App /><UpdatePrompt /></MinistryProvider></BrowserRouter></React.StrictMode>);
