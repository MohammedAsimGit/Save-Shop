import { env } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { ensureModelIndexes } from '../models/index.js';
import { adminStore, adminAuthService, mergeService } from '../services/admin/index.js';
import type { AdminActor } from '../services/admin/auth.service.js';

/**
 * Catalogue administration CLI.
 *
 *   npm run admin -- provision --email=ops@example.com --name="Ops"
 *   npm run admin -- list
 *   npm run admin -- disable --email=ops@example.com --reason="left the team"
 *   npm run admin -- reset-password --email=ops@example.com
 *   npm run admin -- audit --limit=20
 *   npm run admin -- repair-merges
 *
 * Why provisioning lives here: an administrator can only be created by someone with
 * local access to the deployment and its database. There is no API route that mints
 * accounts, so a compromised token can never escalate into a new administrator.
 *
 * The password is never accepted as a command-line flag (that would put it in shell
 * history and process listings). It is read from a masked prompt, from stdin when
 * piped, or from ADMIN_PROVISION_PASSWORD for automation.
 */

const HELP = `Save-Shop catalogue administration

Usage: npm run admin -- <command> [options]

Commands:
  provision --email=<email> --name=<display name>
                            Create an administrator (password is prompted)
  list                      List administrators (no credentials are shown)
  disable --email=<email> --reason=<text>
                            Disable an administrator and revoke their sessions
  reset-password --email=<email>
                            Set a new password and revoke existing sessions
  audit [--limit=<n>]       Show the most recent audit events
  repair-merges             Re-apply unfinished canonical product merges
  bootstrap --email=<email> --name=<display name>
                            Alias for provision

Options:
  --email=<email>           Administrator email (stored lowercase)
  --name=<display name>     Human-readable name
  --reason=<text>           Reason recorded in the audit trail
  --limit=<n>               Number of rows to print (default 20)
  --stdin                   Read the password from stdin instead of prompting
  --help                    Show this message

Environment:
  MONGODB_URI               Required: administration must be durable
  ADMIN_PROVISION_PASSWORD  Optional password source for automation

Passwords must be at least 12 characters and contain a letter and a digit.
`;

/** CLI output goes to stdout; application code is discouraged from using `console`. */
function print(message: string): void {
  process.stdout.write(`${message}\n`);
}

type Command = 'provision' | 'list' | 'disable' | 'reset-password' | 'audit' | 'repair-merges';

interface CliOptions {
  readonly command: Command;
  readonly email?: string;
  readonly name?: string;
  readonly reason?: string;
  readonly limit: number;
  readonly stdin: boolean;
  readonly help: boolean;
}

class UsageError extends Error {}

/** Actor recorded for local CLI operations; it is not an interactive login. */
const CLI_ACTOR: AdminActor = {
  id: 'system-cli',
  email: 'cli@local.invalid',
  displayName: 'Local administration CLI',
  role: 'catalogue_admin',
};

function parseArgs(argv: readonly string[]): CliOptions {
  let command: Command | undefined;
  let email: string | undefined;
  let name: string | undefined;
  let reason: string | undefined;
  let limit = 20;
  let stdin = false;
  let help = false;

  const commands: readonly Command[] = [
    'provision',
    'list',
    'disable',
    'reset-password',
    'audit',
    'repair-merges',
  ];

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === 'bootstrap') {
      command = 'provision';
      continue;
    }
    if ((commands as readonly string[]).includes(arg)) {
      command = arg as Command;
      continue;
    }
    if (arg === '--stdin') {
      stdin = true;
      continue;
    }
    if (arg.startsWith('--email=')) {
      email = arg.slice('--email='.length).trim();
      continue;
    }
    if (arg.startsWith('--name=')) {
      name = arg.slice('--name='.length).trim();
      continue;
    }
    if (arg.startsWith('--reason=')) {
      reason = arg.slice('--reason='.length).trim();
      continue;
    }
    if (arg.startsWith('--limit=')) {
      const parsed = Number.parseInt(arg.slice('--limit='.length), 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
        throw new UsageError('--limit must be an integer between 1 and 200');
      }
      limit = parsed;
      continue;
    }
    throw new UsageError(`Unknown argument: ${arg}`);
  }

  if (help) return { command: 'list', limit, stdin, help: true };
  if (!command) throw new UsageError('A command is required (try --help)');
  if (
    (command === 'provision' || command === 'disable' || command === 'reset-password') &&
    !email
  ) {
    throw new UsageError(`${command} requires --email=<email>`);
  }
  if (command === 'provision' && !name) {
    throw new UsageError('provision requires --name="<display name>"');
  }

  return {
    command,
    ...(email ? { email } : {}),
    ...(name ? { name } : {}),
    ...(reason ? { reason } : {}),
    limit,
    stdin,
    help: false,
  };
}

/** Reads all of stdin; used when the caller pipes a password in. */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}

/**
 * Masked password prompt. Characters are not echoed, backspace works, Ctrl+C
 * cancels. This is deliberately not a "convenience" plain prompt: a password
 * echoed into a terminal scrollback or a screen share is a leaked credential.
 */
function promptHidden(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const out = process.stderr;

    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      reject(
        new UsageError('No terminal available; pipe the password or set ADMIN_PROVISION_PASSWORD'),
      );
      return;
    }

    let value = '';
    out.write(label);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);

    const cleanup = (): void => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };

    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0004') {
          cleanup();
          out.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          cleanup();
          out.write('\n');
          reject(new UsageError('Cancelled'));
          return;
        }
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };

    stdin.on('data', onData);
  });
}

async function readPassword(options: CliOptions): Promise<string> {
  const fromEnv = process.env['ADMIN_PROVISION_PASSWORD'];
  if (fromEnv && fromEnv.trim() !== '') return fromEnv;

  if (options.stdin || !process.stdin.isTTY) return readStdin();

  const first = await promptHidden('Password: ');
  const second = await promptHidden('Confirm password: ');
  if (first !== second) throw new UsageError('Passwords do not match');
  return first;
}

function printAdmin(profile: {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly status: string;
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
}): void {
  print(
    `${profile.email}  ${profile.status.padEnd(8)}  ${profile.displayName}  ` +
      `created ${profile.createdAt}  last login ${profile.lastLoginAt ?? 'never'}  id ${profile.id}`,
  );
}

async function requireDatabase(): Promise<void> {
  if (!env.isDatabaseConfigured) {
    throw new UsageError(
      'MONGODB_URI is required: administration must be durable. Refusing to provision into a process-local store.',
    );
  }

  const connected = await connectDatabase();
  if (!connected) throw new UsageError('Could not connect to MongoDB');
  await ensureModelIndexes();
}

async function main(): Promise<number> {
  let options: CliOptions;

  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(HELP);
    return 2;
  }

  if (options.help) {
    print(HELP);
    return 0;
  }

  try {
    await requireDatabase();

    switch (options.command) {
      case 'provision': {
        const password = await readPassword(options);
        const profile = await adminAuthService.provision({
          email: options.email as string,
          displayName: options.name as string,
          password,
        });
        print('Administrator provisioned.');
        printAdmin(profile);
        break;
      }

      case 'list': {
        const admins = await adminAuthService.listAdmins();
        if (admins.length === 0) {
          print('No administrators exist. Run: npm run admin -- provision --email=... --name=...');
          break;
        }
        for (const admin of admins) printAdmin(admin);
        break;
      }

      case 'disable': {
        const admins = await adminAuthService.listAdmins();
        const target = admins.find((admin) => admin.email === options.email?.toLowerCase());
        if (!target) throw new UsageError(`No administrator with email ${options.email}`);
        if (target.status === 'disabled') {
          print(`${target.email} is already disabled.`);
          break;
        }
        const disabled = await adminAuthService.disable({
          adminId: target.id,
          actor: CLI_ACTOR,
          reason: options.reason ?? 'disabled by local administrator',
        });
        print(`Disabled ${disabled.email}. Existing sessions were revoked.`);
        break;
      }

      case 'reset-password': {
        const admins = await adminAuthService.listAdmins();
        const target = admins.find((admin) => admin.email === options.email?.toLowerCase());
        if (!target) throw new UsageError(`No administrator with email ${options.email}`);
        const password = await readPassword(options);
        await adminAuthService.resetPassword({
          adminId: target.id,
          password,
          actor: CLI_ACTOR,
        });
        print(`Password reset for ${target.email}. Existing sessions were revoked.`);
        break;
      }

      case 'audit': {
        const page = await adminStore.listAudit({ page: 1, pageSize: options.limit });
        if (page.events.length === 0) {
          print('No audit events recorded.');
          break;
        }
        for (const event of page.events) {
          print(
            `${event.occurredAt}  ${event.action.padEnd(22)}  ${event.actorEmail ?? '-'}  ` +
              `${event.targetType}:${event.targetId ?? '-'}  ${event.reason ?? ''}`,
          );
        }
        break;
      }

      case 'repair-merges': {
        const result = await mergeService.repairPendingMerges({
          actor: CLI_ACTOR,
          limit: 50,
        });
        print(
          `Repaired ${result.repaired} merge run(s); ${result.failed} failed; ${result.remaining} still open.`,
        );
        break;
      }
    }

    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    await disconnectDatabase().catch(() => undefined);
  }
}

void main().then((code) => {
  process.exitCode = code;
});
