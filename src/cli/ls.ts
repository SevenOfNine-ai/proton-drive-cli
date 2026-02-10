import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { createDriveClient } from '../drive';
import { Node } from '../types/drive';
import { formatSize, formatDate, getNodeIcon } from '../drive/utils';
import { handleError } from '../errors/handler';
import { isVerbose, isQuiet, outputResult } from '../utils/output';
import { resolvePassword } from '../utils/password';

/**
 * Create the ls command
 */
export function createLsCommand(): Command {
  const cmd = new Command('ls');

  cmd
    .description('List files and folders in your Proton Drive')
    .argument('[path]', 'Path to list (defaults to root "/")', '/')
    .option('-l, --long', 'Use long listing format with details')
    .option('--password <password>', 'Password for key decryption (or set PROTON_PASSWORD)')
    .action(async (path: string, options) => {
      try {
        // Resolve password for key decryption
        const password = await resolvePassword(options);

        // Create and initialize drive client
        let spinner;
        if (isVerbose()) {
          spinner = ora('Loading folder contents...').start();
        }
        const client = createDriveClient();
        await client.initializeFromSession(password);

        // Resolve path - this returns the folder with its decrypted context
        const resolved = await client.paths().resolvePath(path);

        // List children links
        const links = await client.nodes().listFolderChildrenLinks(
          resolved.identity.shareId,
          resolved.identity.linkId
        );

        if (spinner) {
          spinner.stop();
        }

        if (links.length === 0) {
          if (isVerbose()) {
            console.log(chalk.yellow('\nFolder is empty.'));
          }
          return;
        }

        // Decrypt names and create nodes
        const nodes: Array<{ node: Node; decryptedName: string }> = [];
        for (const link of links) {
          try {
            const decryptedName = await client.nodes().decryptNodeName(link, resolved.folderContext);
            const node: Node = {
              linkId: link.LinkID,
              parentLinkId: link.ParentLinkID,
              type: link.Type,
              name: decryptedName,
              nameSignatureEmail: link.NameSignatureEmail,
              hash: link.Hash,
              state: link.State,
              mimeType: link.MIMEType,
              size: link.Size,
              createTime: link.CreateTime,
              modifyTime: link.ModifyTime,
              activeRevisionId: link.FileProperties?.ActiveRevision?.ID,
              nodeHashKey: link.FolderProperties?.NodeHashKey,
            };
            nodes.push({ node, decryptedName });
          } catch (error) {
            console.warn(chalk.yellow(`Failed to decrypt link ${link.LinkID}: ${error}`));
          }
        }

        // Sort: folders first, then alphabetically
        nodes.sort((a, b) => {
          if (a.node.type !== b.node.type) {
            return a.node.type - b.node.type; // Folders (1) before files (2)
          }
          return a.decryptedName.localeCompare(b.decryptedName);
        });

        if (isVerbose()) {
          // Verbose mode: Show detailed output with colors
          console.log(chalk.bold(`\nListing: ${path}\n`));

          if (options.long) {
            // Long format with details using cli-table3
            const table = new Table({
              head: [
                chalk.cyan('Type'),
                chalk.cyan('Name'),
                chalk.cyan('Size'),
                chalk.cyan('Modified'),
              ],
              style: {
                head: [],
                border: ['dim'],
              },
              colWidths: [6, 40, 12, 26],
            });

            for (const { node, decryptedName } of nodes) {
              const icon = getNodeIcon(node);
              const name = node.type === 1 ? chalk.blue(decryptedName) : decryptedName;
              const size = node.type === 2 ? formatSize(node.size) : chalk.dim('-');
              const date = formatDate(node.modifyTime);
              table.push([icon, name, size, date]);
            }

            console.log(table.toString());
          } else {
            // Simple format with icons
            for (const { node, decryptedName } of nodes) {
              const icon = getNodeIcon(node);
              const name = node.type === 1 ? chalk.blue(decryptedName) : decryptedName;
              console.log(`${icon}  ${name}`);
            }
          }

          const folders = nodes.filter((n) => n.node.type === 1).length;
          const files = nodes.filter((n) => n.node.type === 2).length;
          console.log(chalk.dim(`\nTotal: ${nodes.length} items (${folders} folders, ${files} files)`));
        } else if (!isQuiet()) {
          // Normal mode: Just output filenames (one per line, for scripting)
          for (const { decryptedName } of nodes) {
            outputResult(decryptedName);
          }
        }
      } catch (error) {
        handleError(error, process.env.DEBUG === 'true');
        process.exit(1);
      }
    });

  return cmd;
}
