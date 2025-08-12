import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';

import fs from 'fs/promises';
import path from 'path';
import { z } from "zod";
import { randomUUID } from 'node:crypto';

interface ComponentDefinition {
    name: string;
    path: string;
    props: Record<string, any>;
    usage: string;
    dependencies?: string[];
}

class ComponentMCPServer {
    private server: McpServer;
    private componentsCache: ComponentDefinition[] = [];

    constructor() {
        this.server = new McpServer(
            {
                name: 'codezilla-components',
                version: '1.0.0',
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupToolHandlers();
        this.setupResources();
    }

    private setupToolHandlers() {
        this.server.registerTool(
            'get_components',
            {
                title: 'get_components',
                description: 'Get all available component definitions',
                inputSchema: {
                    category: z.union([
                        z.literal('ui'),
                        z.literal('layout'),
                        z.literal('forms'),
                        z.literal('all'),
                    ]),
                }
            },
            async ({ category = "all" }, extra) => {
                const result = await this.getComponents(category);
                return result;
            }
        );

        this.server.registerTool(
            'get_component_by_name',
            {
                title: 'get_component_by_name',
                description: 'Get specific component definition by name',
                inputSchema: {
                    name: z.string().min(2).max(100),
                },
            },
            async ({ name }, extra) => {
                const result = await this.getComponentByName(name);
                return result;
            }
        );

        this.server.registerTool(
            'get_design_tokens',
            {
                title: 'get_design_tokens',
                description: 'Get design system tokens (colors, spacing, typography)',
                inputSchema: {
                },
            },
            async (_args, extra) => {
                const result = await this.getDesignTokens();
                return result;
            }
        );

    }








    private async getComponents(category: string) {
        if (this.componentsCache.length === 0) {
            await this.loadComponents();
        }

        let filtered = this.componentsCache;
        if (category !== 'all') {
            filtered = this.componentsCache.filter(comp =>
                comp.path.includes(`/${category}/`) || comp.name.toLowerCase().includes(category)
            );
        }

        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify({
                        components: filtered,
                        usage_guidelines: {
                            import_pattern: "import ComponentName from '@/components/path/ComponentName';",
                            styling: "Use Tailwind CSS classes for styling",
                            conventions: [
                                "Use TypeScript interfaces for props",
                                "Export default for main component",
                                "Use functional components with hooks",
                                "Follow Next.js 13+ App Router conventions"
                            ]
                        }
                    }, null, 2),
                    _meta: {}
                },
            ],
        };
    }

    private async getComponentByName(name: string) {
        if (this.componentsCache.length === 0) {
            await this.loadComponents();
        }

        const component = this.componentsCache.find(comp =>
            comp.name.toLowerCase() === name.toLowerCase()
        );

        if (!component) {
            throw new Error(`Component ${name} not found`);
        }

        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(component, null, 2),
                    _meta: {}
                },
            ],
        };
    }

    private async getDesignTokens() {
        const tokens = {
            colors: {
                primary: {
                    50: "#eff6ff",
                    500: "#3b82f6",
                    600: "#2563eb",
                    700: "#1d4ed8",
                },
                secondary: {
                    50: "#f8fafc",
                    500: "#64748b",
                    600: "#475569",
                    700: "#334155",
                },
                success: "#10b981",
                warning: "#f59e0b",
                error: "#ef4444",
            },
            spacing: {
                xs: "0.5rem",
                sm: "0.75rem",
                md: "1rem",
                lg: "1.5rem",
                xl: "2rem",
            },
            typography: {
                fontFamily: "Inter, sans-serif",
                fontSize: {
                    xs: "0.75rem",
                    sm: "0.875rem",
                    base: "1rem",
                    lg: "1.125rem",
                    xl: "1.25rem",
                },
            },
            borderRadius: {
                sm: "0.375rem",
                md: "0.5rem",
                lg: "0.75rem",
                xl: "1rem",
            },
        };

        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(tokens, null, 2),
                    _meta: {}
                },
            ],
        };
    }

    private setupResources() {
        // Static list of all components as a resource
        this.server.registerResource(
            'components',
            'components://all',
            {
                title: 'All Components',
                description: 'JSON list of all available components',
                mimeType: 'application/json'
            },
            async (uri) => {
                if (this.componentsCache.length === 0) {
                    await this.loadComponents();
                }
                return {
                    contents: [{
                        uri: uri.href,
                        text: JSON.stringify(this.componentsCache, null, 2)
                    }]
                };
            }
        );

        // Dynamic component resource by name, e.g. component://Button
        this.server.registerResource(
            'component',
            new ResourceTemplate('component://{name}', { list: undefined }),
            {
                title: 'Component by Name',
                description: 'Returns a single component definition by name',
                mimeType: 'application/json'
            },
            async (uri, variables) => {
                const name = String((variables as { name: string }).name);
                if (this.componentsCache.length === 0) {
                    await this.loadComponents();
                }
                const comp = this.componentsCache.find(c => c.name.toLowerCase() === name.toLowerCase());
                return {
                    contents: [{
                        uri: uri.href,
                        text: comp ? JSON.stringify(comp, null, 2) : JSON.stringify({ error: `Component ${name} not found` })
                    }]
                };
            }
        );
    }

    private async loadComponents() {
        const componentsDir = path.join(process.cwd(), 'src', 'components');

        try {
            const componentFiles = await this.scanForComponents(componentsDir);
            this.componentsCache = await Promise.all(
                componentFiles.map(filePath => this.parseComponent(filePath))
            );
        } catch (error) {
            console.error('Error loading components:', error);
            this.componentsCache = this.getDefaultComponents();
        }
    }

    private async scanForComponents(dir: string): Promise<string[]> {
        const files: string[] = [];

        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    files.push(...await this.scanForComponents(fullPath));
                } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            // Directory doesn't exist or can't be read
        }

        return files;
    }

    private async parseComponent(filePath: string): Promise<ComponentDefinition> {
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const relativePath = path.relative(process.cwd(), filePath);
            const componentName = path.basename(filePath, path.extname(filePath));

            // Extract props interface (simplified parsing)
            const propsMatch = content.match(/interface\s+(\w+Props)\s*{([^}]+)}/);
            let props = {};

            if (propsMatch) {
                const propsContent = propsMatch[2];
                // Simple prop extraction (you might want to use a proper TS parser)
                const propLines = propsContent.split('\n')
                    .filter(line => line.trim() && !line.trim().startsWith('//'))
                    .map(line => line.trim());

                props = propLines.reduce((acc: Record<string, any>, line) => {
                    const match = line.match(/(\w+)(\?)?:\s*([^;]+)/);
                    if (match) {
                        acc[match[1]] = {
                            type: match[3].trim(),
                            optional: !!match[2],
                        };
                    }
                    return acc;
                }, {});
            }

            // Generate usage example
            const usage = this.generateUsageExample(componentName, props);

            return {
                name: componentName,
                path: relativePath,
                props,
                usage,
                dependencies: this.extractDependencies(content),
            };
        } catch (error) {
            console.error(`Error parsing component ${filePath}:`, error);
            return {
                name: path.basename(filePath, path.extname(filePath)),
                path: path.relative(process.cwd(), filePath),
                props: {},
                usage: `<${path.basename(filePath, path.extname(filePath))} />`,
            };
        }
    }

    private generateUsageExample(componentName: string, props: Record<string, any>): string {
        const requiredProps = Object.entries(props)
            .filter(([_, config]) => !config.optional)
            .map(([name, config]) => {
                const exampleValue = this.getExampleValue(config.type);
                return `${name}={${exampleValue}}`;
            })
            .join(' ');

        return `<${componentName}${requiredProps ? ' ' + requiredProps : ''} />`;
    }

    private getExampleValue(type: string): string {
        if (type.includes('string')) return '"example"';
        if (type.includes('number')) return '42';
        if (type.includes('boolean')) return 'true';
        if (type.includes('function') || type.includes('=>')) return '() => {}';
        if (type.includes('[]')) return '[]';
        return '{}';
    }

    private extractDependencies(content: string): string[] {
        const importMatches = content.match(/import\s+.*\s+from\s+['"]([^'"]+)['"]/g) || [];
        return importMatches
            .map(match => {
                const fromMatch = match.match(/from\s+['"]([^'"]+)['"]/);
                return fromMatch ? fromMatch[1] : null;
            })
            .filter(Boolean) as string[];
    }

    private getDefaultComponents(): ComponentDefinition[] {
        return [
            {
                name: 'Preview',
                path: 'src/components/Preview.tsx',
                props: {
                    code: { type: 'string', optional: false },
                },
                usage: '<Preview code={generatedCode} />',
                dependencies: ['react'],
            },
            {
                name: 'FileExplorer',
                path: 'src/components/FileExplorer.tsx',
                props: {
                    files: { type: 'GeneratedFile[]', optional: false },
                    onOpenFile: { type: '(file: GeneratedFile) => void', optional: false },
                    onDeleteFile: { type: '(path: string) => void', optional: false },
                },
                usage: '<FileExplorer files={files} onOpenFile={handleOpenFile} onDeleteFile={handleDeleteFile} />',
                dependencies: ['react'],
            },
        ];
    }

    async run() {
        const port = Number(process.env.CODZILLA_MCP_PORT || process.env.PORT || 3333);
        const host = process.env.HOST || '127.0.0.1';

        const app = express();
        app.use(express.json());

        const transports: Record<string, StreamableHTTPServerTransport> = {};

        app.post('/mcp', async (req: express.Request, res: express.Response) => {
            const sessionId = req.headers['mcp-session-id'] as string | undefined;
            let transport: StreamableHTTPServerTransport | undefined;

            if (sessionId && transports[sessionId]) {
                transport = transports[sessionId];
            } else if (!sessionId && isInitializeRequest(req.body)) {
                const allowedHostVariants = [
                    host,
                    `${host}:${port}`,
                    '127.0.0.1',
                    `127.0.0.1:${port}`,
                    'localhost',
                    `localhost:${port}`,
                ];
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (sid) => {
                        transports[sid] = transport!;
                    },
                    enableDnsRebindingProtection: true,
                    allowedHosts: allowedHostVariants,
                });

                transport.onclose = () => {
                    if (transport && transport.sessionId) {
                        delete transports[transport.sessionId];
                    }
                };

                await this.server.connect(transport);
            } else {
                res.status(400).json({
                    jsonrpc: '2.0',
                    error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
                    id: null,
                });
                return;
            }

            await transport!.handleRequest(req as any, res as any, req.body);
        });

        const handleSessionRequest = async (req: express.Request, res: express.Response) => {
            const sid = req.headers['mcp-session-id'] as string | undefined;
            if (!sid || !transports[sid]) {
                res.status(400).send('Invalid or missing session ID');
                return;
            }
            const transport = transports[sid];
            await transport.handleRequest(req as any, res as any);
        };

        app.get('/mcp', handleSessionRequest);
        app.delete('/mcp', handleSessionRequest);

        app.listen(port, host, (err?: any) => {
            if (err) {
                console.error('Failed to start MCP HTTP server:', err);
                process.exit(1);
            }
            console.error(`Codezilla Components MCP server (Streamable HTTP) at http://${host}:${port}/mcp`);
        });
    }
}

// Start the server
const server = new ComponentMCPServer();
server.run().catch(console.error);
