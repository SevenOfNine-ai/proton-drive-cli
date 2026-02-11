import { createCredentialCommand } from './credential';

jest.mock('../utils/git-credential', () => ({
  gitCredentialFill: jest.fn(),
  gitCredentialApprove: jest.fn(),
  gitCredentialReject: jest.fn(),
}));

describe('createCredentialCommand', () => {
  it('creates a command with store, remove, and verify subcommands', () => {
    const cmd = createCredentialCommand();
    expect(cmd.name()).toBe('credential');

    const subcommandNames = cmd.commands.map((c: any) => c.name());
    expect(subcommandNames).toContain('store');
    expect(subcommandNames).toContain('remove');
    expect(subcommandNames).toContain('verify');
  });

  it('store subcommand has expected options', () => {
    const cmd = createCredentialCommand();
    const store = cmd.commands.find((c: any) => c.name() === 'store');
    expect(store).toBeDefined();

    const optionNames = store!.options.map((o: any) => o.long);
    expect(optionNames).toContain('--username');
    expect(optionNames).toContain('--password-stdin');
    expect(optionNames).toContain('--host');
  });

  it('remove subcommand has expected options', () => {
    const cmd = createCredentialCommand();
    const remove = cmd.commands.find((c: any) => c.name() === 'remove');
    expect(remove).toBeDefined();

    const optionNames = remove!.options.map((o: any) => o.long);
    expect(optionNames).toContain('--username');
    expect(optionNames).toContain('--host');
  });

  it('verify subcommand has expected options', () => {
    const cmd = createCredentialCommand();
    const verify = cmd.commands.find((c: any) => c.name() === 'verify');
    expect(verify).toBeDefined();

    const optionNames = verify!.options.map((o: any) => o.long);
    expect(optionNames).toContain('--host');
  });
});
