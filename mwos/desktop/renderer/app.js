import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

const platformEl = document.getElementById('platform');
const themeBtn = document.getElementById('theme-btn');
const loginForm = document.getElementById('login-form');
const loginResult = document.getElementById('login-result');
const dashboardBtn = document.getElementById('fetch-dashboard');
const dashboardOutput = document.getElementById('dashboard-output');
const saveNoteBtn = document.getElementById('save-note');
const loadNoteBtn = document.getElementById('load-note');
const offlineNote = document.getElementById('offline-note');
const offlineResult = document.getElementById('offline-result');

platformEl.textContent = window.mwosDesktop?.platform || 'unknown';

const setTheme = (theme) => {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('desktop-theme', theme);
};

setTheme(localStorage.getItem('desktop-theme') || 'light');

themeBtn.addEventListener('click', () => {
  const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  setTheme(current === 'dark' ? 'light' : 'dark');
});

const applyToken = (token) => {
  localStorage.setItem('desktop-access-token', token);
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
};

const existingToken = localStorage.getItem('desktop-access-token');
if (existingToken) applyToken(existingToken);

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    const res = await api.post('/auth/login', { email, password });
    const token = res.data.data.accessToken;
    applyToken(token);
    loginResult.textContent = `Signed in as ${res.data.data.user.firstName} (${res.data.data.user.role})`;
  } catch (error) {
    loginResult.textContent = error.response?.data?.message || 'Login failed';
  }
});

dashboardBtn.addEventListener('click', async () => {
  try {
    const res = await api.get('/reports/dashboard');
    dashboardOutput.textContent = JSON.stringify(res.data.data, null, 2);
  } catch (error) {
    dashboardOutput.textContent = error.response?.data?.message || error.message;
  }
});

saveNoteBtn.addEventListener('click', () => {
  localStorage.setItem('offline-note', offlineNote.value);
  offlineResult.textContent = 'Offline note saved locally.';
});

loadNoteBtn.addEventListener('click', () => {
  offlineNote.value = localStorage.getItem('offline-note') || '';
  offlineResult.textContent = 'Offline note loaded.';
});
