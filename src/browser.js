/**
 * Wallapop Browser Actions
 * For operations that require authentication (messaging).
 * Uses OpenClaw browser relay (Chrome profile).
 *
 * This module is designed to be called by an agent via the API server,
 * which then uses OpenClaw's browser tool internally.
 *
 * For now, we provide the URL and instructions — the agent uses its
 * own browser tool to execute. This file documents the exact steps.
 */

/**
 * Build the full messaging flow data for an agent.
 *
 * @param {object} opts
 * @param {string} opts.itemHash - Internal Wallapop item hash (from getItemHash)
 * @param {string} opts.message - Message to send
 * @returns {object} Instructions for the agent's browser tool
 */
export function buildChatInstructions({ itemHash, message }) {
  return {
    chatUrl: `https://es.wallapop.com/app/chat?itemId=${itemHash}`,
    message,
    steps: [
      {
        action: 'navigate',
        url: `https://es.wallapop.com/app/chat?itemId=${itemHash}`,
        note: 'Opens chat thread with seller for this item',
      },
      {
        action: 'snapshot',
        note: 'Wait for page load, find textbox "Escribe un mensaje..."',
      },
      {
        action: 'click',
        selector: 'textbox "Escribe un mensaje..."',
        note: 'Focus the message input',
      },
      {
        action: 'type',
        text: message,
        submit: true,
        note: 'Type message and press Enter to send',
      },
      {
        action: 'snapshot',
        note: 'Verify message appears in chat with timestamp',
      },
    ],
  };
}

/**
 * Extract item hash from a Wallapop item page using browser's __NEXT_DATA__.
 * Use this when the API/scraping approach doesn't work.
 *
 * @param {string} itemUrl - Full Wallapop item URL
 * @returns {object} Browser evaluate instruction
 */
export function buildHashExtractInstruction(itemUrl) {
  return {
    navigateTo: itemUrl,
    evaluate: 'window.__NEXT_DATA__?.props?.pageProps?.item?.id',
    note: 'Returns the internal hash ID needed for chat URLs',
  };
}
