/** @type {import('electron').BrowserWindowConstructorOptions} */
export default {
  // Small vertical strip; height grows to fit the icons at runtime.
  width: 60,
  height: 220,
  minWidth: 60,
  minHeight: 60,
  // Frameless, transparent, chrome-free floating bar.
  frame: false,
  transparent: true,
  backgroundColor: '#00000000',
  hasShadow: false,
  resizable: false,
  movable: true,
  maximizable: false,
  minimizable: false,
  fullscreenable: false,
  // Keep it out of the taskbar and Alt-Tab.
  skipTaskbar: true,
  // Float above everything; the level is re-asserted to 'screen-saver' in the
  // FloatingWindow main module.
  alwaysOnTop: true,
  useContentSize: true,
};
