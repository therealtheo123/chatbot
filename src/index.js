import { PREADDED_RESPONSES } from './preaddedResponses.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }

    if (url.pathname === '/api/code' && request.method === 'POST') {
      return handleCodeAssist(request, env);
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(HTML_PAGE, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};

async function handleChat(request, env) {
  const body = await request.json().catch(() => ({}));
  const userMessage = String(body.message ?? '').trim();
  const tokenFromUI = request.headers.get('x-openai-token')?.trim();
  const configuredToken = env.OPENAI_API_KEY?.trim();
  const token = tokenFromUI || configuredToken;

  if (!userMessage) {
    return json({ error: 'Please send a message.' }, 400);
  }

  const fallback = pickPreaddedResponse(userMessage);

  if (!token) {
    return json({
      source: 'preadded',
      reply: `${fallback} (Tip: add an OpenAI token in the UI for live AI responses.)`,
    });
  }

  try {
    const aiReply = await callOpenAI({
      token,
      prompt: userMessage,
      system: 'You are a concise and helpful AI chatbot running on Cloudflare.',
    });

    return json({ source: 'openai', reply: aiReply });
  } catch (error) {
    return json({
      source: 'preadded',
      reply: `${fallback} (OpenAI call failed, so I switched to preadded responses.)`,
      warning: String(error),
    });
  }
}

async function handleCodeAssist(request, env) {
  const body = await request.json().catch(() => ({}));
  const task = String(body.task ?? '').trim();
  const language = String(body.language ?? 'JavaScript').trim();
  const tokenFromUI = request.headers.get('x-openai-token')?.trim();
  const configuredToken = env.OPENAI_API_KEY?.trim();
  const token = tokenFromUI || configuredToken;

  if (!task) {
    return json({ error: 'Please describe the coding task.' }, 400);
  }

  if (!token) {
    return json({
      source: 'preadded',
      reply: `Code helper (offline mode): Break your ${language} task into small functions, add tests, and validate edge-cases.`,
    });
  }

  try {
    const aiReply = await callOpenAI({
      token,
      prompt: `Language: ${language}\nTask: ${task}`,
      system:
        'You are an expert coding assistant. Provide clean code, short explanation, and practical next steps.',
    });

    return json({ source: 'openai', reply: aiReply });
  } catch (error) {
    return json({
      source: 'preadded',
      reply: `Could not reach OpenAI. Suggested approach: draft pseudocode, then implement incrementally in ${language}.`,
      warning: String(error),
    });
  }
}

function pickPreaddedResponse(message) {
  const normalized = message.toLowerCase();
  const hash = Array.from(normalized).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return PREADDED_RESPONSES[hash % PREADDED_RESPONSES.length];
}

async function callOpenAI({ token, prompt, system }) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${details}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || 'No response content was returned.';
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

const HTML_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cloudflare AI Chat Bot</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: Inter, system-ui, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
    .wrap { max-width: 950px; margin: 32px auto; padding: 0 16px; display: grid; gap: 16px; }
    .card { background: #111827; border: 1px solid #334155; border-radius: 12px; padding: 16px; }
    h1, h2 { margin: 0 0 12px; }
    textarea, input, select, button { width: 100%; box-sizing: border-box; border-radius: 8px; border: 1px solid #475569; background: #0b1220; color: #e2e8f0; padding: 10px; }
    button { cursor: pointer; background: #1d4ed8; border: none; font-weight: 700; }
    button:hover { background: #2563eb; }
    .row { display: grid; gap: 12px; }
    .output { white-space: pre-wrap; background: #020617; border: 1px solid #334155; border-radius: 8px; padding: 12px; min-height: 80px; }
    .tiny { color: #94a3b8; font-size: 12px; }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="card">
      <h1>Cloudflare AI Chat Bot</h1>
      <p class="tiny">Includes 500 preadded responses + optional live OpenAI answers when you provide a token.</p>
      <label for="token">OpenAI Token (stored only in your browser localStorage)</label>
      <input id="token" type="password" placeholder="sk-..." autocomplete="off" />
    </section>

    <section class="card row">
      <h2>Chat</h2>
      <textarea id="chatInput" rows="4" placeholder="Ask me anything..."></textarea>
      <button id="chatBtn">Send Chat Message</button>
      <div id="chatOut" class="output"></div>
    </section>

    <section class="card row">
      <h2>AI Coding Helper</h2>
      <select id="lang">
        <option>JavaScript</option>
        <option>TypeScript</option>
        <option>Python</option>
        <option>Rust</option>
        <option>Go</option>
      </select>
      <textarea id="codeTask" rows="5" placeholder="Describe your coding task..."></textarea>
      <button id="codeBtn">Generate Coding Help</button>
      <div id="codeOut" class="output"></div>
    </section>
  </main>

  <script>
    const tokenEl = document.getElementById('token');
    const chatInput = document.getElementById('chatInput');
    const chatBtn = document.getElementById('chatBtn');
    const chatOut = document.getElementById('chatOut');
    const lang = document.getElementById('lang');
    const codeTask = document.getElementById('codeTask');
    const codeBtn = document.getElementById('codeBtn');
    const codeOut = document.getElementById('codeOut');

    tokenEl.value = localStorage.getItem('openai_token') || '';
    tokenEl.addEventListener('input', () => localStorage.setItem('openai_token', tokenEl.value.trim()));

    async function send(endpoint, payload, outEl) {
      outEl.textContent = 'Thinking...';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-openai-token': tokenEl.value.trim(),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        outEl.textContent = data.error || 'Request failed';
        return;
      }

      outEl.textContent = '[' + data.source + ']\n\n' + data.reply;
    }

    chatBtn.addEventListener('click', () => {
      send('/api/chat', { message: chatInput.value }, chatOut);
    });

    codeBtn.addEventListener('click', () => {
      send('/api/code', { task: codeTask.value, language: lang.value }, codeOut);
    });
  </script>
</body>
</html>`;
