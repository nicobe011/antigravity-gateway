/**
 * Antigravity Gateway
 * Entry point - starts the universal AI gateway server
 * Features rich visual Terminal UI (TUI), arrow-key / number selection,
 * fixed dashboard window with a scrollable 10-line request feed.
 * Account selection is purely manual on startup: no automatic account switching.
 * Supports dual provider selection: Google Antigravity & OpenCode Zen (Free Models).
 * When selecting OpenCode Zen, allows picking the exact free model and reasoning mode.
 * Automatic quota refresh runs in the background every 30 minutes without affecting request latency.
 */

import readline from 'readline';
import app from './server.js';
import { DEFAULT_PORT, OPENCODE_ZEN_FREE_MODELS } from './constants.js';
import { logger } from './utils/logger.js';
import {
    renderArrowSelectionMenu,
    renderOpenCodeZenModelMenu,
    renderOpenCodeZenReasoningMenu,
    renderFixedDashboardWithLogs
} from './utils/terminal-dashboard.js';
import {
    getOpenCodeZenApiKey,
    saveOpenCodeZenApiKey,
    setActiveOpenCodeZenConfig,
    getActiveOpenCodeZenConfig
} from './opencode/zen-client.js';

const args = process.argv.slice(2);
const isDebug = args.includes('--debug') || process.env.DEBUG === 'true';
const isFallbackEnabled = args.includes('--fallback') || process.env.FALLBACK === 'true';
const hasExplicitAccount = args.find(a => a.startsWith('--account='))?.split('=')[1];

logger.setDebug(isDebug);

if (isDebug) {
    logger.debug('Modo de depuração (debug) ativado');
}

if (isFallbackEnabled) {
    logger.info('Modo de fallback de modelos ativado');
}

export const FALLBACK_ENABLED = isFallbackEnabled;
const PORT = process.env.PORT || DEFAULT_PORT;

// Live logs and quota cache for fixed terminal window
const recentLogs = [];
const MAX_LOGS = 10;
let currentQuota = null;
let lastQuotaRefresh = new Date();
let dashboardRefreshTimer = null;
let currentProvider = 'antigravity'; // 'antigravity' or 'opencode-zen'
app.currentProvider = currentProvider;

/**
 * Redraw the fixed terminal dashboard screen
 */
function redrawFixedDashboard() {
    if (!process.stdout.isTTY) return;

    const accountManager = app.accountManager;
    const activeEmail = accountManager?.getPinnedAccountEmail();
    const zenConfig = getActiveOpenCodeZenConfig();
    const zenModelMeta = OPENCODE_ZEN_FREE_MODELS.find(m => m.id === zenConfig.modelId) || OPENCODE_ZEN_FREE_MODELS[0];

    const screen = renderFixedDashboardWithLogs({
        port: PORT,
        activeEmail,
        activeProvider: currentProvider,
        zenModelName: zenModelMeta?.displayName,
        zenReasoning: zenConfig.reasoning,
        fiveHourLimit: currentQuota?.fiveHourLimit || {},
        weeklyLimit: currentQuota?.weeklyLimit || {},
        claudeLimits: currentQuota?.claudeLimits || null,
        recentLogs,
        lastRefreshTime: lastQuotaRefresh
    });

    console.clear();
    process.stdout.write(screen + '\n');
}

/**
 * Add a log line to the fixed terminal request window and redraw
 *
 * @param {string} line - Log line
 */
export function pushTerminalRequestLog(line) {
    recentLogs.push(line);
    if (recentLogs.length > MAX_LOGS) {
        recentLogs.shift();
    }
    redrawFixedDashboard();
}

/**
 * Start background automatic quota refresh (every 30 minutes)
 * Runs purely in background: never blocks client requests
 */
function startPeriodicQuotaRefresh() {
    const THIRTY_MINUTES_MS = 30 * 60 * 1000;
    dashboardRefreshTimer = setInterval(async () => {
        try {
            const accountManager = app.accountManager;
            currentQuota = await accountManager?.getAccountQuotaSummary();
            lastQuotaRefresh = new Date();
            redrawFixedDashboard();
        } catch (err) {
            // Silently keep previous quota display
        }
    }, THIRTY_MINUTES_MS);
    if (dashboardRefreshTimer.unref) dashboardRefreshTimer.unref();
}

async function startServer() {
    app.currentProvider = currentProvider;
    app.listen(PORT, async () => {
        const accountManager = app.accountManager;

        // Fetch live quota for initial display
        if (currentProvider === 'antigravity') {
            try {
                currentQuota = await accountManager?.getAccountQuotaSummary();
                lastQuotaRefresh = new Date();
            } catch {
                currentQuota = null;
            }
        }

        // Intercept logger to push into fixed terminal window
        const originalPrint = logger.print.bind(logger);
        logger.print = function (level, color, message, ...rest) {
            const time = new Date().toLocaleTimeString('pt-BR');
            const extra = rest.length > 0 ? ' ' + rest.map(r => typeof r === 'object' ? JSON.stringify(r) : r).join(' ') : '';
            const formatted = `\x1b[90m[${time}]\x1b[0m ${color}[${level}]\x1b[0m ${message}${extra}`;

            if (process.stdout.isTTY) {
                pushTerminalRequestLog(formatted);
            } else {
                originalPrint(level, color, message, ...rest);
            }
        };

        redrawFixedDashboard();
        if (currentProvider === 'antigravity') {
            startPeriodicQuotaRefresh();
        }
    });
}

/**
 * Interactive menu supporting arrow keys, direct numbers, and [Z] for OpenCode Zen
 */
function promptInteractiveSelection(accounts, summaries, hasOpenCodeZen) {
    return new Promise((resolve) => {
        let selectedIndex = 0; // 0..accounts.length (accounts.length = OpenCode Zen)
        const maxIndex = accounts.length;

        const renderMenu = () => {
            console.clear();
            const output = renderArrowSelectionMenu({
                accounts,
                summaries,
                selectedIndex,
                hasOpenCodeZen
            });
            process.stdout.write(output + '\n');
        };

        renderMenu();

        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }

        const onKeyPress = (str, key) => {
            if (!key) return;

            // Handle Ctrl+C
            if (key.ctrl && key.name === 'c') {
                process.exit(0);
            }

            // Arrow keys navigation
            if (key.name === 'up') {
                selectedIndex = (selectedIndex - 1 + (maxIndex + 1)) % (maxIndex + 1);
                renderMenu();
                return;
            }

            if (key.name === 'down') {
                selectedIndex = (selectedIndex + 1) % (maxIndex + 1);
                renderMenu();
                return;
            }

            // OpenCode Zen direct shortcut 'z' or 'Z'
            if (str && (str.toLowerCase() === 'z')) {
                selectedIndex = accounts.length;
                renderMenu();
                return;
            }

            // Direct number selection (1..N)
            if (str && /^[1-9]$/.test(str)) {
                const num = parseInt(str, 10);
                if (num <= accounts.length) {
                    selectedIndex = num - 1;
                    renderMenu();
                }
                return;
            }

            // Enter confirmation
            if (key.name === 'return' || key.name === 'enter') {
                cleanup();
                if (selectedIndex === accounts.length) {
                    resolve({ type: 'opencode-zen' });
                } else {
                    resolve({ type: 'antigravity', account: accounts[selectedIndex] || accounts[0] });
                }
            }
        };

        const cleanup = () => {
            process.stdin.removeListener('keypress', onKeyPress);
            if (process.stdin.isTTY) {
                process.stdin.setRawMode(false);
            }
        };

        process.stdin.on('keypress', onKeyPress);
    });
}

/**
 * Interactive menu to pick a specific OpenCode Zen free model
 */
function promptInteractiveOpenCodeZenModelSelection() {
    return new Promise((resolve) => {
        let selectedIndex = 0;
        const maxIndex = OPENCODE_ZEN_FREE_MODELS.length - 1;

        const renderMenu = () => {
            console.clear();
            const output = renderOpenCodeZenModelMenu(OPENCODE_ZEN_FREE_MODELS, selectedIndex);
            process.stdout.write(output + '\n');
        };

        renderMenu();

        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }

        const onKeyPress = (str, key) => {
            if (!key) return;

            if (key.ctrl && key.name === 'c') {
                process.exit(0);
            }

            if (key.name === 'up') {
                selectedIndex = (selectedIndex - 1 + (maxIndex + 1)) % (maxIndex + 1);
                renderMenu();
                return;
            }

            if (key.name === 'down') {
                selectedIndex = (selectedIndex + 1) % (maxIndex + 1);
                renderMenu();
                return;
            }

            if (str && /^[1-8]$/.test(str)) {
                const num = parseInt(str, 10);
                if (num <= OPENCODE_ZEN_FREE_MODELS.length) {
                    selectedIndex = num - 1;
                    renderMenu();
                }
                return;
            }

            if (key.name === 'return' || key.name === 'enter') {
                cleanup();
                resolve(OPENCODE_ZEN_FREE_MODELS[selectedIndex] || OPENCODE_ZEN_FREE_MODELS[0]);
            }
        };

        const cleanup = () => {
            process.stdin.removeListener('keypress', onKeyPress);
            if (process.stdin.isTTY) {
                process.stdin.setRawMode(false);
            }
        };

        process.stdin.on('keypress', onKeyPress);
    });
}

/**
 * Interactive menu to configure reasoning for the chosen model
 */
function promptInteractiveOpenCodeZenReasoningSelection(model) {
    if (!model.supportsThinking || model.reasoningType === 'none') {
        return Promise.resolve(null);
    }

    const options = [];
    if (model.reasoningType === 'effort') {
        options.push({ value: 'low', label: '1. Raciocínio Leve (Low)', description: 'Pensamento rápido com baixo consumo de tokens e baixa latência.' });
        options.push({ value: 'medium', label: '2. Raciocínio Equilibrado (Medium)', description: 'Equilíbrio ideal entre profundidade de raciocínio e velocidade (Recomendado).' });
        options.push({ value: 'high', label: '3. Raciocínio Profundo (High)', description: 'Análise profunda e minuciosa para problemas de código complexos.' });
        options.push({ value: 'disabled', label: '4. Desativar Raciocínio (Zero Pensamento)', description: 'Resposta imediata sem cadeia de pensamentos.' });
    } else if (model.reasoningType === 'toggle') {
        options.push({ value: 'enabled', label: '1. Ativar Raciocínio (Thinking Ativo)', description: 'Permite ao modelo pensar antes de responder (Recomendado).' });
        options.push({ value: 'disabled', label: '2. Desativar Raciocínio (Desligado)', description: 'Resposta direta sem gerar blocos de pensamento.' });
    }

    return new Promise((resolve) => {
        let selectedIndex = 0;
        const maxIndex = options.length - 1;

        const renderMenu = () => {
            console.clear();
            const output = renderOpenCodeZenReasoningMenu(model, selectedIndex, options);
            process.stdout.write(output + '\n');
        };

        renderMenu();

        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }

        const onKeyPress = (str, key) => {
            if (!key) return;

            if (key.ctrl && key.name === 'c') {
                process.exit(0);
            }

            if (key.name === 'up') {
                selectedIndex = (selectedIndex - 1 + (maxIndex + 1)) % (maxIndex + 1);
                renderMenu();
                return;
            }

            if (key.name === 'down') {
                selectedIndex = (selectedIndex + 1) % (maxIndex + 1);
                renderMenu();
                return;
            }

            if (str && /^[1-4]$/.test(str)) {
                const num = parseInt(str, 10);
                if (num <= options.length) {
                    selectedIndex = num - 1;
                    renderMenu();
                }
                return;
            }

            if (key.name === 'return' || key.name === 'enter') {
                cleanup();
                resolve(options[selectedIndex]?.value || null);
            }
        };

        const cleanup = () => {
            process.stdin.removeListener('keypress', onKeyPress);
            if (process.stdin.isTTY) {
                process.stdin.setRawMode(false);
            }
        };

        process.stdin.on('keypress', onKeyPress);
    });
}

/**
 * Prompt user for OpenCode Zen API key in terminal
 */
function promptForOpenCodeZenApiKey() {
    return new Promise((resolve) => {
        console.clear();
        console.log('\x1b[36m╔══════════════════════════════════════════════════════════════════╗\x1b[0m');
        console.log('\x1b[36m║\x1b[0m       \x1b[1m\x1b[37m🔑 CONFIGURAÇÃO DA CHAVE DE API - OPENCODE ZEN\x1b[0m            \x1b[36m║\x1b[0m');
        console.log('\x1b[36m╚══════════════════════════════════════════════════════════════════╝\x1b[0m\n');
        console.log('Insira sua chave oficial da API OpenCode Zen (ex: zen_... ou sk-...):');
        console.log('\x1b[90m(A chave será salva em ~/.config/antigravity-gateway/opencode-zen.json)\x1b[0m\n');

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('API Key: ', async (key) => {
            rl.close();
            const trimmed = (key || '').trim();
            if (trimmed) {
                await saveOpenCodeZenApiKey(trimmed);
                console.log('\n\x1b[32m✓ Chave do OpenCode Zen salva com sucesso!\x1b[0m\n');
                resolve(trimmed);
            } else {
                console.log('\n\x1b[33mNenhuma chave inserida. Continuando com chave do ambiente se disponível.\x1b[0m\n');
                resolve(null);
            }
        });
    });
}

/**
 * Main startup routine directly in the terminal
 */
async function main() {
    const accountManager = app.accountManager;
    await accountManager.initialize();

    if (hasExplicitAccount) {
        accountManager.selectAccount(hasExplicitAccount);
        await startServer();
        return;
    }

    const accounts = accountManager.getAllAccounts();
    const existingZenKey = await getOpenCodeZenApiKey();

    // If running in non-interactive environment (CI, background, pipes), start directly
    if (!process.stdin.isTTY || process.env.CI) {
        if (accounts.length > 0) {
            accountManager.selectAccount(accounts[0].email);
        }
        await startServer();
        return;
    }

    console.clear();
    console.log('\x1b[36m⚡ Carregando cotas das contas cadastradas...\x1b[0m');

    // Fetch quota summaries for all accounts in parallel
    const summaries = await Promise.all(
        accounts.map(acc => accountManager.getAccountQuotaSummary(acc))
    );

    const selection = await promptInteractiveSelection(accounts, summaries, !!existingZenKey);

    if (selection.type === 'opencode-zen') {
        currentProvider = 'opencode-zen';
        app.currentProvider = 'opencode-zen';
        if (!existingZenKey) {
            await promptForOpenCodeZenApiKey();
        }

        // 1. Pick specific OpenCode Zen free model
        const chosenZenModel = await promptInteractiveOpenCodeZenModelSelection();

        // 2. Pick reasoning configuration if model supports it
        const chosenReasoning = await promptInteractiveOpenCodeZenReasoningSelection(chosenZenModel);

        setActiveOpenCodeZenConfig(chosenZenModel.id, chosenReasoning);
    } else {
        currentProvider = 'antigravity';
        app.currentProvider = 'antigravity';
        if (selection.account) {
            accountManager.selectAccount(selection.account.email);
        }
    }

    await startServer();
}

main().catch(async (err) => {
    logger.error('Erro na inicialização do gateway:', err);
    await startServer();
});
