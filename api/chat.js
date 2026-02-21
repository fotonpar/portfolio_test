/**
 * Vercel Serverless Function: AI Chat for portfolio (MiniMax API).
 * Env: MINIMAX_API_KEY (required).
 */

const KNOWLEDGE = `
О себе (Миша Кремень):
Frontend / Fullstack разработчик. Создаю быстрые и аккуратные интерфейсы с фокусом на UX, понятную архитектуру и поддержку проекта в долгую.
Занимается веб-разработкой, любит превращать идеи в понятные цифровые продукты. Важны чистый код, предсказуемое поведение интерфейсов и внимание к деталям.
В работе ценит баланс между скоростью и качеством: сначала проектирует структуру, затем внедряет функциональность итерациями и регулярно проверяет пользовательский сценарий целиком.
Открыт к проектам, где нужно не только написать код, но и предложить решение, удобное для масштабирования и поддержки.

Услуги:
1) Разработка продукта — лендинги, кабинеты, SaaS-интерфейсы, интеграции с API.
2) Консультации — аудит архитектуры, roadmap по рефакторингу, performance review.
3) Код-ревью и менторство — сессии 1:1, помощь в росте middle/senior разработчиков и команд.

Примеры проектов:
- FinFlow Dashboard: панель аналитики для малого бизнеса, графики, фильтры и сценарии «what-if», фокус на скорость и удобство.
- Pulse Habits App: личный трекер привычек с геймификацией, офлайн-режимом и синхронизацией между устройствами.
- Neon Commerce UI: UI-kit и витрина для e-commerce, reusable-компоненты, адаптив и продуманная дизайн-система.

Опыт работы:
- Senior Frontend Engineer, NovaDigital (2024 — настоящее время): клиентская платформа, архитектура компонентов, производительность, UI-стандарты. Сократил время загрузки ключевых страниц на 32%.
- Fullstack Developer, BrightCore (2022 — 2024): личный кабинет и аналитический модуль. Настроил CI/CD, сократил регрессии в релизах на 40%.
- Frontend Developer, PixelWave (2020 — 2022): адаптивные интерфейсы и дизайн-система для B2B SaaS, переход на TypeScript и component-driven подход.

Контакты (для связи с Мишей):
- Email: your.email@example.com
- Telegram: @your_username
- GitHub: your_username (https://github.com/your_username)
- LinkedIn: your_username (https://www.linkedin.com/in/your_username)
На сайте есть раздел «Контакты» (якорь #contacts) с ссылками для связи.
`;

const SYSTEM_PROMPT = `Ты помощник по портфолио Миши Кременя (Frontend/Fullstack разработчик). Отвечай только на основе приведённой ниже информации.
Правила:
- Не придумывай услуги, цены и факты. Если чего-то нет в описании — скажи «Этого нет в описании» и предложи написать Мише напрямую.
- Отвечай кратко и по делу.
- Если пользователь хочет связаться, заказать услугу или обсудить проект — кратко перечисли контакты (Email, Telegram, GitHub, LinkedIn) и предложи перейти к разделу «Контакты» на сайте (ссылка с якорем #contacts).

Данные портфолио:
${KNOWLEDGE}`;

async function callMiniMax(apiKey, userMessage) {
  // Anthropic-compatible endpoint: works with Coding Plan subscription (MiniMax-M2.5)
  const res = await fetch('https://api.minimax.io/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'MiniMax-M2.5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: [{ type: 'text', text: userMessage }] },
      ],
      temperature: 0.7,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    const errMsg = data?.error?.message || data?.base_resp?.status_msg || res.statusText;
    throw new Error(errMsg || 'MiniMax API error');
  }

  const statusCode = data?.base_resp?.status_code;
  const statusMsg = (data?.base_resp?.status_msg || data?.error?.message || '').toLowerCase();
  if (statusCode !== undefined && statusCode !== 0) {
    if (statusCode === 1008 || statusMsg.includes('insufficient balance') || statusMsg.includes('balance')) {
      throw new Error('Чат временно недоступен. Пополните баланс в личном кабинете MiniMax (platform.minimax.io).');
    }
    const errMsg = data?.base_resp?.status_msg || data?.error?.message || `Ошибка API (код ${statusCode})`;
    throw new Error(errMsg);
  }

  const content = extractContent(data);
  if (typeof content === 'string') {
    if (content.trim()) return content;
    return 'Ответ пуст (возможна фильтрация контента). Попробуйте переформулировать.';
  }
  console.log('MiniMax parse failed: topKeys=', data ? Object.keys(data).join(',') : 'null');
  throw new Error(data?.base_resp?.status_msg || data?.error?.message || 'Empty response from MiniMax');
}

function extractContent(data) {
  const choice = data?.choices?.[0];
  let text = choice?.message?.content ?? choice?.delta?.content;
  if (typeof text === 'string') return text;
  if (Array.isArray(choice?.message?.content)) {
    const block = choice.message.content.find((b) => b?.type === 'text' && b?.text);
    if (block) return block.text;
  }
  if (Array.isArray(data?.content)) {
    const block = data.content.find((b) => b?.type === 'text' && b?.text);
    if (block) return block.text;
  }
  if (typeof data?.reply_content === 'string') return data.reply_content;
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = (process.env.MINIMAX_API_KEY || '').trim();
  if (!apiKey) {
    return res.status(503).json({
      error: 'Чат временно недоступен. В Vercel: Project → Settings → Environment Variables задайте MINIMAX_API_KEY для Production и сделайте повторный деплой (Redeploy).',
      reason: 'NO_API_KEY'
    });
  }

  const message = req.body?.message;
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Нет сообщения' });
  }

  try {
    const response = await callMiniMax(apiKey, message.trim());
    return res.status(200).json({ response });
  } catch (err) {
    console.error('Chat API error:', err.message);
    return res.status(500).json({ error: err.message || 'Ошибка запроса' });
  }
}
