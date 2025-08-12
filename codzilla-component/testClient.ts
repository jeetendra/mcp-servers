import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function main() {
  const baseUrl = process.env.CODZILLA_MCP_BASE_URL || process.env.MCP_BASE_URL || 'http://127.0.0.1:3333/mcp';

  const client = new Client({
    name: 'codzilla-test-client',
    version: '1.0.0',
  });

  console.log(`[client] Connecting to ${baseUrl}`);
  const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
  await client.connect(transport);
  console.log('[client] Connected');

  // List tools
  const tools = await client.listTools();
  console.log('[client] Tools:', (tools.tools || []).map(t => t.name));

  // List resources
  const resources = await client.listResources();
  console.log('[client] Resources:', (resources.resources || []).map(r => r.uri));

  // Call tool get_components
  const compResult = await client.callTool({
    name: 'get_components',
    arguments: { category: 'all' },
  });
  console.log('[client] get_components result:', JSON.stringify(compResult, null, 2));

  // Read components resource
  const allRes = await client.readResource({ uri: 'components://all' });
  const allText = (allRes.contents?.[0]?.text as string | undefined) ?? '';
  console.log('[client] read components://all length:', allText ? allText.length : 0);

  // Try read a component by name if any present in the JSON
  try {
    const parsed = JSON.parse(allText);
    const firstName = Array.isArray(parsed) ? parsed[0]?.name : undefined;
    if (typeof firstName === 'string' && firstName.length) {
      const oneRes = await client.readResource({ uri: `component://${firstName}` });
  const oneText = (oneRes.contents?.[0]?.text as string | undefined) ?? '';
  console.log('[client] read component://' + firstName + ' length:', oneText ? oneText.length : 0);
    }
  } catch {
    // ignore JSON parse errors; resource may be empty
  }

  await client.close();
  console.log('[client] Done');
}

main().catch((err) => {
  console.error('[client] Error:', err);
  process.exit(1);
});
