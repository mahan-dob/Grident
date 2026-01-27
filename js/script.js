const select = document.getElementById('themeSelect');

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyTheme(theme) {
  const finalTheme = theme === 'auto' ? getSystemTheme() : theme;
  document.documentElement.dataset.theme = finalTheme;
}

const savedTheme = localStorage.getItem('theme') || 'auto';

// ست شدن دقیق select
select.value = savedTheme;

// اعمال تم
applyTheme(savedTheme);

// تغییر تم توسط کاربر
select.addEventListener('change', () => {
  const value = select.value;
  localStorage.setItem('theme', value);
  applyTheme(value);
});

// واکنش به تغییر تم سیستم وقتی auto فعاله
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (localStorage.getItem('theme') === 'auto') {
    applyTheme('auto');
  }
});


select.addEventListener('change', e => {
  applyTheme(e.target.value);
});