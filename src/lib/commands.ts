export interface CommandResult {
  output: string;
  error?: boolean;
  html?: boolean;
  newPath?: string;
}

export interface Project {
  name: string;
  category: string;
  tech: string[];
  year: string;
  description: string;
}

const categories: Record<string, string[]> = {
  hardware: ['longkeeb', 'portex', 'fermentabot'],
  education: ['passionseed', 'datasciblock', 'coderdojo', 'quizdom'],
  ai: ['careerac', 'rocketmap', 'neuralmix', 'hive'],
  sustainability: ['onetrace', 'chatasci', 'coffee-trace'],
  community: ['jojo-soba', 'fync', 'hamsterhub'],
  experiments: ['trojang', 'govern', 'susu', 'prova'],
};

const projects: Record<string, Project> = {
  passionseed: {
    name: 'PassionSeed',
    category: 'education',
    tech: ['Next.js', 'Supabase', 'AI SDK'],
    year: '2024',
    description: 'Platform to grow the seed of passion for every student. Tackling the gap between Thailand tech and government reach.',
  },
  careerac: {
    name: 'CareerAc',
    category: 'ai',
    tech: ['Next.js', 'OpenRouter', 'Vercel AI SDK'],
    year: '2025',
    description: 'Helping community college students plan their study and transfer/job better.',
  },
  rocketmap: {
    name: 'RocketMap',
    category: 'ai',
    tech: ['Next.js', 'Claude API', 'React'],
    year: '2025',
    description: 'AI-powered business model canvas that helps figure out hypothesis and how to test them.',
  },
  portex: {
    name: 'Portex',
    category: 'hardware',
    tech: ['PCB Design', 'Fusion 360', 'Arduino'],
    year: '2024',
    description: 'Split ergonomic wearable mechanical keyboard. CityU HK TECH 300 finalist.',
  },
  longkeeb: {
    name: 'LongKeeb',
    category: 'hardware',
    tech: ['PCB', 'QMK Firmware', 'Hardware'],
    year: '2020',
    description: 'Custom mechanical keyboard built during COVID, sold to friends.',
  },
  datasciblock: {
    name: 'DataSciBlock',
    category: 'education',
    tech: ['Scratch', 'Blockly', 'Data Science'],
    year: '2023',
    description: 'Scratch fork for data science. Making DS easy to reach for high school students.',
  },
  jojo: {
    name: 'JOJO Soba',
    category: 'community',
    tech: ['Business', 'Coffee', 'Community'],
    year: '2023',
    description: 'Coffee & soba cafe, community hub. Learned barista skills, supply chain, operations.',
  },
};

const pages: Record<string, string> = {
  about: `bigseed@bigf.me:~$ cat about.md

# Big Seed

Web Developer | Builder | Integrated Innovation

I'm passionate about technology solutions that actually work.

## Contact
- Email: your.big@passionseed.com
- Passion Seed: passionseed.org

## Journey
- High school: Competitive programming, Arduino projects
- COVID: Built mechanical keyboards (LongKeeb), sold to friends
- University: Chulalongkorn, Integrated Innovation (tech + business)
- 30+ projects spanning hardware, education, AI, sustainability
- Berkeley SCET Startup Semester exchange

## Currently
- Building tools at the intersection of AI and education
- Exploring direct democracy systems
- Deep into coffee and fermentation

## Music
Oasis, Nirvana, Radiohead, The Beatles, Pink Floyd`,

  books: `bigseed@bigf.me:~$ cat books.md

# Books I've Read

## Building & Startup
- Zero to One (Thiel) - Monopoly thinking, definite optimism
- Lean Startup (Ries) - Build-measure-learn loops
- Business Model Generation - Visualizing business models
- The Founders (PayPal Mafia) - Startup ecosystem dynamics

## Productivity & Work
- Deep Work (Cal Newport) - Focused work in distracted world
- Digital Minimalism (Cal Newport) - Intentional technology use
- The Art of Learning (Josh Waitzkin) - Mastery process

## Biography & Vision
- Steve Jobs (Isaacson) - Product obsession, design thinking
- Elon Musk - First principles, multi-planetary vision

## Fiction & Philosophy
- Brave New World (Huxley) - Technology and control
- White Nights (Dostoevsky) - Dreams vs reality
- Hitchhiker's Guide to the Galaxy - Don't panic`,

  philosophy: `bigseed@bigf.me:~$ cat philosophy.md

# Integrated Innovation

My philosophy: Technology + Business + Philosophy = Real Impact

## The Problem
Most tech projects fail because they're missing one leg:
- Pure tech: Cool but unsustainable
- Pure business: Extractive, no soul
- Pure philosophy: Unrealized potential

## My Approach
1. **Start with the problem** - Real pain, real people
2. **Apply tech** - What's now possible that wasn't before?
3. **Design business model** - Sustainable, not just profitable
4. **Root in philosophy** - Why does this matter? What changes?

## Influences
- Cal Newport: Deep work, minimalism, craftsmanship
- Zero to One: Definite optimism, monopoly thinking
- Buddhist economics: Enough vs more

## What I Build
Tools that help people:
- Learn better (PassionSeed, DataSciBlock)
- Work better (CareerAc, RocketMap)
- Connect better (Fync, HamsterHub)
- Understand systems (Coffee traceability, Direct democracy)`,

  now: `bigseed@bigf.me:~$ cat now.md

# What I'm Working On Now

## April 2026
- **bigf.me** - Building this terminal portfolio
- **CareerAc** - AI-powered transfer planning tool
- **RocketMap** - Business hypothesis testing platform

## Recent Highlights
- Berkeley SCET Startup Semester completed
- Hive project: Direct democracy condo management (Gemini hackathon semi-finalist)
- NeuralMix: LLM for mixing (Technology Entrepreneurship class)

## Learning
- Supply chain traceability (OneTrace/Flowit)
- Coffee roasting and fermentation
- Direct democracy systems design

## Reading
- The Body Keeps the Score (trauma/healing)
- Re-reading Deep Work (focus in AI age)`,
};

export function executeCommand(input: string, currentPath: string): CommandResult {
  const parts = input.trim().split(' ');
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (command) {
    case 'help':
      return {
        output: `Available commands:
  whoami     - Show identity information
  ls         - List projects by category
  cat        - Display content pages (about, books, philosophy, now)
  cd         - Navigate to project directory
  clear      - Clear terminal
  help       - Show this help message`,
      };

    case 'whoami':
      return {
        output: `bigseed
Web Developer | Builder | Integrated Innovation
Based: Bangkok / Berkeley
Passion Seed: passionseed.org
Email: your.big@passionseed.com`,
      };

    case 'ls': {
      const target = args[0] || currentPath;
      
      if (target === '/' || target === '~' || target === 'home') {
        return {
          output: `drwxr-xr-x  categories/
drwxr-xr-x  pages/

Use 'ls [category]' to see projects:
  hardware, education, ai, sustainability, community, experiments`,
        };
      }
      
      const category = target.replace('/', '').replace('~', '');
      if (categories[category]) {
        const items = categories[category].map(p => `drwxr-xr-x  ${p}/`).join('\n');
        return {
          output: `${category}/:\n${items || 'No projects in this category'}`,
        };
      }
      
      return {
        output: `ls: ${target}: No such directory`,
        error: true,
      };
    }

    case 'cat': {
      const file = args[0]?.replace('.md', '') || '';
      
      if (pages[file]) {
        return { output: pages[file] };
      }
      
      return {
        output: `cat: ${args[0] || ''}: No such file`,
        error: true,
      };
    }

    case 'cd': {
      const dir = args[0] || '~';
      
      if (dir === '~' || dir === '/' || dir === 'home') {
        return {
          output: `Changed to: ~`,
          newPath: '~',
        };
      }
      
      const targetDir = dir.replace('/', '').replace('~', '');
      
      if (categories[targetDir]) {
        return {
          output: `Changed to: ${targetDir}/`,
          newPath: targetDir,
        };
      }
      
      return {
        output: `cd: ${dir}: No such directory`,
        error: true,
      };
    }

    case 'clear':
      return {
        output: '__CLEAR__',
      };

    case '':
      return { output: '' };

    default:
      return {
        output: `${command}: command not found. Type 'help' for available commands.`,
        error: true,
      };
  }
}
