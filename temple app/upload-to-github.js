/**
 * Automated GitHub Uploader
 * Uploads all project files directly to your GitHub repository using GitHub's REST API.
 * No Git installation required!
 *
 * Usage:
 *   node upload-to-github.js <GITHUB_TOKEN> <GITHUB_USERNAME> [REPO_NAME]
 * Example:
 *   node upload-to-github.js ghp_xxxxxxxxxxxx naveen temple-app
 */

const fs = require('node:fs');
const path = require('node:path');

const token = process.argv[2];
const owner = process.argv[3];
const repo = process.argv[4] || 'temple-app';

if (!token || !owner) {
  console.log('===============================================================');
  console.log('  Automatic GitHub Uploader for Temple App');
  console.log('===============================================================');
  console.log('Usage:');
  console.log('  node upload-to-github.js <TOKEN> <USERNAME> [REPO_NAME]');
  console.log('');
  console.log('To get a token:');
  console.log('  1. Go to https://github.com/settings/tokens');
  console.log('  2. Generate a "Classic Token" with "repo" scope checked.');
  console.log('  3. Run: node upload-to-github.js <YOUR_TOKEN> <YOUR_GITHUB_USERNAME>');
  console.log('===============================================================');
  process.exit(1);
}

const FILES_TO_UPLOAD = [
  'server.js',
  'package.json',
  'start.bat',
  'README.md',
  '.gitignore',
  'public/index.html',
  'public/style.css',
  'public/app.js'
];

async function githubRequest(urlPath, method, data = null) {
  const url = `https://api.github.com${urlPath}`;
  const headers = {
    'User-Agent': 'TempleApp-Uploader',
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json'
  };
  if (data) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined
  });

  const bodyText = await res.text();
  let json;
  try {
    json = JSON.parse(bodyText);
  } catch (e) {
    json = { raw: bodyText };
  }

  return { status: res.status, ok: res.ok, data: json };
}

async function upload() {
  console.log(`Checking repository: https://github.com/${owner}/${repo} ...`);

  // 1. Check or create repository
  let checkRepo = await githubRequest(`/repos/${owner}/${repo}`, 'GET');
  if (!checkRepo.ok && checkRepo.status === 404) {
    console.log(`Repository does not exist. Creating repository "${repo}" under @${owner}...`);
    const createRepo = await githubRequest('/user/repos', 'POST', {
      name: repo,
      description: 'Temple Contribution & Records Manager with SQLite storage',
      private: false,
      auto_init: false
    });
    if (!createRepo.ok) {
      console.error('Failed to create repository:', createRepo.data);
      process.exit(1);
    }
    console.log('✓ Repository created successfully!');
  } else if (!checkRepo.ok) {
    console.error('GitHub authentication error:', checkRepo.data);
    process.exit(1);
  } else {
    console.log('✓ Repository exists.');
  }

  // 2. Upload each file
  for (const relPath of FILES_TO_UPLOAD) {
    const fullPath = path.join(__dirname, relPath);
    if (!fs.existsSync(fullPath)) continue;

    const contentBuffer = fs.readFileSync(fullPath);
    const contentBase64 = contentBuffer.toString('base64');

    // Check if file already exists in repo to get its SHA (needed for updating)
    const checkFile = await githubRequest(`/repos/${owner}/${repo}/contents/${relPath}`, 'GET');
    const sha = checkFile.ok ? checkFile.data.sha : undefined;

    const payload = {
      message: `Add ${relPath}`,
      content: contentBase64
    };
    if (sha) payload.sha = sha;

    const uploadRes = await githubRequest(`/repos/${owner}/${repo}/contents/${relPath}`, 'PUT', payload);
    if (uploadRes.ok) {
      console.log(`  ✓ Uploaded: ${relPath}`);
    } else {
      console.error(`  ✗ Failed to upload ${relPath}:`, uploadRes.data.message || uploadRes.data);
    }
  }

  console.log('\n🎉 ALL FILES COPIED SUCCESSFULLY TO GITHUB!');
  console.log(`View your repository at: https://github.com/${owner}/${repo}\n`);
}

upload().catch(err => {
  console.error('Unexpected error:', err);
});
