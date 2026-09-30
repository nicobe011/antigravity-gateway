/**
 * Antigravity Gateway
 * Entry point - starts the universal AI gateway server
 * Features rich visual Terminal UI (TUI), arrow-key / number selection,
 * fixed dashboard window with a scrollable 10-line request feed.
 * Account selection is purely manual on startup: no automatic account switching.
 * Automatic quota refresh runs in the background every 30 minutes without affecting request latency.
 */

import readline from 'readline';
import app from './server.js';
import { DEFAULT_PORT } from './constants.js';
import { logger } from './utils/logger.js';
import { renderArrowSelectionMenu, renderFixedDashboardWithLogs } from './utils/terminal-dashboard.js';

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

/**
 * Redraw the fixed terminal dashboard screen
 */
function redrawFixedDashboard() {
    if (!process.stdout.isTTY) return;

    const accountManager = app.accountManager;
    const activeEmail = accountManager?.getPinnedAccountEmail();

    const screen = renderFixedDashboardWithLogs({
        port: PORT,
        activeEmail,
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
    app.listen(PORT, async () => {
        const accountManager = app.accountManager;

        // Fetch live quota for initial display
        try {
            currentQuota = await accountManager?.getAccountQuotaSummary();
            lastQuotaRefresh = new Date();
        } catch {
            currentQuota = null;
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
        startPeriodicQuotaRefresh();
    });
}

/**
 * Interactive menu supporting arrow keys and direct number typing
 * Allows choosing the exact account to use for the session.
 */
function promptInteractiveAccountSelection(accounts, summaries) {
    return new Promise((resolve) => {
        let selectedIndex = 0; // 0..N-1 for accounts
        const maxIndex = Math.max(0, accounts.length - 1);

        const renderMenu = () => {
            console.clear();
            const output = renderArrowSelectionMenu({
                accounts,
                summaries,
                selectedIndex
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
                resolve(accounts[selectedIndex] || accounts[0]);
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

    // If only one account exists or running in non-interactive environment, start directly without asking
    if (accounts.length <= 1 || !process.stdin.isTTY || process.env.CI) {
        if (accounts.length === 1) {
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

    const chosenAccount = await promptInteractiveAccountSelection(accounts, summaries);
    if (chosenAccount) {
        accountManager.selectAccount(chosenAccount.email);
    }

    await startServer();
}

main().catch(async (err) => {
    logger.error('Erro na inicialização do gateway:', err);
    await startServer();
});
