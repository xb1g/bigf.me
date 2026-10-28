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
  education: ['shift', 'passionseed', 'seedstack', 'passionseed-app', 'datasciblock', 'coderdojo', 'quizdom'],
  hardware: ['rv8', 'voicekey', 'longkeeb', 'portex', 'fermentabot'],
  ai: ['company-brain', 'rocketmap', 'careerac', 'neuralmix', 'hive'],
  client: ['topoftherank'],
  sustainability: ['onetrace', 'chatasci', 'coffee-trace'],
  community: ['welist', 'jojo-soba', 'fync', 'hamsterhub'],
  experiments: ['trojang', 'govern', 'susu', 'prova'],
};

export const projects: Record<string, Project> = {
  shift: {
    name: 'SHIFT',
    category: 'education',
    tech: ['Next.js', 'Supabase', 'Discord', 'LINE OA', 'Expo'],
    year: '2026',
    description: 'PassionSeed\'s main program: a 7-day camp where Thai high schoolers (solo or teams of 1-3) build a real project and test it with real users. We don\'t hand out ideas or over-teach, so students own the work. Built the whole stack around it: apply + PromptPay flow, staff tracker, attendance and day plans, certificates, feedback forms, Discord roles and reminders, and AfterSHIFT, an alumni board with goal cards, standups, help-when-stuck and a progress feed. Four rounds run so far (beta, 0, 1, 2), SHIFT[3] launching, first school SHIFT agreed.',
  },
  passionseed: {
    name: 'PassionSeed',
    category: 'education',
    tech: ['Next.js', 'Supabase', 'AI SDK', 'Expo', 'Deno'],
    year: '2025-now',
    description: 'Ed-tech company helping Thai students find purpose through hands-on camps. Started with Seed Camp/TechSeed (nearly 800 students), then pivoted to SHIFT with a clearer goal: grow autonomy, competence and relatedness (Self-Determination Theory). The web platform covers PathLab career exploration, learning maps, multiplayer whiteboards with history and a calendar widget, an admin ops console with live queues and a Cmd+K palette, a LINE OA inbox, an Instagram/Meta DM funnel, SEO/AEO infrastructure and a full security pass on RLS and API routes.',
  },
  seedstack: {
    name: 'SeedStack',
    category: 'education',
    tech: ['OpenCode', 'Claude Code', 'Codex', 'Shell'],
    year: '2026',
    description: 'AI coding toolkit for SHIFT students that refuses to do the thinking for them. One-line install on Mac/Windows, then commands that lock scope with questions, coach research with real people, sort feedback into did / story / opinion, and guide a build one step at a time in a second session. Works in OpenCode, Claude Code and Codex.',
  },
  'passionseed-app': {
    name: 'PassionSeed Mobile',
    category: 'education',
    tech: ['Expo', 'React Native', 'Supabase', 'Skia'],
    year: '2025-now',
    description: 'Native companion app, now rebuilt SHIFT-first (v1.4, TestFlight): home, 9-step SHIFT rounds, day plans, push notifications and a keycap-inspired depth design system. Earlier versions shipped PathLab daily tasks, reflections, a hackathon program with inbox/comments/webtoon, a career radar, iOS widgets and a TCAS planner via EAS to iOS and Android.',
  },
  careerac: {
    name: 'CareerAc',
    category: 'ai',
    tech: ['Next.js', 'OpenRouter', 'Vercel AI SDK'],
    year: '2025',
    description: 'AI career planning for underserved students. Built at Berkeley Challenge Lab - designing startups to transform society.',
  },
  rocketmap: {
    name: 'RocketMap',
    category: 'ai',
    tech: ['Next.js', 'Claude API', 'Appwrite'],
    year: '2025-2026',
    description: 'AI-powered business model canvas. Deep-dives on each block, an investment-case module that forces one real demand test, encrypted bring-your-own model keys, and an AI verdict tuned to avoid venture-scale bias.',
  },
  'company-brain': {
    name: 'Company Brain',
    category: 'ai',
    tech: ['Markdown', 'Agent Skills', 'GitHub Actions'],
    year: '2026',
    description: 'PassionSeed\'s single source of truth as plain Markdown that people and AI agents both read and edit through pull requests. Sourced numbers with as-of dates, a decision log, business model canvases, SDT research, and an agent skill that checks work against the brain before finishing. Product changes sync in automatically from the web repo.',
  },
  rv8: {
    name: 'RV8',
    category: 'hardware',
    tech: ['74HC Logic', 'KiCad', 'Verilog', 'Python', 'MCP'],
    year: '2026',
    description: 'A family of 8-bit RISC-V-style CPUs built from 74HC chips that run BASIC and games. Wrote a circuit runtime so all 23 student lab circuits pass automated tests, a CLI trace viewer, an MCP server so AI can drive the board, and a hands-on web lab where beginners wire, predict and test circuits from an empty board.',
  },
  voicekey: {
    name: 'VoiceKey',
    category: 'hardware',
    tech: ['ESP32-S3', 'BLE', 'macOS', 'PCB Design'],
    year: '2026',
    description: 'Mic-first input device for the AI era: speak to type, pick the target device, rewrite text by voice, press Enter. Ran a blind design shootout between independent AI designers and judges, then specced the winner (a pocket BLE fob) down to the parts list, protocol and Mac prototype.',
  },
  topoftherank: {
    name: 'Top of the Rank',
    category: 'client',
    tech: ['Astro', 'TypeScript', 'Responsive Web'],
    year: '2026',
    description: 'Client build: luxury vehicle showroom with a drag-to-spin 360 viewer, backed by inventory, photo management and customer inquiry tools. See the demo at bigf.me/topoftherank.',
  },
  welist: {
    name: 'welist',
    category: 'community',
    tech: ['Next.js', 'Drizzle', 'libSQL', 'LINE Login'],
    year: '2026',
    description: 'Craigslist for Thailand: post in one minute, contact sellers on LINE, browse by province and district, with scam reports and an admin review queue built in.',
  },
  portex: {
    name: 'Portex',
    category: 'hardware',
    tech: ['PCB Design', 'Fusion 360', 'Arduino'],
    year: '2024',
    description: 'Split ergonomic mechanical keyboard.',
  },
  longkeeb: {
    name: 'LongKeeb/Portex',
    category: 'hardware',
    tech: ['PCB Design', 'Fusion 360', 'QMK'],
    year: '2020-2024',
    description: 'Designed and shipped consumer hardware products (Cantor42, Charybdis, Portex) to paying customers. End-to-end from design → manufacturing → delivery.',
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
    tech: ['API', 'SDK', 'Graph Analysis'],
    year: '2023',
    description: 'Friendship graph API modeling human connection strength and social dynamics at scale. Early infrastructure for quantifying relationships.',
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

# Bunyasit Fang

## Web Developer | Builder | Integrated Innovation student

I'm passionate about technology solutions that actually work and have a human soul.

## Contact
- **Email:** bunyasit@passionseed.org
- **Passion Seed:** [passionseed.org](https://passionseed.org)
- **GitHub:** [xb1g](https://github.com/xb1g)

## Journey
- **High school:** Competitive programming, Arduino projects, and early hacking.
- **COVID (2020-2024):** Founded LongKeeb/Portex. Designed split ergonomic mechanical keyboards (Cantor42, Charybdis) and shipped them globally.
- **University:** Chulalongkorn University, BAScii (Integrated Innovation). Tech + Business + Design.
- **30+ Projects:** Spanning hardware, education, AI, and sustainability.
- **Berkeley SCET:** Startup Semester exchange in SF/Berkeley (Spring 2026). 🐻
- **Back in Bangkok:** Running PassionSeed full time.

## Currently
- Running **SHIFT** at PassionSeed — 7-day camps where Thai students build a real project and test it with real users. I build the platform, the app and the ops tools behind it.
- Building **SeedStack**, an AI coding toolkit that coaches students instead of doing the work for them.
- Teaching how computers work with **RV8**, an 8-bit CPU built from logic chips.
- Taking on selected client builds — see [/work](/work).

## Music
Oasis, Nirvana, Radiohead`,

  books: `bigseed@bigf.me:~$ cat books.md

# Books I've Read

## Building & Startup
- Zero to One (Thiel) - Find the secret and monopolize it. Monopoly thinking, definite optimism.
- Lean Startup (Ries) - Build measure learn. And just repeat, focus on talking to customers.
- Business Model Generation - Taught me an easy way to plan a business since grade 9.
- The Founders (PayPal Mafia) - Sees how crazy the people really are, behind the scene of the backbones of Silicon Valley.
- Start with Why (Sinek) - Find your why: why, why, why...

## Technology & Design
- Philosophy of Software Design (Ousterhout) - Deep modules...
- The Next Renaissance - AI is here to change the way people live. We don't work to survive anymore, I'm optimistic it could thrive us. In a personal growth revolution...

## Productivity & Work
- Deep Work (Cal Newport) - It is rare, it is precious, the only kind of work that is useful.
- Digital Minimalism (Cal Newport) - After I dropped my phone in a dam, it made me see how addicted to that little brick I am. And how much has new technology changed the way people live? Not for the good, but just farming the attention span... makes me see how time shouldn't only be used in working or in just fun, but actually have some leisure that is really good.
- The Art of Learning (Josh Waitzkin) - Learning is transferrable, I love learning, you focus, you are in the zone, it's really rare.
- Peak (Anders Ericsson) - Deliberate practice grows you.

## Psychology & Healing
- The Shadow (Carl Jung summarized) - To be complete you need to integrate your shadow. Own it, find a way to deal with it, or else you're just gonna break.
- The Body Keeps the Score (Bessel van der Kolk) - Trauma is not rare, it is hard to solve, but solvable with good practices.

## Biography & Vision
- Steve Jobs (Isaacson) - Product obsession, design thinking
- Elon Musk - First principles, multi-planetary vision

## Fiction & Philosophy
- Brave New World (Huxley) - The world where everyone is happy might not be the best world. The truth is precious. You can learn and grow, and not fit in the society, but a fake society is worthless to be in.
- White Nights (Dostoevsky) - Real world still better than dreaming. Wake up and do it.
- Hitchhiker's Guide to the Galaxy - The world might just be gone in any moment... (in a fiction) do things that excites you.
- The Complete Notebooks (Albert Camus) - When life is hard on you for no purpose when you're young, you appreciate everything it has. Grace...`,

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
- Learn better (SHIFT, SeedStack, RV8, DataSciBlock)
- Work better (Company Brain, RocketMap, CareerAc)
- Connect better (Fync, HamsterHub)
- Understand systems (Coffee traceability, Direct democracy)`,

  now: `bigseed@bigf.me:~$ cat now.md

# What I'm Working On Now

## October 2026
- **SHIFT** - PassionSeed's 7-day build camp. Four rounds done, SHIFT[3] (Halloween edition) launching, and the first school SHIFT agreed with a school.
- **AfterSHIFT** - Alumni community: goal cards, daily standups, help when stuck, a progress feed, and shared whiteboards with a community calendar.
- **SeedStack** - AI coding toolkit for students that asks questions instead of giving answers.
- **Company Brain** - Running the company from plain Markdown that both people and AI agents read and edit.
- **RV8** - 8-bit CPU from 74HC chips, plus a hands-on circuit lab for beginners.

## Recent Highlights
- Pivoted PassionSeed from Seed Camp/TechSeed (nearly 800 students) to SHIFT
- Shipped multiplayer whiteboards, an admin ops console and a LINE OA inbox in PassionSeed web
- Rebuilt the mobile app SHIFT-first (v1.4 on TestFlight)
- RV8 student labs: 23/23 circuits pass automated tests
- VoiceKey: ran a blind AI design shootout for a mic-first keyboard
- **Berkeley SCET Startup Semester** (Spring 2026)

## Learning
- Self-Determination Theory: autonomy, competence, relatedness
- Running a company with AI agents and written context
- Distribution: Instagram comment funnels, Camphub, school partnerships
- Digital logic and CPU design for teaching

## Reading
- The Body Keeps the Score (trauma/healing)
- Re-reading Deep Work (focus in AI age)`,

  life: `bigseed@bigf.me:~$ cat life.md

# 🎨 Life & Reflections

## Visual Gallery
I've organized my moments into a postcard collection. 
Type 'gallery' or [Click Here to View the Life Postcards Gallery](/life)

## Places That Shaped Me
- **Bangkok, Thailand** - Where I learned to build. The chaos, the energy, the endless problems to solve.
- **San Francisco / Berkeley** - Where I learned to think bigger. Startup Semester (Spring 2026) changed my sense of what's possible.


## Music I'm Listening To
- **[Oasis](https://open.spotify.com/artist/2DaxqgrOhsnH0AHIqPcQ4n)** - Live Forever, Slide Away, Going Nowhere, Carry Us All, Falling Down
- **[Nirvana](https://open.spotify.com/artist/6olE6TJLqED3rqDCTT0FyM)** - Lounge Act, Heart-Shaped Box, All Apologies, In Bloom, Lithium
- **[Radiohead](https://open.spotify.com/artist/4Z8W4fZZBcVWTjM58EMTzi)** - Just, Black Star, Lucky ... honestly all of The Bends and OK Computer

> "Music is what feelings sound like." - These tracks fuel my late-night building sessions.

## Art & Reflections
- **Drawing & Sketching** - I reflect through drawing. Technical diagrams, architecture sketches, occasional portraits.
- **Photography** - Capturing moments of human connection, urban chaos, quiet mornings.
- **Writing** - Journaling about building, failing, learning. The messy process of becoming.

## Beliefs
- Education is the base of everything. don't push kids in factory, let them play, let them have fun learning.
- Everyone is capable of growth, and change. real learning shows that.
- Love is hard, but i love it

---
*"I'm glad we get to learn to be human, the most human of humankind. Pushed by AI taking our jobs, we gotta build real personality and sense of self."*`,

  work: `bigseed@bigf.me:~$ cat work.md

# 🛠 Work with Big

Websites, custom apps and business tools. Work directly with the builder.

Type 'work' or [Explore services & request a project call](/work)

## Tiers (THB)
- **Discovery sprint** — 49,000 · 3–5 working days · plan + clickable prototype
- **Launch build** — 120,000 · around 2 weeks · one focused customer journey
- **Business app** — 195,000 · around 3 weeks · workflow + staff admin + one integration
- **Platform build** — 265,000 · around 4–6 weeks · a scoped first version

Milestone payments: Discovery 50/50 · builds 40% kickoff → 40% demo → 20% launch.
Request a 30-minute intro in English or Thai. Scope and dates agreed before work starts.`,
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
  ls         - List projects by category (with visual cards)
  highlights - ✨ Show my best curated projects
  life       - 🎨 Personal side: places, art, music, reflections
  berkeley   - 🐻 UC Berkeley exchange financial & academic report
  work       - 🛠 Services, pricing & project call requests
  cat        - Display content pages (about, books, philosophy, now, work)
  cd         - Navigate to project directory
  ai         - 🤖 Chat with MiniMax M2.7 AI (e.g. ai what is bigf.me?)
  shadow     - 👻 Panning and focus onto the Shadow Catcher
  pretext    - ⚙️ Interactive pretext engine demo (text wrapping & layout)
  theme      - 🎨 Customize the terminal color theme
  clear      - Clear terminal
  help       - Show this help message

Pro tips:
  • Click ✨ HIGHLIGHTS for curated projects
  • Type 'ai <question>' to chat with MiniMax M2.7
  • Type 'life' to see the personal side`,
      };

    case 'whoami':
      return {
        output: `# Bunyasit Fang

**role**     :: Builder & Integrated Innovation Student
**status**   :: Bangkok, building PassionSeed · Berkeley SCET alum 🐻
**focus**    :: AI + Education + Hardware
**mission**  :: Fixing education in Thailand
**github**   :: [xb1g](https://github.com/xb1g)
**email**    :: bunyasit@passionseed.org

> "I build things I care deeply about. One day I'll retire to do art, but first, I must build the world I want to see."

I'm an Integrated Innovation student at Chulalongkorn University working at the intersection of technology, business, and philosophy. I've built 30+ projects ranging from ergonomic hardware to AI-powered education platforms. Right now I run SHIFT at PassionSeed — 7-day camps where Thai students build real projects and test them with real users — and build every tool behind it.`,
      };

    case 'ls': {
      const target = args[0] || currentPath;
      
      // Home directory
      if (target === '/' || target === '~' || target === 'home') {
        return {
          output: `drwxr-xr-x  categories/
drwxr-xr-x  pages/

Use 'ls [category]' to see projects:
  education, hardware, ai, client, sustainability, community, experiments`,
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

    case 'highlights':
      return {
        output: `__HIGHLIGHTS__`,
        highlightProjects: ['shift', 'seedstack', 'rv8', 'company-brain', 'longkeeb', 'hive'],
      };

    case 'gallery':
      return {
        output: `Opening life gallery...`,
        html: true,
      };

    case 'work':
      return {
        output: `Opening build plans...`,
        html: true,
      };

    case 'berkeley':
    case 'cal':
      return {
        output: `Opening UC Berkeley Exchange Report...`,
        html: true,
      };

    case 'shadow':
    case 'shadows':
      return {
        output: `Panning to Workspace 04: Shadow Catcher...`,
      };

    case 'clear':
    case 'cls':
      return {
        output: '__CLEAR__',
      };

    case 'theme':
      return {
        output: '__THEME_PICKER__',
      };

    case 'pretext': {
      const textToMeasure = args.length > 0 ? args.join(' ') : "Pretext side-steps the need for DOM measurements (e.g. getBoundingClientRect, offsetHeight), which trigger layout reflow, one of the most expensive operations in the browser. It implements its own text measurement logic, using the browsers' own font engine as ground truth (very AI-friendly iteration method).";
      return {
        output: `__PRETEXT__${textToMeasure}`,
      };
    }

    case 'ai':
    case 'ask':
    case 'chat': {
      const query = args.join(' ').trim();
      if (!query) {
        return {
          output: `Usage: ai <question>\n\nExamples:\n  ai who is Bunyasit?\n  ai what projects have you built?\n  ai tell me about PassionSeed`,
        };
      }
      return {
        output: `__AI__${query}`,
      };
    }

    case '':
      return { output: '' };

    default:
      return {
        output: `${command}: command not found. Type 'help' for available commands.`,
        error: true,
      };
  }
}
