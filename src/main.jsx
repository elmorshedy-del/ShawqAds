import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AppErrorBoundary } from './components/ErrorBoundary.jsx';
import { installDashboardDataContractNormalizer } from './lib/dataContractNormalizer.js';
import './styles.css';

// Install before React mounts so every panel consumes the same normalized data
// contract, including the first Meta/Shopify requests fired by App effects.
installDashboardDataContractNormalizer();

createRoot(document.getElementById('root')).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
