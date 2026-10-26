// Apply the saved theme before first paint to avoid a flash (kept external for CSP).
try {
  var t = localStorage.getItem('study-planner.theme') || 'system'
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) document.documentElement.classList.add('dark')
} catch (e) {}
