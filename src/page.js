import { initNavToggle, wireWhatsApp, initCursorGlow, ensureIndiaFlag } from './shell.js';
import { initChat } from './chat.js';

initNavToggle();
wireWhatsApp(['waTop', 'waHero', 'waSticky', 'waBand', 'waOffer', 'waPage']);
initCursorGlow();
ensureIndiaFlag();
initChat();
