// options.js — Load and save extension settings

const DEFAULTS = {
  pipWidth: 360,
  pipHeight: 290,
  defaultView: 'auto',
  autoOpen: false,
};

async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULTS);
  document.getElementById('pip-width').value = settings.pipWidth;
  document.getElementById('pip-height').value = settings.pipHeight;
  document.getElementById('default-view').value = settings.defaultView;
  document.getElementById('auto-open').checked = settings.autoOpen;
}

async function saveSettings() {
  const settings = {
    pipWidth: parseInt(document.getElementById('pip-width').value, 10) || 360,
    pipHeight: parseInt(document.getElementById('pip-height').value, 10) || 290,
    defaultView: document.getElementById('default-view').value,
    autoOpen: document.getElementById('auto-open').checked,
  };
  await chrome.storage.sync.set(settings);

  const status = document.getElementById('status');
  status.style.display = 'block';
  setTimeout(() => {
    status.style.display = 'none';
  }, 2000);
}

document.getElementById('save').addEventListener('click', saveSettings);
loadSettings();
