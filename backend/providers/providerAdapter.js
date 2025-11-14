/*
 Provider adapter scaffold:
 - Supports 'openai' (already used)
 - Placeholder adapters for 'anthropic' and 'gemini'
 - chooseProvider(task) returns provider name; invoke(provider, params) routes call
*/
export function chooseProvider(task) {
  const p = process.env.PREFERRED_PROVIDER || 'openai';
  // Simple task-based routing: code -> openai, chat -> openai, research -> openai by default
  return p;
}

export async function invokeProvider(provider, method, params) {
  // For now, only openai is implemented in server.js; this is a placeholder for multi-provider routing.
  if (provider === 'openai') {
    // server code will call OpenAI directly; return null here as a signal to use existing client
    return null;
  } else if (provider === 'anthropic') {
    // placeholder: integrate Anthropic SDK here
    throw new Error('Anthropic adapter not implemented');
  } else if (provider === 'gemini') {
    throw new Error('Gemini adapter not implemented');
  } else {
    throw new Error('Unknown provider');
  }
}
