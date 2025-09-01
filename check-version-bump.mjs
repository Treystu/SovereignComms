import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

try {
  const current = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const previousPkg = execSync('git show HEAD~1:package.json', {
    encoding: 'utf8',
  });
  const previous = JSON.parse(previousPkg).version;
  if (current === previous) {
    console.error(
      `Error: package.json version (${current}) has not been bumped since previous commit.`,
    );
    process.exit(1);
  }
} catch (err) {
  console.error('Failed to verify version bump:', err.message || err);
  process.exit(1);
}
