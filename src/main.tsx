import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import './fonts';
import './styles/app.css';
import './styles/document.css';
import './styles/print.css';
import { App, updateReady } from './App';
import { watchFonts } from './fonts';
import { initStore } from './store/store';
import { checkPublishedCatalog } from './store/sync';
import { toast } from './components/toast';

watchFonts();
void initStore().then(async () => {
  if (await checkPublishedCatalog(true)) toast('הקטלוג עודכן מהאתר');
});
render(<App />, document.getElementById('app')!);

const updateSW = registerSW({
  onNeedRefresh() {
    updateReady.value = () => void updateSW(true);
  },
});
