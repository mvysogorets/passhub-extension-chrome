const params = new URLSearchParams(window.location.search);
const requestId = params.get('requestId');
const mode = params.get('mode');
const siteName = params.get('siteName') || 'this site';
const userName = params.get('userName') || '';

document.body.classList.add('passkey-view');

const page = document.querySelector('.passkey-page');
const heading = document.querySelector('#passkey-heading');
const action = document.querySelector('#passkey-action');
const site = document.querySelector('#passkey-site');
const user = document.querySelector('#passkey-user');
const primary = document.querySelector('#passkey-passhub');

heading.textContent = mode === 'get' ? 'Sign in with passkey' : 'Create passkey';
action.textContent = mode === 'get' ? 'Use a passkey for' : 'Save a passkey for';
site.textContent = siteName;
user.textContent = userName;
primary.textContent = mode === 'get' ? 'Use PassHub' : 'Save in PassHub';
page.style.display = 'block';

function choose(choice) {
  window.parent.postMessage({
    type: 'passhub-passkey-choice',
    requestId,
    choice
  }, '*');
}

document.querySelector('#passkey-passhub').addEventListener('click', () => choose('passhub'));
document.querySelector('#passkey-system').addEventListener('click', () => choose('system'));
document.querySelector('#passkey-cancel').addEventListener('click', () => choose('cancel'));
document.querySelector('.close-popup').addEventListener('click', () => choose('cancel'));