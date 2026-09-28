import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import './fonts';
import './styles/app.css';
import './styles/document.css';
import './styles/print.css';
import { App, updateReady } from './App';
import { watchFonts } from './fonts';
import { initStore } from './store/store';

watchFonts();
void initStore();
render(<App />, document.getElementById('app')!);

const updateSW = registerSW({
  onNeedRefresh() {
    updateReady.value = () => void updateSW(true);
  },
});
