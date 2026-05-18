try {
  document.documentElement.classList.add('tt-js')
  if (localStorage.getItem('token')) {
    document.documentElement.classList.add('tt-has-token')
  }
} catch (e) {
  document.documentElement.classList.add('tt-js')
}
