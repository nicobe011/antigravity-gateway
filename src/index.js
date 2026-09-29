/**
 * Antigravity Gateway
 * Entry point - starts the universal AI gateway server
 * Features rich visual Terminal UI (TUI), arrow-key / number selection,
 * fixed dashboard window with a scrollable 10-line request feed,
 * and automatic 30-minute quota refresh.
 */

import readline from 'readline';
import app from './server.js';
import { DEFAULT_PORT } from './constants.js';
import { logger } from './utils/logger.js';
import { setOpus55SkillActive, isOpus55SkillEnabled } from './skill-manager.js';
import { renderArrowSelectionMenu, renderFixedDashboardWithLogs } from './utils/terminal-dashboard.js';

const args = process.argv.slice(2);
const isDebug = args.includes('--debug') || process.env.DEBUG === 'true';
const isFallbackEnabled = args.includes('--fallback') || process.env.FALLBACK === 'true';
const hasExplicitSkillFlag = args.includes('--skill-opus55') || args.includes('--opus55');
const hasExplicitNoSkillFlag = args.includes('--no-skill-opus55') || args.includes('--no-opus55');
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
    const pinnedEmail = accountManager?.getPinnedAccountEmail();
    const accounts = accountManager?.getAllAccounts() || [];

    const screen = renderFixedDashboardWithLogs({
        port: PORT,
        pinnedEmail,
        fiveHourLimit: currentQuota?.fiveHourLimit || {},
        weeklyLimit: currentQuota?.weeklyLimit || {},
        claudeLimits: currentQuota?.claudeLimits || null,
        accountsCount: accounts.length,
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
 */
function promptInteractiveAccountSelection(accounts, summaries) {
    return new Promise((resolve) => {
        let selectedIndex = 0; // 0 = Multi-account intelligent mode, 1..N = Specific account
        const maxIndex = accounts.length;

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

            // Direct number selection
            if (str && /^[0-9]$/.test(str)) {
                const num = parseInt(str, 10);
                if (num <= maxIndex) {
                    selectedIndex = num;
                    renderMenu();
                }
                return;
            }

            // Add account shortcut
            if (str === '+' || str === 'a' || str === 'A') {
                cleanup();
                console.clear();
                console.log('\n\x1b[33mPara adicionar uma nova conta, execute no terminal:\x1b[0m');
                console.log('\x1b[1mnpm run accounts:add\x1b[0m\n');
                resolve({ selectedAccount: null });
                return;
            }

            // Enter confirmation
            if (key.name === 'return' || key.name === 'enter') {
                cleanup();
                if (selectedIndex === 0) {
                    resolve({ selectedAccount: null });
                } else {
                    resolve({ selectedAccount: accounts[selectedIndex - 1] });
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
 * Main interactive startup routine directly in the terminal
 */
async function main() {
    const accountManager = app.accountManager;
    await accountManager.initialize();

    // Default skill state
    setOpus55SkillActive(true);

    if (hasExplicitAccount) {
        accountManager.setPinnedAccount(hasExplicitAccount);
        await startServer();
        return;
    }

    const accounts = accountManager.getAllAccounts();

    // If running in non-interactive environment (CI, background, pipes), start directly
    if (!process.stdin.isTTY || process.env.CI) {
        await startServer();
        return;
    }

    console.clear();
    console.log('\x1b[36m⚡ Carregando informações de cotas do Antigravity (Google Cloud Code)...\x1b[0m');

    // Fetch quota summaries for all accounts in parallel
    const summaries = [];
    for (const acc of accounts) {
        try {
            const summary = await accountManager.getAccountQuotaSummary(acc);
            summaries.push(summary);
        } catch (err) {
            summaries.push({
                email: acc.email,
                fiveHourLimit: { remainingPercent: 100, messagePt: 'Pronto para uso.' },
                weeklyLimit: { remainingPercent: 100, messagePt: 'Cota semanal normal.' }
            });
        }
    }

    const { selectedAccount } = await promptInteractiveAccountSelection(accounts, summaries);

    if (selectedAccount) {
        accountManager.setPinnedAccount(selectedAccount.email);
    } else {
        accountManager.setPinnedAccount(null);
    }

    await startServer();
}

main().catch(async (err) => {
    logger.error('Erro na inicialização do gateway:', err);
    await startServer();
});
