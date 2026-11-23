import { onInstalled } from './inject';
import { openWelcome } from './welcome/open';

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
chrome.runtime.onInstalled.addListener(onInstalled);
chrome.runtime.onInstalled.addListener(openWelcome);
