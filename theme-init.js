(() => {
  const storageKey = 'sasa_color_theme';
  let theme = '';
  try {
    theme = window.localStorage.getItem(storageKey) || '';
  } catch {
    theme = '';
  }
  if (!['light', 'dark'].includes(theme)) {
    theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.SasaTheme = { storageKey };
})();
