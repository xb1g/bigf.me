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

export const categories: Record<string, string[]> = {
  hardware: ['longkeeb', 'portex', 'fermentabot'],
  education: ['passionseed', 'datasciblock', 'coderdojo', 'quizdom'],
  ai: ['careerac', 'rocketmap', 'neuralmix', 'hive'],
  sustainability: ['onetrace', 'chatasci', 'coffee-trace'],
  community: ['jojo-soba', 'fync', 'hamsterhub'],
  experiments: ['trojang', 'govern', 'susu', 'prova'],
};

export const projects: Record<string, Project> = {
  passionseed: {
    name: 'PassionSeed',
    category: 'education',
    tech: ['Next.js', 'Supabase', 'AI SDK'],
    year: '2024',
    description: 'Platform to grow the seed of passion for every student.',
  },
  careerac: {
    name: 'CareerAc',
    category: 'ai',
    tech: ['Next.js', 'OpenRouter', 'Vercel AI SDK'],
    year: '2025',
    description: 'Helping community college students plan their study.',
  },
  rocketmap: {
    name: 'RocketMap',
    category: 'ai',
    tech: ['Next.js', 'Claude API', 'React'],
    year: '2025',
    description: 'AI-powered business model canvas.',
  },
  portex: {
    name: 'Portex',
    category: 'hardware',
    tech: ['PCB Design', 'Fusion 360', 'Arduino'],
    year: '2024',
    description: 'Split ergonomic mechanical keyboard.',
  },
  longkeeb: {
    name: 'LongKeeb',
    category: 'hardware',
    tech: ['PCB', 'QMK Firmware', 'Hardware'],
    year: '2020',
    description: 'Custom mechanical keyboard.',
  },
  datasciblock: {
    name: 'DataSciBlock',
    category: 'education',
    tech: ['Scratch', 'Blockly', 'Data Science'],
    year: '2023',
    description: 'Scratch fork for data science.',
  },
  'jojo-soba': {
    name: 'JOJO Soba',
    category: 'community',
    tech: ['Business', 'Coffee', 'Community'],
    year: '2023',
    description: 'Coffee & soba cafe, community hub.',
  },
  fermentabot: {
    name: 'Fermentabot',
    category: 'hardware',
    tech: ['Arduino', 'Sensors', 'IoT'],
    year: '2023',
    description: 'Koji fermentation tracking bot.',
  },
  coderdojo: {
    name: 'CoderDojo Thailand',
    category: 'education',
    tech: ['Teaching', 'Community', 'Coding'],
    year: '2022',
    description: 'Teaching kids coding every Sunday.',
  },
  quizdom: {
    name: 'Quizdom',
    category: 'education',
    tech: ['React', 'Firebase', 'Quiz'],
    year: '2021',
    description: 'Quiz app for national software contest.',
  },
  neuralmix: {
    name: 'NeuralMix',
    category: 'ai',
    tech: ['LLM', 'Audio', 'AI'],
    year: '2025',
    description: 'AI LLM for audio mixing.',
  },
  hive: {
    name: 'Hive',
    category: 'ai',
    tech: ['Next.js', 'Gemini', 'Democracy'],
    year: '2025',
    description: 'Direct democracy condo management.',
  },
  onetrace: {
    name: 'OneTrace',
    category: 'sustainability',
    tech: ['Blockchain', 'Traceability', 'Supply Chain'],
    year: '2024',
    description: 'Coffee supply chain traceability.',
  },
  chatasci: {
    name: 'Chatasci',
    category: 'sustainability',
    tech: ['Data Science', 'Scraping', 'Analysis'],
    year: '2024',
    description: 'Matcha market analysis in Thailand.',
  },
  'coffee-trace': {
    name: 'Coffee Trace',
    category: 'sustainability',
    tech: ['Traceability', 'Supply Chain', 'Web'],
    year: '2024',
    description: 'Coffee traceability platform.',
  },
  fync: {
    name: 'Fync',
    category: 'community',
    tech: ['API', 'SDK', 'Friendship'],
    year: '2023',
    description: 'Stripe for friendship tracking.',
  },
  hamsterhub: {
    name: 'HamsterHub',
    category: 'community',
    tech: ['Discord', 'Bot', 'Community'],
    year: '2022',
    description: 'Tech learning community platform.',
  },
  trojang: {
    name: 'Trojang',
    category: 'experiments',
    tech: ['React Native', 'Calling', 'Social'],
    year: '2021',
    description: 'Easy phone call app with friends.',
  },
  govern: {
    name: 'Govern',
    category: 'experiments',
    tech: ['Democracy', 'Voting', 'App'],
    year: '2022',
    description: 'Direct democracy practice app.',
  },
  susu: {
    name: 'Susu',
    category: 'experiments',
    tech: ['Sports', 'Matching', 'Tinder'],
    year: '2023',
    description: 'Sports ranking tinder app.',
  },
  prova: {
    name: 'Prova',
    category: 'experiments',
    tech: ['React Native', 'Betting', 'Social'],
    year: '2024',
    description: 'Social goals betting app.',
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

  now: `bigseed@bigf.me:~$ cat about.md

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

function getAllProjects(): string[] {
  return Object.values(categories).flat();
}

function getProjectPath(projectName: string): string | null {
  for (const [category, projects_list] of Object.entries(categories)) {
    if (projects_list.includes(projectName)) {
      return `${category}/${projectName}`;
    }
  }
  return null;
}

function getCategoryFromPath(path: string): string | null {
  if (path === '~' || path === '/' || path === '') return null;
  const parts = path.split('/');
  return parts[0] || null;
}

function getProjectFromPath(path: string): string | null {
  if (path === '~' || path === '/' || path === '') return null;
  const parts = path.split('/');
  return parts[1] || null;
}

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
      
      // Home directory
      if (target === '/' || target === '~' || target === 'home') {
        return {
          output: `drwxr-xr-x  categories/
drwxr-xr-x  pages/

Use 'ls [category]' to see projects:
  hardware, education, ai, sustainability, community, experiments`,
        };
      }
      
      // Handle relative paths from current directory
      let resolvedPath = target;
      if (!target.startsWith('/') && target !== '~') {
        if (currentPath === '~') {
          resolvedPath = target;
        } else {
          resolvedPath = `${currentPath}/${target}`;
        }
      }
      
      // Category directory
      const category = resolvedPath.split('/')[0];
      if (categories[category] && !resolvedPath.includes('/')) {
        const items = categories[category].map(p => `drwxr-xr-x  ${p}/`).join('\n');
        return {
          output: `${category}/:\n${items || 'No projects in this category'}`,
        };
      }
      
      // Project directory - show project info
      const projectName = resolvedPath.split('/')[1] || resolvedPath;
      if (projects[projectName]) {
        const project = projects[projectName];
        return {
          output: `${projectName}/:
-rw-r--r--  README.md
-rw-r--r--  info.txt

Name: ${project.name}
Year: ${project.year}
Tech: ${project.tech.join(', ')}
Desc: ${project.description}

Use 'cat ${projectName}' to see full details.`,
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
      
      // Try to show project info
      if (projects[file]) {
        const project = projects[file];
        return {
          output: `# ${project.name}

**Year:** ${project.year}
**Category:** ${project.category}
**Tech Stack:** ${project.tech.join(', ')}

**Description:**
${project.description}

---
*Part of the integrated innovation ecosystem.*`,
        };
      }
      
      return {
        output: `cat: ${args[0] || ''}: No such file`,
        error: true,
      };
    }

    case 'cd': {
      const dir = args[0] || '~';
      
      // Go home
      if (dir === '~' || dir === '/' || dir === 'home') {
        return {
          output: `Changed to: ~`,
          newPath: '~',
        };
      }
      
      // Go up one level
      if (dir === '..') {
        if (currentPath === '~') {
          return {
            output: `Changed to: ~`,
            newPath: '~',
          };
        }
        const parts = currentPath.split('/');
        parts.pop();
        const newPath = parts.length === 0 ? '~' : parts.join('/');
        return {
          output: `Changed to: ${newPath}`,
          newPath,
        };
      }
      
      // Handle relative paths
      let targetDir = dir;
      if (!dir.startsWith('/') && dir !== '~') {
        if (currentPath === '~') {
          targetDir = dir;
        } else {
          targetDir = `${currentPath}/${dir}`;
        }
      }
      
      // Clean up path
      targetDir = targetDir.replace(/^\//, '').replace(/\/$/, '');
      
      // Direct category
      if (categories[targetDir] && !targetDir.includes('/')) {
        return {
          output: `Changed to: ${targetDir}/`,
          newPath: targetDir,
        };
      }
      
      // Category/Project path
      const pathParts = targetDir.split('/');
      const categoryName = pathParts[0];
      const projectName = pathParts[1];
      
      if (categories[categoryName]) {
        // Just category
        if (!projectName) {
          return {
            output: `Changed to: ${categoryName}/`,
            newPath: categoryName,
          };
        }
        
        // Category/Project
        if (categories[categoryName].includes(projectName)) {
          return {
            output: `Changed to: ${categoryName}/${projectName}/`,
            newPath: `${categoryName}/${projectName}`,
          };
        }
      }
      
      // Try to find project by name alone
      if (getProjectPath(targetDir)) {
        const fullPath = getProjectPath(targetDir);
        if (fullPath) {
          return {
            output: `Changed to: ${fullPath}/`,
            newPath: fullPath,
          };
        }
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
