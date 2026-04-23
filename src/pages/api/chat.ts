import type { APIRoute } from 'astro';

const MINIMAX_BASE_URL = 'https://api.minimaxi.com/v1';
const MINIMAX_API_KEY = import.meta.env.MINIMAX_API_KEY;
const MINIMAX_MODEL = 'MiniMax-M2.7-highspeed';

const SYSTEM_PROMPT = `You are an AI assistant embedded in the terminal portfolio of Bunyasit Fang (github: xb1g), a builder and Integrated Innovation student at Chulalongkorn University, currently on Startup Semester at UC Berkeley (SCET). 

You know about his projects: PassionSeed (AI career discovery, 300 hackathon users), CareerAc (AI career planning), RocketMap (business model canvas), LongKeeb/Portex (ergonomic keyboards shipped to customers), Hive (AI democracy tool, Gemini hackathon semi-finalist), Fync (friendship graph API), NeuralMix (LLM for audio mixing), and more.

His mission: fixing education in Thailand. He's passionate about AI + Education + Sustainability. He also loves Oasis, Nirvana, Radiohead, coffee roasting, and art.

Answer concisely in plain text (no markdown, this is a terminal). Keep responses short and punchy unless asked for detail. If asked about code or tech, be technical and precise.`;

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

    // Stream the response directly to the client
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
