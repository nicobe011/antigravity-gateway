/**
 * Terminal UI Dashboard for Antigravity Gateway
 * Renders a rich, modern console interface directly in the terminal (CMD/PowerShell)
 * Displays Weekly Limit Remaining and Five Hour Limit Remaining from official Antigravity quota API.
 * Supports provider selection: Google Antigravity & OpenCode Zen (Free Models with Reasoning Config).
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
        lines.push(`${zenPrefix}${C.bold}OPENCODE ZEN (Escolher Modelo Free & Reasoning)${C.reset}${isZenSelected ? ` ${C.brightYellow}(SELECIONADO)${C.reset}` : ''}`);
        lines.push(`        ${C.dim}↳ Nemotron 3.5, Muse Spark 1.3, Ling 3.0, LongCat 2.5, Space Bunny, MiMo-V2.6, Big Pickle${C.reset}`);
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
 * Render OpenCode Zen Model Selection Menu
 *
 * @param {Array} models - Array of OpenCode Zen free models
 * @param {number} selectedIndex - Currently selected index
 * @returns {string} Formatted menu
 */
export function renderOpenCodeZenModelMenu(models, selectedIndex = 0) {
    const lines = [];

    lines.push(`${C.brightMagenta}╔══════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
    lines.push(`${C.brightMagenta}║${C.reset}       ${C.bold}${C.brightWhite}🌐 SELEÇÃO DE MODELO GRATUITO - OPENCODE ZEN${C.reset}                              ${C.brightMagenta}║${C.reset}`);
    lines.push(`${C.brightMagenta}║${C.reset}       ${C.cyan}Escolha qual modelo você quer usar nesta sessão do OpenCode Zen${C.reset}            ${C.brightMagenta}║${C.reset}`);
    lines.push(`${C.brightMagenta}╚══════════════════════════════════════════════════════════════════════════════════╝${C.reset}`);
    lines.push('');

    models.forEach((m, idx) => {
        const isSelected = selectedIndex === idx;
        const prefix = isSelected ? `${C.brightGreen}${C.bold} ► [${idx + 1}] ` : `   [${idx + 1}] `;
        const visionTag = m.supportsImages ? `${C.brightGreen}[Suporta Visão/Imagem]${C.reset}` : `${C.dim}[Texto puro]${C.reset}`;
        const thinkTag = m.supportsThinking
            ? (m.reasoningType === 'effort' ? `${C.brightYellow}[Raciocínio Configurável]${C.reset}` : `${C.yellow}[Raciocínio Ativo]${C.reset}`)
            : `${C.dim}[Sem Raciocínio]${C.reset}`;

        lines.push(`${prefix}${C.bold}${m.displayName}${C.reset} ${visionTag} ${thinkTag}`);
        lines.push(`        ${C.dim}Janela de Contexto: ${Math.round(m.contextWindow / 1024)}k tokens | Saída: ${Math.round(m.maxTokens / 1024)}k tokens${C.reset}`);
    });

    lines.push('');
    lines.push(`${C.dim}──────────────────────────────────────────────────────────────────────────────────${C.reset}`);
    lines.push(`  ${C.dim}Use ${C.bold}↑/↓${C.reset}${C.dim} para navegar e ${C.bold}ENTER${C.reset}${C.dim} para confirmar o modelo, ou digite o número ${C.bold}[1..${models.length}]${C.reset}${C.dim}.${C.reset}`);

    return lines.join('\n');
}

/**
 * Render Reasoning / Thinking Configuration Menu for OpenCode Zen
 *
 * @param {Object} model - Selected OpenCode Zen model
 * @param {number} selectedIndex - Currently selected index
 * @param {Array} options - List of reasoning options
 * @returns {string} Formatted menu
 */
export function renderOpenCodeZenReasoningMenu(model, selectedIndex = 0, options = []) {
    const lines = [];

    lines.push(`${C.brightMagenta}╔══════════════════════════════════════════════════════════════════════════════════╗${C.reset}`);
    lines.push(`${C.brightMagenta}║${C.reset}       ${C.bold}${C.brightWhite}🧠 CONFIGURAÇÃO DE RACIOCÍNIO (THINKING) - ${model.displayName.toUpperCase().slice(0, 20)}${C.reset}   ${C.brightMagenta}║${C.reset}`);
    lines.push(`${C.brightMagenta}║${C.reset}       ${C.cyan}Defina o nível de pensamento desejado para este modelo${C.reset}                     ${C.brightMagenta}║${C.reset}`);
    lines.push(`${C.brightMagenta}╚══════════════════════════════════════════════════════════════════════════════════╝${C.reset}`);
    lines.push('');

    options.forEach((opt, idx) => {
        const isSelected = selectedIndex === idx;
        const prefix = isSelected ? `${C.brightGreen}${C.bold} ► [${idx + 1}] ` : `   [${idx + 1}] `;
        lines.push(`${prefix}${C.bold}${opt.label}${C.reset}`);
        lines.push(`        ${C.dim}↳ ${opt.description}${C.reset}`);
    });

    lines.push('');
    lines.push(`${C.dim}──────────────────────────────────────────────────────────────────────────────────${C.reset}`);
    lines.push(`  ${C.dim}Use ${C.bold}↑/↓${C.reset}${C.dim} e ${C.bold}ENTER${C.reset}${C.dim} para confirmar, ou digite o número ${C.bold}[1..${options.length}]${C.reset}${C.dim}.${C.reset}`);

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
        zenModelName = null,
        zenReasoning = null,
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
        const reasoningDisplay = zenReasoning === 'disabled'
            ? `${C.red}Desativado (Zero Pensamentos)${C.reset}`
            : (zenReasoning ? `${C.brightYellow}${zenReasoning}${C.reset}` : `${C.dim}Padrão${C.reset}`);

        lines.push(`${C.brightMagenta}║${C.reset}   Provedor Ativo: ${C.brightGreen}🌐 OpenCode Zen (Modelos Gratuitos Oficiais)${C.reset}`);
        lines.push(`${C.brightMagenta}║${C.reset}   Modelo Escolhido: ${C.brightWhite}⭐ ${zenModelName || 'Nemotron 3.5 Lightning Free'}${C.reset}`);
        lines.push(`${C.brightMagenta}║${C.reset}   Modo de Raciocínio (Thinking): ${reasoningDisplay}`);
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
    lines.push(`${C.brightMagenta}║${C.reset}   ${C.dim}Status: OK | Sincronizado: ${refreshFormatted} | Para trocar de conta/provedor: Ctrl+C e npm start${C.reset}`);
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
    renderOpenCodeZenModelMenu,
    renderOpenCodeZenReasoningMenu,
    renderFixedDashboardWithLogs
};
