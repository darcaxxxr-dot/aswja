import { bootstrap } from './app';

const root = document.getElementById('app');
if (!root) {
  throw new Error('Root element #app tidak ditemukan di index.html.');
}
bootstrap(root);