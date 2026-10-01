/**
 * Terminal UI Dashboard for Antigravity Gateway
 * Renders a rich, modern console interface directly in the terminal (CMD/PowerShell)
 * Displays Weekly Limit Remaining and Five Hour Limit Remaining from official Antigravity quota API.
 * Supports provider selection: Google Antigravity (Gemini 3.8 Flash) and OpenCode Zen (Free Models).
 * Keeps a fixed dashboard viewport with a scrollable 10-line request feed.
 */

// ANSI Color Codes
export const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    italic: '\x1b[3m',
    underline: '\x1b[4m',

    // Foreground colors
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',

    // Bright colors
    brightRed: '\x1b[91m',
    brightGreen: '\x1b[92m',
    brightYellow: '\x1b[93m',
    brightBlue: '\x1b[94m',
    brightMagenta: '\x1b[95m',
    brightCyan: '\x1b[96m',
    brightWhite: '\x1b[97m'
};

/**
 * Generate a visual progress bar with ANSI colors
 *
 * @param {number} percent - Percentage from 0 to 100
 * @param {number} length - Number of character blocks
 * @returns {string} Colored progress bar string
 */
export function renderProgressBar(percent, length = 22) {
    const safePct = Math.max(0, Math.min(100, Math.round(percent ?? 100)));
    const filledCount = Math.round((safePct / 100) * length);
    const emptyCount = length - filledCount;

    let color = C.brightGreen;
    if (safePct < 25) {
        color = C.brightRed;
    } else if (safePct < 55) {
        color = C.brightYellow;
    }

    const filledBar = '█'.repeat(filledCount);
    const emptyBar = '░'.repeat(emptyCount);

    return `${color}${filledBar}${C.dim}${emptyBar}${C.reset} ${C.bold}${color}${safePct}%${C.reset}`;
}

/**
 * Render the interactive arrow-navigable selection menu
 *
 * @param {Object} data - Accounts, summaries, OpenCode Zen status and selectedIndex
 * @returns {string} Formatted menu
 */
export function renderArrowSelectionMenu(data) {
    const {
        accounts = [],
        summaries = [],
        selectedIndex = 0,
        hasOpenCodeZen = false
    } = data;

    const lines = [];

    lines.push(`${C.brightMagenta}╔══════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
    lines.push(`${C.brightMagenta}║${C.reset}       ${C.bold}${C.brightWhite}⚡ ANTIGRAVITY GATEWAY - SELEÇÃO DE CONTA E PROVEDOR${C.reset}              ${C.brightMagenta}║${C.reset}`);
    lines.push(`${C.brightMagenta}║${C.reset}       ${C.cyan}Navegue com [↑ / ↓] e tecle [ENTER] ou digite o número da conta${C.reset}            ${C.brightMagenta}║${C.reset}`);
    lines.push(`${C.brightMagenta}╚══════════════════════════════════════════════════════════════════════════════════╝${C.reset}`);
    lines.push('');

    lines.push(`${C.bold}${C.brightCyan}📊 COTAS E LIMITES REAIS DO GOOGLE ANTIGRAVITY:${C.reset}`);
    lines.push(`${C.dim}──────────────────────────────────────────────────────────────────────────────────${C.reset}`);

    // Accounts list
    if (accounts.length === 0) {
        lines.push(`   ${C.yellow}Nenhuma conta Google configurada. Execute: npm run accounts:add${C.reset}`);
    } else {
        accounts.forEach((acc, idx) => {
            const accNum = idx + 1;
            const isSelected = selectedIndex === idx;
            const prefix = isSelected ? `${C.brightGreen}${C.bold} ► [${accNum}] ` : `   [${accNum}] `;
            const summary = summaries[idx] || {};
            const weekly = summary.weeklyLimit || {};
            const fiveHour = summary.fiveHourLimit || {};

            lines.push(`${prefix}${C.bold}Conta ${accNum}:${C.reset} ${C.brightWhite}${acc.email}${C.reset}${isSelected ? ` ${C.brightYellow}(SELECIONADA)${C.reset}` : ''}`);
            lines.push(`        ${C.bold}📅 Weekly:${C.reset} [${renderProgressBar(weekly.remainingPercent, 18)}] • ${C.dim}Restaura: ${weekly.timeRemainingPt || 'breve'}${C.reset}`);
            lines.push(`        ${C.bold}⏱️  5-Hour:${C.reset} [${renderProgressBar(fiveHour.remainingPercent, 18)}] • ${C.dim}Restaura: ${fiveHour.timeRemainingPt || 'breve'}${C.reset}`);
            lines.push(`        ${C.dim}↳ ${weekly.messagePt || ''}${C.reset}`);
            lines.push('');
        });
    }

    // OpenCode Zen Section
    const zenOptionIndex = accounts.length;
    const isZenSelected = selectedIndex === zenOptionIndex;
    const zenPrefix = isZenSelected ? `${C.brightGreen}${C.bold} ► [Z] ` : `   [Z] `;

    lines.push(`${C.bold}${C.brightCyan}🌐 PROVEDOR ADICIONAL (OPENCODE ZEN):${C.reset}`);
    lines.push(`${C.dim}──────────────────────────────────────────────────────────────────────────────────${C.reset}`);
    if (hasOpenCodeZen) {
        lines.push(`${zenPrefix}${C.bold}OPENCODE ZEN (Modelos Free Ativos)${C.reset}${isZenSelected ? ` ${C.brightYellow}(SELECIONADO)${C.reset}` : ''}`);
        lines.push(`        ${C.dim}↳ Modelos Free: Nemotron 3.5, Muse Spark 1.3, Ling 3.0, LongCat 2.5, Space Bunny, MiMo-V2.6${C.reset}`);
    } else {
        lines.push(`${zenPrefix}${C.yellow}Configurar Chave de API do OpenCode Zen (Modelos Free)${C.reset}`);
        lines.push(`        ${C.dim}↳ Digite Z para inserir sua chave oficial da API OpenCode Zen.${C.reset}`);
    }

    lines.push('');
    lines.push(`${C.dim}──────────────────────────────────────────────────────────────────────────────────${C.reset}`);
    lines.push(`  ${C.dim}Use ${C.bold}↑/↓${C.reset}${C.dim} para escolher, ${C.bold}ENTER${C.reset}${C.dim} para confirmar, número ${C.bold}[1..${accounts.length}]${C.reset}${C.dim} ou ${C.bold}[Z]${C.reset}${C.dim} para OpenCode Zen.${C.reset}`);

    return lines.join('\n');
}

/**
 * Render the fixed top banner + scrollable recent request logs
 *
 * @param {Object} data - Server state, quotas, provider info and recent log lines
 * @returns {string} Complete terminal screen content
 */
export function renderFixedDashboardWithLogs(data) {
    const {
        port = 8080,
        activeEmail = null,
        activeProvider = 'antigravity',
        fiveHourLimit = {},
        weeklyLimit = {},
        claudeLimits = null,
        recentLogs = [],
        lastRefreshTime = new Date()
    } = data;

    const lines = [];

    // Header
    lines.push(`${C.brightMagenta}╔══════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
    lines.push(`${C.brightMagenta}║${C.reset}   ${C.bold}${C.brightWhite}⚡ ANTIGRAVITY GATEWAY ATIVO NO TERMINAL${C.reset}                                    ${C.brightMagenta}║${C.reset}`);
    lines.push(`${C.brightMagenta}║${C.reset}   Porta Local: ${C.brightGreen}http://localhost:${port}${C.reset}                                            ${C.brightMagenta}║${C.reset}`);
    lines.push(`${C.brightMagenta}╠══════════════════════════════════════════════════════════════════════════════════╣${C.reset}`);

    if (activeProvider === 'opencode-zen') {
        lines.push(`${C.brightMagenta}║${C.reset}   Provedor Ativo: ${C.brightGreen}🌐 OpenCode Zen (Modelos Gratuitos Oficiais)${C.reset}`);
        lines.push(`${C.brightMagenta}║${C.reset}   Modelos Free: ${C.cyan}Nemotron 3.5, Muse Spark, Ling 3.0, LongCat, MiMo, Big Pickle${C.reset}`);
    } else {
        lines.push(`${C.brightMagenta}║${C.reset}   Conta Ativa: ${C.brightYellow}⭐ ${activeEmail || 'Padrão'}${C.reset} ${C.dim}(Google Antigravity - Modo Manual)${C.reset}`);
        lines.push(`${C.brightMagenta}║${C.reset}   Modelos Claude: ${C.cyan}claude-opus-4-6-low/medium/high[1m] -> Gemini 3.8 Flash${C.reset}`);
        lines.push(`${C.brightMagenta}╠══════════════════════════════════════════════════════════════════════════════════╣${C.reset}`);

        // Gemini Models Section Header
        lines.push(`${C.brightMagenta}║${C.reset}   ${C.bold}${C.brightCyan}🤖 Cotas Oficiais do Antigravity (Gemini Models):${C.reset}`);

        // 1. Weekly Limit Remaining
        if (weeklyLimit.remainingPercent !== undefined) {
            lines.push(`${C.brightMagenta}║${C.reset}      ${C.bold}📅 Weekly Limit Remaining (Limite Semanal):${C.reset}`);
            lines.push(`${C.brightMagenta}║${C.reset}         [${renderProgressBar(weeklyLimit.remainingPercent, 20)}]`);
            lines.push(`${C.brightMagenta}║${C.reset}         ${C.dim}${weeklyLimit.messagePt || ''}${C.reset}`);
        }

        // 2. 5-Hour Limit Remaining
        if (fiveHourLimit.remainingPercent !== undefined) {
            lines.push(`${C.brightMagenta}║${C.reset}      ${C.bold}⏱️  Five Hour Limit Remaining (Limite de 5 Horas):${C.reset}`);
            lines.push(`${C.brightMagenta}║${C.reset}         [${renderProgressBar(fiveHourLimit.remainingPercent, 20)}]`);
            lines.push(`${C.brightMagenta}║${C.reset}         ${C.dim}${fiveHourLimit.messagePt || ''}${C.reset}`);
        }

        // Claude and GPT models section if available
        if (claudeLimits && claudeLimits.weekly && claudeLimits.fiveHour) {
            lines.push(`${C.brightMagenta}║${C.reset}   ${C.bold}${C.brightMagenta}🧠 Modelos Claude e GPT:${C.reset}`);
            lines.push(`${C.brightMagenta}║${C.reset}      Semanal: [${renderProgressBar(claudeLimits.weekly.remainingPercent, 14)}] • 5-Horas: [${renderProgressBar(claudeLimits.fiveHour.remainingPercent, 14)}]`);
        }
    }

    const refreshFormatted = lastRefreshTime.toLocaleTimeString('pt-BR');
    lines.push(`${C.brightMagenta}╠══════════════════════════════════════════════════════════════════════════════════╣${C.reset}`);
    lines.push(`${C.brightMagenta}║${C.reset}   ${C.dim}Status: OK | Cotas sincronizadas: ${refreshFormatted} | Parar: Ctrl+C${C.reset}`);
    lines.push(`${C.brightMagenta}╠══════════════════════════════════════════════════════════════════════════════════╣${C.reset}`);
    lines.push(`${C.brightMagenta}║${C.reset}   ${C.bold}${C.brightWhite}📋 HISTÓRICO DE REQUISIÇÕES EM TEMPO REAL (Últimas 10):${C.reset}`);

    // Request logs window (up to 10 lines)
    const logsWindowSize = 10;
    const logsToShow = recentLogs.slice(-logsWindowSize);

    if (logsToShow.length === 0) {
        lines.push(`${C.brightMagenta}║${C.reset}   ${C.dim}Aguardando requisições do Claude Desktop ou Claude Code CLI...${C.reset}`);
    } else {
        logsToShow.forEach(log => {
            lines.push(`${C.brightMagenta}║${C.reset}   ${log}`);
        });
    }

    // Fill remaining lines to keep the box height stable
    const remainingSlots = Math.max(0, logsWindowSize - Math.max(1, logsToShow.length));
    for (let i = 0; i < remainingSlots; i++) {
        lines.push(`${C.brightMagenta}║${C.reset}`);
    }

    lines.push(`${C.brightMagenta}╚══════════════════════════════════════════════════════════════════════════════════╝${C.reset}`);

    return lines.join('\n');
}

export default {
    C,
    renderProgressBar,
    renderArrowSelectionMenu,
    renderFixedDashboardWithLogs
};
