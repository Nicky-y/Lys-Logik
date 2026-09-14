import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';

const behavior = (name: string, fn: (t: TestContext) => void) =>
  test(name, { skip: process.platform === 'win32' ? false : 'Windows PowerShell; exercised by Windows CI' }, fn);

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'ship-script test-'));
  t.after(() => {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(basename(root).startsWith('ship-script test-'));
    rmSync(root, { recursive: true, force: true });
  });
  const repo = join(root, 'website');
  const remote = join(root, 'remote.git');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  const git = (...args: string[]) => {
    const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), content);
  };
  copyFileSync(new URL('../scripts/ship-pages.ps1', import.meta.url), join(repo, 'scripts/ship-pages.ps1'));
  write('.gitignore', '.ship-events\n.env*\n!.env.example\n!.env.local.example\nsupabase/.temp/\n.wrangler/\n');
  write('page.txt', 'initial\n');
  write('dist/index.html', 'initial build\n');
  write('tests/check.test.ts', [
    "import { appendFileSync } from 'node:fs';",
    "import assert from 'node:assert/strict';",
    "appendFileSync('.ship-events', 'tests\\n');",
    "assert.notEqual(process.env.SHIP_TEST_FAIL, 'tests');",
  ].join('\n'));
  write('scripts/build-website.mjs', [
    "import { appendFileSync, writeFileSync } from 'node:fs';",
    "appendFileSync('.ship-events', 'build\\n');",
    "if (process.env.SHIP_TEST_FAIL === 'build') process.exit(1);",
    "if (process.env.GITHUB_ACTIONS) process.exit(2);",
    "writeFileSync('dist/index.html', 'production build\\n');",
  ].join('\n'));
  // Only this disposable repo has a fake deploy. Production has no test bypass.
  write('scripts/deploy-website.mjs', [
    "import { appendFileSync } from 'node:fs';",
    "appendFileSync('.ship-events', 'deploy-and-verify\\n');",
    "if (process.env.SHIP_TEST_FAIL === 'deploy') process.exit(1);",
  ].join('\n'));
  git('init', '-b', 'main');
  git('config', 'user.email', 'ship-test@example.invalid');
  git('config', 'user.name', 'Ship test');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  git('init', '--bare', remote);
  git('remote', 'add', 'origin', remote);
  git('add', '-A');
  git('commit', '-m', 'Fixture');
  git('push', 'origin', 'main');
  const initial = git('rev-parse', 'HEAD');
  const events = () => existsSync(join(repo, '.ship-events')) ? readFileSync(join(repo, '.ship-events'), 'utf8') : '';
  const remoteHead = () => git('ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0];
  const run = (args: string[], env: Record<string, string> = {}) => {
    const childEnv = { ...process.env, ...env };
    // A nested CLI test runner must not inherit node:test's worker marker.
    delete childEnv.NODE_TEST_CONTEXT;
    const r = spawnSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', join(repo, 'scripts/ship-pages.ps1'), ...args,
    ], { cwd: root, encoding: 'utf8', timeout: 30_000, env: childEnv });
    assert.ifError(r.error);
    return { status: r.status, output: r.stdout + r.stderr };
  };
  return { repo, remote, initial, git, write, events, remoteHead, run };
}

test('npm ship invokes the Windows script without a user profile', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.ship, 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/ship-pages.ps1');
});

for (const args of [[], ['-Commit', '-Push'], ['-Push', '-Deploy']]) {
  behavior('rejects missing/ambiguous mode: ' + args.join(' '), (t) => {
    const f = fixture(t);
    f.write('page.txt', 'changed\n');
    assert.notEqual(f.run(args).status, 0);
    assert.equal(f.git('rev-parse', 'HEAD'), f.initial);
    assert.equal(f.git('diff', '--cached', '--name-only'), '');
  });
}

behavior('local commit includes safe examples, preserves the message, and does not push', (t) => {
  const f = fixture(t);
  f.write('page.txt', 'changed\n');
  f.write('.env.local.example', 'PUBLIC_NAME=example\n');
  f.write('operations/.env.example', 'PUBLIC_NAME=example\n');
  const message = 'Ret "footer" og æøå';
  const r = f.run(['-Commit', '-Message', message]);
  assert.equal(r.status, 0, r.output);
  assert.equal(f.git('log', '-1', '--format=%s'), message);
  assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(f.remoteHead(), f.initial);
  assert.equal(f.events(), '');
});

behavior('empty message cancels without staging', (t) => {
  const f = fixture(t);
  f.write('page.txt', 'changed\n');
  const r = f.run(['-Commit', '-Message', '   ']);
  assert.notEqual(r.status, 0);
  assert.match(r.output, /Commit cancelled/);
  assert.equal(f.git('diff', '--cached', '--name-only'), '');
  assert.equal(f.git('rev-parse', 'HEAD'), f.initial);
});

behavior('clean local commit exits without a popup or empty commit', (t) => {
  const f = fixture(t);
  const r = f.run(['-Commit']);
  assert.equal(r.status, 0, r.output);
  assert.equal(f.git('rev-parse', 'HEAD'), f.initial);
});

behavior('production cannot deploy a custom feature branch', (t) => {
  const f = fixture(t);
  f.git('checkout', '-b', 'feature');
  const r = f.run(['-Deploy', '-Branch', 'feature']);
  assert.notEqual(r.status, 0);
  assert.match(r.output, /only allowed from main/);
  assert.equal(f.events(), '');
});

behavior('a failed commit hook stops push and deploy', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.repo, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n');
  f.write('page.txt', 'changed\n');
  const r = f.run(['-Deploy', '-Message', 'Rejected commit']);
  assert.notEqual(r.status, 0);
  assert.match(r.output, /Git command failed: git commit/);
  assert.equal(f.git('rev-parse', 'HEAD'), f.initial);
  assert.equal(f.remoteHead(), f.initial);
  assert.doesNotMatch(f.events(), /deploy/);
});

for (const path of ['.env.local', 'operations/.env.production', 'supabase/.temp/project-ref', '.wrangler/state']) {
  behavior('rejects force-staged local file: ' + path, (t) => {
    const f = fixture(t);
    f.write(path, 'test-only placeholder\n');
    f.git('add', '-f', path);
    const r = f.run(['-Commit', '-Message', 'Must fail']);
    assert.notEqual(r.status, 0);
    assert.match(r.output, /Refusing to commit local-only/);
    assert.equal(f.git('rev-parse', 'HEAD'), f.initial);
  });
}

for (const branch of ['feature', '--detach']) {
  behavior('rejects push from ' + branch + ' before committing', (t) => {
    const f = fixture(t);
    branch === '--detach' ? f.git('checkout', '--detach') : f.git('checkout', '-b', branch);
    f.write('page.txt', 'changed\n');
    const r = f.run(['-Push', '-Message', 'Must fail']);
    assert.notEqual(r.status, 0);
    assert.match(r.output, /Refusing to push/);
    assert.equal(f.git('rev-parse', 'HEAD'), f.initial);
    assert.equal(f.remoteHead(), f.initial);
    assert.equal(f.events(), '');
  });
}

behavior('missing remote fails before committing', (t) => {
  const f = fixture(t);
  f.write('page.txt', 'changed\n');
  assert.notEqual(f.run(['-Push', '-Remote', 'missing', '-Message', 'Must fail']).status, 0);
  assert.equal(f.git('rev-parse', 'HEAD'), f.initial);
  assert.equal(f.events(), '');
});

behavior('push tests, commits and pushes without deploying', (t) => {
  const f = fixture(t);
  f.write('page.txt', 'changed\n');
  const r = f.run(['-Push', '-Message', 'Push change']);
  assert.equal(r.status, 0, r.output);
  assert.notEqual(f.git('rev-parse', 'HEAD'), f.initial);
  assert.equal(f.remoteHead(), f.git('rev-parse', 'HEAD'));
  assert.equal(f.events(), 'tests\n');
});

for (const failure of ['tests', 'build']) {
  behavior(failure + ' failure prevents commit, push and deploy', (t) => {
    const f = fixture(t);
    f.write('page.txt', 'changed\n');
    const r = f.run(['-Deploy', '-Message', 'Must fail'], { SHIP_TEST_FAIL: failure });
    assert.notEqual(r.status, 0);
    assert.equal(f.git('rev-parse', 'HEAD'), f.initial);
    assert.equal(f.remoteHead(), f.initial);
    assert.equal(f.events(), failure === 'tests' ? 'tests\n' : 'tests\nbuild\n');
  });
}

behavior('rejected push prevents production deploy', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.remote, 'hooks', 'pre-receive'), '#!/bin/sh\nexit 1\n');
  f.write('page.txt', 'changed\n');
  const r = f.run(['-Deploy', '-Message', 'Rejected push']);
  assert.notEqual(r.status, 0);
  assert.notEqual(f.git('rev-parse', 'HEAD'), f.initial);
  assert.equal(f.remoteHead(), f.initial);
  assert.doesNotMatch(f.events(), /deploy/);
});

behavior('deploy pushes the production build before calling deploy and verification', (t) => {
  const f = fixture(t);
  f.write('page.txt', 'changed\n');
  const r = f.run(['-Deploy', '-Message', 'Release'], { GITHUB_ACTIONS: 'true' });
  assert.equal(r.status, 0, r.output);
  assert.equal(f.remoteHead(), f.git('rev-parse', 'HEAD'));
  assert.equal(f.git('show', 'HEAD:dist/index.html'), 'production build');
  assert.equal(f.events(), 'tests\nbuild\ndeploy-and-verify\n');
  assert.equal(f.git('status', '--porcelain'), '');
});

behavior('deploy failure is reported; clean retry does not create an empty commit', (t) => {
  const f = fixture(t);
  f.write('page.txt', 'changed\n');
  const failed = f.run(['-Deploy', '-Message', 'Release'], { SHIP_TEST_FAIL: 'deploy' });
  assert.notEqual(failed.status, 0);
  assert.doesNotMatch(failed.output, /deployment and verification succeeded/);
  const release = f.git('rev-parse', 'HEAD');
  assert.notEqual(release, f.initial);
  assert.match(failed.output, /Node command failed/);
  assert.equal(f.events(), 'tests\nbuild\ndeploy-and-verify\n');
  assert.equal(f.remoteHead(), release);
  const retry = f.run(['-Deploy']);
  assert.equal(retry.status, 0, retry.output);
  assert.equal(f.git('rev-parse', 'HEAD'), release);
});
