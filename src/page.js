import { initNavToggle, wireWhatsApp, initCursorGlow, ensureIndiaFlag } from './shell.js';
import { initChat } from './chat.js';

initNavToggle();
wireWhatsApp(['waTop', 'waHero', 'waBand', 'waOffer', 'waPage']);
initCursorGlow();
ensureIndiaFlag();
initChat();
