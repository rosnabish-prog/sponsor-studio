import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/original.css';
// Must come after original.css: the orange theme overrides its older rules.
import './styles/workspace-theme.css';

const root = document.getElementById('root');
if (!root) throw new Error('Sponsor Studio root element was not found');
createRoot(root).render(<App />);
