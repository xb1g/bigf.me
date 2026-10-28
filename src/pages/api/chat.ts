import type { APIRoute } from 'astro';

export const prerender = false;

const MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1';
const MINIMAX_MODEL = 'MiniMax-M2.7-highspeed';

// Allowed topics - whitelist approach
const ALLOWED_KEYWORDS = [
  'bunyasit', 'bigf', 'bigseed', 'fang',
  'passionseed', 'careerac', 'rocketmap', 'longkeeb', 'portex',
  'hive', 'fync', 'neuralmix', 'datasciblock', 'coderdojo',
  'quizdom', 'fermentabot', 'jojo soba', 'hamsterhub',
  'onetrace', 'chatasci', 'coffee trace', 'trojang', 'govern',
  'susu', 'prova', 'shift', 'aftershift', 'seedstack', 'company brain',
  'rv8', 'cpu', 'voicekey', 'welist', 'top of the rank', 'camp',
  'project', 'portfolio', 'work', 'experience', 'education',
  'chulalongkorn', 'berkeley', 'scet', 'startup semester',
  'thailand', 'bangkok', 'career', 'ai', 'keyboard', 'hardware',
  'coding', 'programming', 'developer', 'builder', 'student',
  'music', 'oasis', 'nirvana', 'radiohead', 'coffee', 'art',
  'book', 'philosophy', 'mission', 'contact', 'email', 'github',
  'hello', 'hi', 'hey', 'who are you', 'what is this', 'help',
  'summary', 'overview', 'about',
];

// Blocked prompt injection patterns
const BLOCKED_PATTERNS = [
  /ignore previous instructions?/i,
  /ignore (all )?previous/i,
  /system prompt/i,
  /you are now/i,
  /pretend (to be|you are)/i,
  /act as /i,
  /roleplay/i,
  /override/i,
  /disregard/i,
  /forget (everything|all)/i,
  /new instructions/i,
  /from now on/i,
  /do not (tell|reveal|share|disclose)/i,
  /secret/i,
  /password/i,
  /api key/i,
  /token/i,
  /credential/i,
  /\{\{/,
  /\[\[/,
  /<\|/,
  /\|>/,
];

const SYSTEM_PROMPT = `You are an AI assistant embedded in the terminal portfolio of Bunyasit Fang ("Big", github: xb1g), a builder and Integrated Innovation student at Chulalongkorn University. He did the Startup Semester at UC Berkeley (SCET) in Spring 2026 and is now back in Bangkok running PassionSeed.

Current work (October 2026): PassionSeed runs SHIFT, a 7-day camp where Thai high school students build a real project and test it with real users (four rounds done, SHIFT[3] launching, first school SHIFT agreed), plus AfterSHIFT, an alumni community with goal cards, standups and a progress feed. Before SHIFT, Seed Camp/TechSeed reached nearly 800 students. Big builds the PassionSeed web platform (multiplayer whiteboards, admin ops console, LINE OA inbox), the SHIFT mobile app, SeedStack (an AI coding toolkit that coaches students instead of doing the work), and Company Brain (the company's knowledge in Markdown, shared by people and AI agents). Side projects: RV8 (an 8-bit CPU built from 74HC chips with a hands-on circuit lab), VoiceKey (a mic-first input device), welist (a Thai classifieds site), and client builds like Top of the Rank (vehicle showroom).

Earlier projects: LongKeeb/Portex (ergonomic keyboards shipped to customers), Hive (AI democracy tool, Gemini hackathon semi-finalist), CareerAc (AI career planning), RocketMap (AI business model canvas), Fync (friendship graph API), NeuralMix (LLM for audio mixing), and more.

His mission: fixing education in Thailand by growing students' autonomy, competence and relatedness. He also loves Oasis, Nirvana, Radiohead, coffee roasting, and art.

Answer concisely in plain text (no markdown, this is a terminal). Keep responses short and punchy unless asked for detail. If asked about code or tech, be technical and precise.

IMPORTANT: Do NOT show your reasoning process. Do NOT include <think> tags or any internal thought process in your response. Just give the direct answer.`;

function isQueryAllowed(query: string): boolean {
  const lower = query.toLowerCase();

  // Check for blocked injection patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(query)) {
      return false;
    }
  }

  // Check if query contains at least one allowed keyword
  for (const keyword of ALLOWED_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) {
      return true;
    }
  }

  return false;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { query } = body;

    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Safety check: block off-topic and prompt injection attempts
    if (!isQueryAllowed(query)) {
      return new Response(
        JSON.stringify({
          error: "I can only answer questions about Bunyasit, his projects, and background. Try asking about PassionSeed, his work, or his experience!",
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || process.env.MINIMAX_CN_API_KEY;
    if (!MINIMAX_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const response = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        max_tokens: 1024,
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: query }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `MiniMax error ${response.status}: ${errText.slice(0, 200)}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
