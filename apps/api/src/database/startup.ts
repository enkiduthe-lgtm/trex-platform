import { spawn } from 'child_process';

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function main() {
  await run('npm', ['run', 'db:migrate', '-w', '@trex/api']);

  // This is deliberately opt-in. Render can provide the two secrets only for the
  // first deployment; bootstrap-admin never overwrites an existing account.
  if (process.env.BOOTSTRAP_ADMIN_EMAIL && process.env.BOOTSTRAP_ADMIN_PASSWORD) {
    await run('npm', ['run', 'bootstrap:admin', '-w', '@trex/api']);
  } else {
    console.log('Initial administrator bootstrap skipped (no bootstrap secrets configured).');
  }

  await run('node', ['dist/main.js']);
}

void main().catch((error: unknown) => {
  console.error('API startup failed:', error);
  process.exit(1);
});
