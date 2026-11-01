import React from 'react';
import ReactDOM from 'react-dom/client';
import '../game-v1/styles.css';
import './preview.css';
import Preview from './Preview';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>,
);
