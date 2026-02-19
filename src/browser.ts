import type { ChatStep, ChatInstructions } from './types.js';

/**
 * Build browser automation instructions for sending a Wallapop chat message.
 * The agent executes these steps using its browser tool.
 */
export function buildChatInstructions(itemHash: string, message: string): ChatInstructions {
  const chatUrl = `https://es.wallapop.com/app/chat?itemId=${itemHash}`;

  const steps: ChatStep[] = [
    {
      action: 'navigate',
      url: chatUrl,
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
  ];

  return { hash: itemHash, chatUrl, message, steps };
}
