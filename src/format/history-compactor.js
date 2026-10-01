/**
 * History Compactor for Antigravity Gateway
 *
 * Provides native conversation compaction and summarization when switching
 * between models with different context windows (e.g. from Gemini 1M to OpenCode Zen 200K).
 *
 * Compresses older conversation turns into a high-density, structured summary
 * while preserving the most recent turns and all active tool contexts verbatim.
 */

import { estimateTokenCount } from '../model-mapper.js';
import { logger } from '../utils/logger.js';

/**
 * Compact conversation history to fit within a target token budget.
 *
 * Strategy:
 * 1. Calculate estimated tokens of the whole request.
 * 2. If it fits within safety threshold (e.g. 75% of context window), return untouched.
 * 3. If exceeding, keep system prompt + first user message + last N active turns intact.
 * 4. Condense middle turns into a structured <conversation_summary> block.
 *
 * @param {Object} anthropicRequest - Request with messages and system prompt
 * @param {number} maxContextTokens - Context window limit of the target model
 * @returns {Object} Request with compacted message history
 */
export function compactHistoryIfNeeded(anthropicRequest, maxContextTokens = 200000) {
    if (!anthropicRequest.messages || anthropicRequest.messages.length <= 4) {
        return anthropicRequest;
    }

    const estimatedTokens = estimateTokenCount(anthropicRequest);
    const safetyThreshold = Math.floor(maxContextTokens * 0.75);

    if (estimatedTokens <= safetyThreshold) {
        return anthropicRequest;
    }

    logger.info(`[HistoryCompactor] Histórico longo detectado (~${estimatedTokens} tokens). Compactando para limite de ${maxContextTokens} tokens do modelo...`);

    const messages = [...anthropicRequest.messages];
    const RECENT_TURNS_TO_KEEP = 6; // Keep the last 6 turns verbatim

    if (messages.length <= RECENT_TURNS_TO_KEEP + 2) {
        return anthropicRequest;
    }

    const firstUserMsg = messages[0];
    const turnsToSummarize = messages.slice(1, messages.length - RECENT_TURNS_TO_KEEP);
    const recentTurns = messages.slice(messages.length - RECENT_TURNS_TO_KEEP);

    // Extract key facts and accomplishments from turns to summarize
    const summaryLines = [];
    summaryLines.push('## Resumo Consolidado do Contexto Anterior:');

    let turnIndex = 1;
    for (const msg of turnsToSummarize) {
        const role = msg.role === 'assistant' ? 'Assistente' : 'Usuário';
        let textContent = '';

        if (typeof msg.content === 'string') {
            textContent = msg.content;
        } else if (Array.isArray(msg.content)) {
            const texts = msg.content
                .filter(b => b.type === 'text' && b.text)
                .map(b => b.text)
                .join(' ');
            const tools = msg.content
                .filter(b => b.type === 'tool_use')
                .map(b => `[Ferramenta chamada: ${b.name}]`)
                .join(' ');
            const toolResults = msg.content
                .filter(b => b.type === 'tool_result')
                .map(b => `[Resultado da ferramenta: ${typeof b.content === 'string' ? b.content.slice(0, 150) : 'sucesso'}]`)
                .join(' ');

            textContent = [texts, tools, toolResults].filter(Boolean).join(' ');
        }

        if (textContent.trim()) {
            const snippet = textContent.trim().slice(0, 300).replace(/\s+/g, ' ');
            summaryLines.push(`- Turno ${turnIndex} (${role}): ${snippet}${textContent.length > 300 ? '...' : ''}`);
            turnIndex++;
        }
    }

    const summaryBlock = {
        role: 'user',
        content: `[CONTEXTO COMPACTADO AUTOMATICAMENTE PELO GATEWAY]\n\n${summaryLines.join('\n')}\n\n[FIM DO RESUMO - CONTINUAÇÃO DIRETA DA CONVERSA ABAIXO]`
    };

    const assistantAck = {
        role: 'assistant',
        content: 'Entendido. Tenho o contexto completo resumido acima e darei prosseguimento à tarefa normalmente.'
    };

    const compactedMessages = [
        firstUserMsg,
        summaryBlock,
        assistantAck,
        ...recentTurns
    ];

    return {
        ...anthropicRequest,
        messages: compactedMessages
    };
}
