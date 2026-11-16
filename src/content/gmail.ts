/*
 * Gmail content script. Runs only on https://mail.google.com/* (see manifest.json).
 *
 * It reads nothing on its own: only while the PhishLocal side panel is open and connected to
 * this tab does it read the emails the user opens (see gmail-watch.ts). Nothing is stored, and
 * nothing is sent anywhere but to the side panel.
 */
import { WATCH_PORT } from '../messages';
import { watchGmail } from './gmail-watch';

chrome.runtime.onConnect.addListener((port) => {
  // Only our own extension may connect.
  if (port.name !== WATCH_PORT || port.sender?.id !== chrome.runtime.id) {
    port.disconnect();
    return;
  }
  watchGmail(port);
});
