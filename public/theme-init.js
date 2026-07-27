(function () {
  try {
    var saved = localStorage.getItem('relay:theme')
    var theme = saved === 'dark' || saved === 'light'
      ? saved
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    document.documentElement.dataset.theme = theme
    var meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d0200' : '#f8f9ff')
  } catch (_) {
    document.documentElement.dataset.theme = 'light'
  }
})()
