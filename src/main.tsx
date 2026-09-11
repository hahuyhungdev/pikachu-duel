import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/tokens.css';
import './styles/game.css';
import './styles/fx.css';
import './styles/solo.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root mount point');

createRoot(root).render(<App />);
